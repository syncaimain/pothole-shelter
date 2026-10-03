import type {Outcome} from './domain.ts'
import {hashOf, sha256} from './hash.ts'
import type {ResolutionMapping} from './mapping.ts'
import {closedAt, createdAt, decidingComplaint, feralAt, isClosed} from './outcome.ts'
import type {RawRecord} from './soda.ts'
import {daysBetween, longDate, toIso} from './time.ts'

// Original name lists. Affectionate, never about the people who report or repair.
const FIRST = [
  'Pebble', 'Gravel', 'Cobble', 'Tarmac', 'Dimple', 'Puddle', 'Rumble', 'Biscuit', 'Pickle', 'Waffle',
  'Noodle', 'Pretzel', 'Dumpling', 'Bagel', 'Knish', 'Pierogi', 'Arepa', 'Momo', 'Bao', 'Churro',
  'Mochi', 'Samosa', 'Empanada', 'Latke', 'Bialy', 'Crumpet', 'Scone', 'Muffin', 'Nugget', 'Sprocket',
  'Button', 'Pothos', 'Clover', 'Juniper', 'Marble', 'Domino', 'Pip', 'Tumble', 'Wobble', 'Ripple',
]
const LAST = [
  'Cratersworth', 'McDivot', 'Von Bump', 'Asphaltine', 'Dipley', 'Hollowell', 'Rutherford', 'Bumpus',
  'Dent', 'Gully', 'Sinkwell', 'Patchett', 'Cobbleton', 'Gravelly', 'Puddington', 'Tarbuck',
  'Holloway', 'Dimpleton', 'Ridgeway', 'Rumbleton',
]

const pick = <T>(list: readonly T[], hex: string) => list[parseInt(hex, 16) % list.length]!

/** Deterministic name seeded by the first complaint's key. */
export function petName(firstKey: string): string {
  const h = sha256(`pothole-name:${firstKey}`)
  return `${pick(FIRST, h.slice(0, 8))} ${pick(LAST, h.slice(8, 16))}`
}

export const petSlug = (name: string, firstKey: string) =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${firstKey}`

/**
 * Temperament from complaint count and age (days from first report to close, or to now
 * while open). Three or more complaints makes a grumpy pet, as the spec suggests.
 */
export function temperament(complaintCount: number, ageDays: number): string {
  if (complaintCount >= 3) return 'grumpy'
  if (complaintCount === 2) return 'sociable'
  if (ageDays <= 7) return 'bouncy'
  if (ageDays <= 30) return 'curious'
  if (ageDays < 60) return 'patient'
  return 'independent'
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const title = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase())

/** Street names only — never incident_address, which can carry a house number. */
export function place(raw: RawRecord) {
  const street = str(raw.street_name) ?? str(raw.intersection_street_1)
  const cross = str(raw.cross_street_1) ?? str(raw.intersection_street_2)
  const cross2 = str(raw.cross_street_2)
  return {street, cross, cross2}
}

export function roundedLocation(raw: RawRecord): {lat: number; lng: number} | undefined {
  const lat = Number(raw.latitude)
  const lng = Number(raw.longitude)
  if (raw.latitude === undefined || raw.longitude === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) return undefined
  return {lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000}
}

/** The fact-template bio. Every date and number in it comes straight from the records. */
export function templateBio(name: string, complaints: readonly RawRecord[], outcome: Outcome, deciding: RawRecord): string {
  const first = complaints[0]!
  const {street, cross, cross2} = place(first)
  const reported = createdAt(first)
  const where = street
    ? `on ${title(street)}${cross && cross2 ? ` between ${title(cross)} and ${title(cross2)}` : cross ? ` near ${title(cross)}` : ''}`
    : 'at a spot the record does not name'
  const board = str(first.community_board)
  const parts = [
    `${name} was first reported ${reported ? `on ${longDate(reported)} ` : ''}${where}${board ? `, in Community Board ${board.replace(/\s+QUEENS$/, '')}, Queens` : ''}.`,
  ]
  if (complaints.length > 1) parts.push(`The city has ${complaints.length} complaints about this spot.`)

  const note = str(deciding.resolution_description)
  const closed = closedAt(deciding)
  const closedOn = closed ? ` on ${longDate(closed)}` : ''
  const days = reported && closed ? daysBetween(reported, closed) : undefined
  switch (outcome) {
    case 'adopted':
      parts.push(`The city's note${closedOn}: "${note}"`)
      parts.push(
        `${days !== undefined ? `After ${days} ${days === 1 ? 'day' : 'days'} in the shelter, ` : ''}${name} has been adopted into forever pavement. Congratulations, ${street ? title(street) : 'Queens'}!`,
      )
      break
    case 'ghost':
      parts.push(`The city's note${closedOn}: "${note}"`)
      parts.push(`${name} now lives in the ghost hall: reported, but not found when the city came to look.`)
      break
    case 'transferred':
      parts.push(`The city's note${closedOn}: "${note}"`)
      parts.push(`${name} has been transferred and is in someone else's care now.`)
      break
    case 'unmapped':
      parts.push(`The record was closed${closedOn}${note ? ` with the note: "${note}"` : ' without a note'}`)
      parts.push(`We haven't worked out what that means for ${name} yet, so it waits in the Unmapped room.`)
      break
    case 'feral': {
      const f = feralAt(deciding)
      parts.push(
        `The city record is still ${str(deciding.status)?.toLowerCase() ?? 'open'}. ${name} passed 60 days in the shelter${f ? ` on ${longDate(f)}` : ''} and has gone feral, but it is still waiting for its forever pavement.`,
      )
      break
    }
    case 'shelter':
      parts.push(`The city record is still ${str(deciding.status)?.toLowerCase() ?? 'open'}. ${name} is waiting in the shelter for its forever pavement.`)
      break
  }
  return parts.join(' ')
}

/** Everything the sync derives for a pet. Compared field by field to decide whether to write. */
export interface PetFields {
  name: string
  slug: {_type: 'slug'; current: string}
  temperament: string
  outcome: Outcome
  complaints: {_type: 'reference'; _key: string; _ref: string}[]
  complaintCount: number
  firstReportedAt?: string
  lastEventAt?: string
  street?: string
  crossStreet?: string
  communityBoard?: string
  location?: {_type: 'geopoint'; lat: number; lng: number}
  hasCoordinates: boolean
}

export interface DerivedPet {
  fields: PetFields
  /** Template bio and the fingerprint of the facts it was built from. */
  bio: string
  factsHash: string
  deciding: RawRecord
  mapping?: ResolutionMapping
}

/** `complaints` must be sorted by created date, earliest first; the first one names the pet. */
export function derivePet(
  firstKey: string,
  complaints: readonly {id: string; raw: RawRecord}[],
  mappings: readonly ResolutionMapping[],
  now: Date,
): DerivedPet {
  const raws = complaints.map((c) => c.raw)
  const first = raws[0]!
  const name = petName(firstKey)
  const decided = decidingComplaint(raws, mappings, now)
  const reported = createdAt(first)
  const end = raws.every(isClosed) ? closedAt(decided.raw) : now
  const age = reported && end ? daysBetween(reported, end) : 0

  const located = raws.map(roundedLocation).find(Boolean)
  const {street, cross} = place(first)
  const recordDates = raws.flatMap((r) => [createdAt(r), closedAt(r)]).filter((d): d is Date => !!d)
  if (decided.outcome === 'feral') {
    const f = feralAt(decided.raw)
    if (f) recordDates.push(f)
  }
  const lastEventAt = recordDates.length ? new Date(Math.max(...recordDates.map((d) => d.getTime()))) : undefined

  const fields: PetFields = {
    name,
    slug: {_type: 'slug', current: petSlug(name, firstKey)},
    temperament: temperament(raws.length, age),
    outcome: decided.outcome,
    complaints: complaints.map((c) => ({_type: 'reference', _key: c.raw.unique_key, _ref: c.id})),
    complaintCount: raws.length,
    firstReportedAt: reported && toIso(reported),
    lastEventAt: lastEventAt && toIso(lastEventAt),
    street,
    crossStreet: cross,
    communityBoard: str(first.community_board),
    location: located && {_type: 'geopoint', ...located},
    hasCoordinates: !!located,
  }
  const bio = templateBio(name, raws, decided.outcome, decided.raw)
  return {fields, bio, factsHash: hashOf({bio}), deciding: decided.raw, mapping: decided.mapping}
}

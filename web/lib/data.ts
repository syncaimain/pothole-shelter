// Every read the public site makes. Live data comes from the public dataset through the
// CDN, with no token. If Sanity fails, each function answers from the committed
// last-good snapshot and says so, so a page never fails silently or goes blank.
import {createClient} from '@sanity/client'
import {OUTCOMES, type Outcome} from '@pothole/sync/domain'
import {cacheLife} from 'next/cache'
import {PUBLIC_ADOPTION_FILTER} from './adopt'
import {CARD, DETAIL, RUN, type FallbackSnapshot, type MappingRow, type PetCard, type PetDetail, type SyncRunRow} from './queries'

export const PROJECT_ID = 'fixjy07h'
export const DATASET = 'production'

const client = createClient({projectId: PROJECT_ID, dataset: DATASET, apiVersion: '2025-02-19', useCdn: true, perspective: 'published'})

export interface Loaded<T> {
  data: T
  source: 'live' | 'snapshot'
  /** Set when live data failed and the snapshot answered instead. */
  liveError?: string
  snapshotAt?: string
}

let snapshot: Promise<FallbackSnapshot> | undefined
const loadSnapshot = () =>
  (snapshot ??= import('../data/fallback.json').then((m) => {
    const s = m.default as unknown as FallbackSnapshot
    // Same rule as the live queries: merged pets are not listed (their own page still resolves).
    return {...s, listed: s.pets.filter((p) => !p.mergedInto)}
  }))

async function load<T>(live: () => Promise<T>, fromSnapshot: (s: FallbackSnapshot) => T): Promise<Loaded<T>> {
  try {
    // Lets tests (and a rehearsal before a demo) prove the snapshot path without breaking Sanity.
    if (process.env.SHELTER_FORCE_SNAPSHOT === '1') throw new Error('live data switched off (SHELTER_FORCE_SNAPSHOT)')
    return {data: await live(), source: 'live'}
  } catch (err) {
    const s = await loadSnapshot()
    return {data: fromSnapshot(s), source: 'snapshot', liveError: err instanceof Error ? err.message : String(err), snapshotAt: s.exportedAt}
  }
}

// --- Gallery -----------------------------------------------------------------------

export const PAGE_SIZE = 48
export const AGE_BUCKETS = {
  new: {label: 'Under a week', min: 0, max: 7},
  weeks: {label: '1–8 weeks', min: 7, max: 60},
  months: {label: '2–12 months', min: 60, max: 365},
  years: {label: 'Over a year', min: 365, max: Infinity},
} as const
export type AgeBucket = keyof typeof AGE_BUCKETS

const isOutcome = (v: unknown): v is Outcome => OUTCOMES.some((o) => o.value === v)
const isAge = (v: unknown): v is AgeBucket => typeof v === 'string' && v in AGE_BUCKETS

export interface GalleryQuery {
  outcome?: Outcome
  age?: AgeBucket
  page: number
}

/** Untrusted search params in, whitelisted filters out. Nothing typed reaches GROQ as text. */
export function parseGallery(sp: Record<string, string | string[] | undefined>): GalleryQuery {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const page = Math.max(1, Math.min(1000, Number.parseInt(one(sp.page) ?? '1', 10) || 1))
  const outcome = one(sp.outcome)
  const age = one(sp.age)
  return {outcome: isOutcome(outcome) ? outcome : undefined, age: isAge(age) ? age : undefined, page}
}

const DAY_S = 86_400

export async function getGallery(q: GalleryQuery): Promise<Loaded<{pets: PetCard[]; total: number}>> {
  'use cache'
  cacheLife('minutes')
  const from = (q.page - 1) * PAGE_SIZE
  const bucket = q.age ? AGE_BUCKETS[q.age] : undefined
  return load(
    async () => {
      const filters = ['_type == "pothole" && !defined(mergedInto)']
      if (q.outcome) filters.push('outcome == $outcome')
      if (bucket) {
        filters.push('dateTime(now()) - dateTime(firstReportedAt) >= $minS')
        if (Number.isFinite(bucket.max)) filters.push('dateTime(now()) - dateTime(firstReportedAt) < $maxS')
      }
      const where = filters.join(' && ')
      const params = {outcome: q.outcome ?? null, minS: (bucket?.min ?? 0) * DAY_S, maxS: Number.isFinite(bucket?.max) ? bucket!.max * DAY_S : 0}
      return client.fetch<{pets: PetCard[]; total: number}>(
        `{"pets": *[${where}] | order(firstReportedAt desc) [${from}...${from + PAGE_SIZE}]{${CARD}}, "total": count(*[${where}])}`,
        params,
      )
    },
    (s) => {
      const now = Date.now()
      const pets = s.listed!
        .filter((p) => !q.outcome || p.outcome === q.outcome)
        .filter((p) => {
          if (!bucket || !p.firstReportedAt) return !bucket
          const days = (now - Date.parse(p.firstReportedAt)) / 86_400_000
          return days >= bucket.min && days < bucket.max
        })
        .sort((a, b) => (b.firstReportedAt ?? '').localeCompare(a.firstReportedAt ?? ''))
      return {pets: pets.slice(from, from + PAGE_SIZE), total: pets.length}
    },
  )
}

/**
 * One feral pet per ISO week, picked by the calendar, not by merit: the week number indexes
 * the ferals in order of first report. Deterministic, so every visitor sees the same pet.
 */
export async function getFeralOfTheWeek(): Promise<Loaded<(PetCard & {daysWaiting?: number}) | null>> {
  'use cache'
  cacheLife('hours')
  // The clock is read here, inside the cached scope, so the page itself can prerender.
  const now = Date.now()
  const weekKey = Math.floor((now / 86_400_000 + 3) / 7)
  const pick = (ferals: PetCard[]) => {
    const pet = ferals.length ? ferals[weekKey % ferals.length]! : null
    return pet && {...pet, daysWaiting: pet.firstReportedAt ? Math.floor((now - Date.parse(pet.firstReportedAt)) / 86_400_000) : undefined}
  }
  return load(
    async () => pick(await client.fetch<PetCard[]>(`*[_type == "pothole" && !defined(mergedInto) && outcome == "feral"] | order(firstReportedAt asc, slug.current asc){${CARD}}`)),
    (s) => pick(s.listed!.filter((p) => p.outcome === 'feral').sort((a, b) => (a.firstReportedAt ?? '').localeCompare(b.firstReportedAt ?? '') || a.slug.localeCompare(b.slug))),
  )
}

export async function getStats(): Promise<Loaded<{total: number; strays: number; byOutcome: Record<Outcome, number>}>> {
  'use cache'
  cacheLife('minutes')
  const shape = (total: number, strays: number, counts: Partial<Record<Outcome, number>>) => ({
    total,
    strays,
    byOutcome: Object.fromEntries(OUTCOMES.map((o) => [o.value, counts[o.value] ?? 0])) as Record<Outcome, number>,
  })
  return load(
    async () => {
      const r = await client.fetch<{total: number; strays: number; counts: Record<string, number>}>(
        `{"total": count(*[_type == "pothole" && !defined(mergedInto)]), "strays": count(*[_type == "pothole" && !defined(mergedInto) && hasCoordinates == false]),
          "counts": {${OUTCOMES.map((o) => `"${o.value}": count(*[_type == "pothole" && !defined(mergedInto) && outcome == "${o.value}"])`).join(', ')}}}`,
      )
      return shape(r.total, r.strays, r.counts)
    },
    (s) => {
      const counts: Partial<Record<Outcome, number>> = {}
      for (const p of s.listed!) counts[p.outcome] = (counts[p.outcome] ?? 0) + 1
      return shape(s.listed!.length, s.listed!.filter((p) => !p.hasCoordinates).length, counts)
    },
  )
}

// --- Single pet, strays, ghosts ------------------------------------------------------

export async function getPet(slug: string): Promise<Loaded<PetDetail | null>> {
  'use cache'
  cacheLife('minutes')
  return load(
    async () => (await client.fetch<PetDetail | null>(`*[_type == "pothole" && slug.current == $slug][0]{${DETAIL}}`, {slug})) ?? null,
    (s) => s.pets.find((p) => p.slug === slug) ?? null,
  )
}

export async function getStrays(): Promise<Loaded<PetCard[]>> {
  'use cache'
  cacheLife('minutes')
  return load(
    () => client.fetch<PetCard[]>(`*[_type == "pothole" && !defined(mergedInto) && hasCoordinates == false] | order(street asc, firstReportedAt desc){${CARD}}`),
    (s) => s.listed!.filter((p) => !p.hasCoordinates).sort((a, b) => (a.street ?? '').localeCompare(b.street ?? '') || (b.firstReportedAt ?? '').localeCompare(a.firstReportedAt ?? '')),
  )
}

export async function getGhosts(): Promise<Loaded<PetCard[]>> {
  'use cache'
  cacheLife('minutes')
  return load(
    () => client.fetch<PetCard[]>(`*[_type == "pothole" && !defined(mergedInto) && outcome == "ghost"] | order(lastEventAt desc){${CARD}}`),
    (s) => s.listed!.filter((p) => p.outcome === 'ghost').sort((a, b) => (b.lastEventAt ?? '').localeCompare(a.lastEventAt ?? '')),
  )
}

// --- Sync, mappings, office ------------------------------------------------------------

export interface SyncStatus {
  runs: SyncRunRow[]
  lastGood?: SyncRunRow
  latest?: SyncRunRow
}

export async function getSyncStatus(): Promise<Loaded<SyncStatus>> {
  'use cache'
  cacheLife('minutes')
  const shape = (runs: SyncRunRow[]): SyncStatus => ({runs, latest: runs[0], lastGood: runs.find((r) => r.state === 'succeeded')})
  return load(
    async () => shape(await client.fetch<SyncRunRow[]>(`*[_type == "syncRun"] | order(startedAt desc)[0...30]{${RUN}}`)),
    (s) => shape(s.runs),
  )
}

export interface UnmappedPhrase {
  phrase: string
  pets: {name: string; slug: string}[]
}

export async function getMappings(): Promise<Loaded<{mappings: MappingRow[]; unmapped: UnmappedPhrase[]}>> {
  'use cache'
  cacheLife('minutes')
  const group = (rows: {name: string; slug: string; phrases: (string | null)[]}[]) => {
    const by = new Map<string, UnmappedPhrase>()
    for (const r of rows) {
      for (const phrase of new Set(r.phrases.map((p) => p ?? '(no resolution text)'))) {
        const u = by.get(phrase) ?? {phrase, pets: []}
        u.pets.push({name: r.name, slug: r.slug})
        by.set(phrase, u)
      }
    }
    return [...by.values()].sort((a, b) => b.pets.length - a.pets.length)
  }
  return load(
    async () => {
      const r = await client.fetch<{mappings: MappingRow[]; unmapped: {name: string; slug: string; phrases: (string | null)[]}[]}>(
        `{"mappings": *[_type == "resolutionMapping"] | order(outcome asc, pattern asc){pattern, outcome, rationale},
          "unmapped": *[_type == "pothole" && !defined(mergedInto) && outcome == "unmapped"]{name, "slug": slug.current, "phrases": complaints[]->raw.resolution_description}}`,
      )
      return {mappings: r.mappings, unmapped: group(r.unmapped)}
    },
    (s) => ({
      mappings: s.mappings,
      unmapped: group(s.listed!.filter((p) => p.outcome === 'unmapped').map((p) => ({name: p.name, slug: p.slug, phrases: p.complaints.map((c) => c.resolution ?? null)}))),
    }),
  )
}

export interface OfficeView {
  proposedClusters: number
  submittedAdoptions: number
  recentChanges: {name: string; slug: string; from: string; to: string; at: string; kind: string}[]
}

/** The public, read-only mirror of the Shelter Office queues. Never exposes unapproved adoption text. */
export async function getOffice(): Promise<Loaded<OfficeView>> {
  'use cache'
  cacheLife('minutes')
  return load(
    async () => {
      const r = await client.fetch<{proposedClusters: number; submittedAdoptions: number; latest: {name: string; slug: string; e: {from: string; to: string; at: string; cause: {kind: string}} | null}[]}>(
        `{"proposedClusters": count(*[_type == "clusterDecision" && decision == "proposed"]),
          "submittedAdoptions": count(*[_type == "adoption" && moderation == "submitted"]),
          "latest": *[_type == "pothole" && !defined(mergedInto) && defined(events)]{name, "slug": slug.current, "e": events[-1]} | order(e.at desc)[0...25]}`,
      )
      return {
        proposedClusters: r.proposedClusters,
        submittedAdoptions: r.submittedAdoptions,
        recentChanges: r.latest.filter((x) => x.e).map((x) => ({name: x.name, slug: x.slug, from: x.e!.from, to: x.e!.to, at: x.e!.at, kind: x.e!.cause.kind})),
      }
    },
    (s) => ({
      proposedClusters: 0,
      submittedAdoptions: 0,
      recentChanges: s.listed!
        .flatMap((p) => (p.events.length ? [{name: p.name, slug: p.slug, e: p.events[p.events.length - 1]!}] : []))
        .sort((a, b) => b.e.at.localeCompare(a.e.at))
        .slice(0, 25)
        .map(({name, slug, e}) => ({name, slug, from: e.from, to: e.to, at: e.at, kind: e.cause.kind})),
    }),
  )
}

// --- Adoption notes ------------------------------------------------------------------

export interface ApprovedNote {
  displayName: string
  message: string
  moderatedAt?: string
}

/** Only notes a person approved (see lib/adopt.ts). Pending notes have private ids and never appear. */
export async function getApprovedNotes(petId: string): Promise<ApprovedNote[]> {
  'use cache'
  cacheLife('minutes')
  try {
    if (process.env.SHELTER_FORCE_SNAPSHOT === '1') return []
    return await client.fetch<ApprovedNote[]>(
      `*[${PUBLIC_ADOPTION_FILTER} && pothole._ref == $petId] | order(moderatedAt desc)[0...20]{displayName, message, moderatedAt}`,
      {petId},
    )
  } catch {
    return [] // Notes are a nicety; the pet page never fails because of them.
  }
}

// --- Map ---------------------------------------------------------------------------------

export async function getMapPoints(): Promise<Loaded<{lat: number; lng: number; name: string; slug: string; outcome: string}[]>> {
  'use cache'
  cacheLife('minutes')
  return load(
    () =>
      client.fetch(
        `*[_type == "pothole" && !defined(mergedInto) && hasCoordinates == true && defined(location)]{"lat": location.lat, "lng": location.lng, name, "slug": slug.current, outcome}`,
      ),
    (s) => s.listed!.filter((p) => p.location).map((p) => ({lat: p.location!.lat, lng: p.location!.lng, name: p.name, slug: p.slug, outcome: p.outcome})),
  )
}

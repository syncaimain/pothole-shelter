import {ids, type Outcome} from './domain.ts'
import {initialHistory, transitionEvent, type StatusEvent} from './events.ts'
import {hashOf, sameData} from './hash.ts'
import type {ResolutionMapping} from './mapping.ts'
import {createdAt, isClosed} from './outcome.ts'
import {derivePet, uniquePetNames, type PetFields} from './pets.ts'
import {inScope, rowUrl, splitRow, type RawRecord, type SodaRow} from './soda.ts'

export interface ComplaintDoc {
  _id: string
  _type: 'complaint311'
  raw: RawRecord
  rawHash: string
  sourceUrl: string
  sourceUpdatedAt?: string
  firstSyncedAt: string
  syncedAt: string
}

export interface BioMeta {
  source?: 'template' | 'model'
  model?: string
  guardPassed?: boolean
  factsHash?: string
  generatedAt?: string
}

/** Only each event's _key is needed to avoid appending it twice. */
export type StoredPet = {_id: string; bio?: string; bioMeta?: BioMeta; events?: Pick<StatusEvent, '_key'>[]; mergedInto?: string} & Partial<PetFields>

export interface SyncState {
  complaints: Map<string, ComplaintDoc>
  pets: Map<string, StoredPet>
  mappings: ResolutionMapping[]
  /** Cluster decisions a person approved (decidedBy is a person id); the sync merges these. */
  approvedClusters?: {_id: string; complaintIds: string[]}[]
  /** Socrata :updated_at high-water mark from the last successful run. */
  watermark?: string
}

export type PetDoc = {_id: string; _type: 'pothole'; bio: string; bioMeta: BioMeta; events: StatusEvent[]} & PetFields

export interface PetPatch {
  id: string
  set: Record<string, unknown>
  unset: string[]
  /** Status events to append to the pet's events array. Never replaces existing entries. */
  append: StatusEvent[]
}

export interface SyncCounts {
  fetched: number
  created: number
  updated: number
  unchanged: number
  outOfScope: number
  unmapped: number
  petsCreated: number
  petsUpdated: number
  statusEvents: number
}

export interface Plan {
  complaints: ComplaintDoc[]
  petCreates: PetDoc[]
  petPatches: PetPatch[]
  counts: SyncCounts
  watermark?: string
}

export const isEmptyPlan = (p: Plan) =>
  p.complaints.length + p.petCreates.length + p.petPatches.length === 0

const PET_FIELD_KEYS: (keyof PetFields)[] = [
  'name', 'slug', 'temperament', 'outcome', 'complaints', 'complaintCount', 'firstReportedAt',
  'lastEventAt', 'street', 'crossStreet', 'communityBoard', 'location', 'hasCoordinates',
]

interface PlanInput {
  state: SyncState
  rows: readonly SodaRow[]
  now: Date
  runId: string
}

/**
 * Pure: decides every write for one sync. Applying the plan and planning again with
 * the same rows and clock must give an empty plan; the tests hold it to that.
 */
export function planSync({state, rows, now, runId}: PlanInput): Plan {
  const nowIso = now.toISOString()
  const counts: SyncCounts = {fetched: rows.length, created: 0, updated: 0, unchanged: 0, outOfScope: 0, unmapped: 0, petsCreated: 0, petsUpdated: 0, statusEvents: 0}

  // 1. Raw records: write only when the hash of the record itself changes.
  const latest = new Map<string, SodaRow>()
  for (const row of rows) latest.set(row.unique_key, row) // offset paging can repeat a row; last wins
  const complaintWrites: ComplaintDoc[] = []
  const changed = new Map<string, {id: string; before: RawRecord; after: RawRecord}>()
  const merged = new Map(state.complaints)
  let watermark = state.watermark
  for (const row of latest.values()) {
    const {raw, sourceUpdatedAt} = splitRow(row)
    if (sourceUpdatedAt && (!watermark || sourceUpdatedAt > watermark)) watermark = sourceUpdatedAt
    const id = ids.complaint(raw.unique_key)
    const existing = state.complaints.get(id)
    if (!existing && !inScope(raw, now)) {
      counts.outOfScope++
      continue
    }
    const rawHash = hashOf(raw)
    if (existing?.rawHash === rawHash) {
      counts.unchanged++
      continue
    }
    const doc: ComplaintDoc = {
      _id: id,
      _type: 'complaint311',
      raw,
      rawHash,
      sourceUrl: rowUrl(raw.unique_key),
      sourceUpdatedAt,
      firstSyncedAt: existing?.firstSyncedAt ?? nowIso,
      syncedAt: nowIso,
    }
    complaintWrites.push(doc)
    merged.set(id, doc)
    if (existing) {
      counts.updated++
      changed.set(id, {id, before: existing.raw, after: raw})
    } else {
      counts.created++
    }
  }

  // 2. Which complaints belong to which pet. A cluster a person approved sends all its
  //    complaints to one survivor: the pet of its earliest complaint. Otherwise existing pets
  //    keep their members, and any complaint not in a pet becomes its own pet.
  const survivorOf = new Map<string, {pet: string; decision: string}>()
  for (const cluster of [...(state.approvedClusters ?? [])].sort((a, b) => a._id.localeCompare(b._id))) {
    const inSync = cluster.complaintIds.filter((id) => merged.has(id) && !survivorOf.has(id))
    if (inSync.length < 2) continue
    const earliest = [...inSync].sort((a, b) => (createdAt(merged.get(a)!.raw)?.getTime() ?? 0) - (createdAt(merged.get(b)!.raw)?.getTime() ?? 0))[0]!
    const pet = ids.pothole(merged.get(earliest)!.raw.unique_key)
    for (const id of inSync) survivorOf.set(id, {pet, decision: cluster._id})
  }
  const home = (complaintId: string, fallback: string) => survivorOf.get(complaintId)?.pet ?? fallback

  const members = new Map<string, string[]>()
  const add = (pet: string, complaintId: string) => {
    const list = members.get(pet) ?? []
    if (!list.includes(complaintId)) list.push(complaintId)
    members.set(pet, list)
  }
  const assigned = new Set<string>()
  for (const pet of state.pets.values()) {
    if (!members.has(pet._id)) members.set(pet._id, [])
    for (const ref of (pet.complaints ?? []).map((c) => c._ref).filter((r) => merged.has(r))) {
      add(home(ref, pet._id), ref)
      assigned.add(ref)
    }
  }
  for (const c of merged.values()) {
    if (!assigned.has(c._id)) add(home(c._id, ids.pothole(c.raw.unique_key)), c._id)
  }
  const mergeDecisionFor = (petId: string) => [...survivorOf.values()].find((s) => s.pet === petId)?.decision

  // 3. Recompute every pet (the 60-day rule needs that even when no record changed).
  const petCreates: PetDoc[] = []
  const petPatches: PetPatch[] = []
  // Every pet ever created keeps its place in the naming order, merged ones included.
  const names = uniquePetNames([...new Set([...state.pets.keys(), ...members.keys()])].map((id) => id.replace(/^pothole-/, '')))
  for (const [petId, memberIds] of members) {
    if (memberIds.length === 0) {
      // Every complaint of this pet went to an approved cluster's survivor. The pet is kept,
      // with its history, and marked as merged rather than deleted.
      const stored = state.pets.get(petId)
      const into = (stored?.complaints ?? []).map((c) => survivorOf.get(c._ref)?.pet).find(Boolean)
      if (stored && into && stored.mergedInto !== into) {
        petPatches.push({id: petId, set: {mergedInto: into}, unset: [], append: []})
        counts.petsUpdated++
      }
      continue
    }
    const complaints = memberIds
      .map((id) => ({id, raw: merged.get(id)!.raw}))
      .sort((a, b) => (createdAt(a.raw)?.getTime() ?? 0) - (createdAt(b.raw)?.getTime() ?? 0))
    const firstKey = petId.replace(/^pothole-/, '')
    const derived = derivePet(firstKey, complaints, state.mappings, now, names.get(firstKey))
    counts.unmapped += complaints.filter((c) => isClosed(c.raw) && derived.fields.outcome === 'unmapped').length

    const stored = state.pets.get(petId)
    const templateMeta: BioMeta = {source: 'template', guardPassed: true, factsHash: derived.factsHash}
    if (!stored) {
      const history = initialHistory(petId, complaints[0]!.raw, derived, runId)
      petCreates.push({_id: petId, _type: 'pothole', ...derived.fields, bio: derived.bio, bioMeta: templateMeta, events: history})
      counts.petsCreated++
      counts.statusEvents += history.length
      continue
    }

    const set: Record<string, unknown> = {}
    const unset: string[] = []
    for (const key of PET_FIELD_KEYS) {
      const want = derived.fields[key]
      if (want === undefined) {
        if (stored[key] !== undefined) unset.push(key)
      } else if (!sameData(stored[key], want)) {
        set[key] = want
      }
    }
    // A model-restyled bio survives until the facts under it change; then the template returns.
    const keepModelBio = stored.bioMeta?.source === 'model' && stored.bioMeta.factsHash === derived.factsHash
    if (!keepModelBio && (stored.bio !== derived.bio || !sameData(stored.bioMeta, templateMeta))) {
      set.bio = derived.bio
      set.bioMeta = templateMeta
    }
    // Outcome changes are recorded by appending to the pet's own event array, in the same
    // patch that changes the outcome, so the two can never disagree.
    const append: StatusEvent[] = []
    if (stored.outcome && stored.outcome !== derived.fields.outcome) {
      const petChanges = memberIds.map((id) => changed.get(id)).filter((c) => !!c)
      const e = transitionEvent(petId, stored.outcome as Outcome, derived, petChanges, now, runId, mergeDecisionFor(petId))
      if (!(stored.events ?? []).some((x) => x._key === e._key)) append.push(e)
    }

    if (Object.keys(set).length || unset.length || append.length) {
      petPatches.push({id: petId, set, unset, append})
      counts.petsUpdated++
      counts.statusEvents += append.length
    }
  }

  return {complaints: complaintWrites, petCreates, petPatches, counts, watermark}
}

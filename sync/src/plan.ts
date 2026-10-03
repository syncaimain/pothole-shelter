import {ids, type Outcome} from './domain.ts'
import {initialHistory, transitionEvent, type StatusEventDoc} from './events.ts'
import {hashOf, sameData} from './hash.ts'
import type {ResolutionMapping} from './mapping.ts'
import {createdAt, isClosed} from './outcome.ts'
import {derivePet, type PetFields} from './pets.ts'
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

export type StoredPet = {_id: string; bio?: string; bioMeta?: BioMeta} & Partial<PetFields>

export interface SyncState {
  complaints: Map<string, ComplaintDoc>
  pets: Map<string, StoredPet>
  mappings: ResolutionMapping[]
  eventIds: Set<string>
  /** Socrata :updated_at high-water mark from the last successful run. */
  watermark?: string
}

export type PetDoc = {_id: string; _type: 'pothole'; bio: string; bioMeta: BioMeta} & PetFields

export interface PetPatch {
  id: string
  set: Record<string, unknown>
  unset: string[]
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
  events: StatusEventDoc[]
  counts: SyncCounts
  watermark?: string
}

export const isEmptyPlan = (p: Plan) =>
  p.complaints.length + p.petCreates.length + p.petPatches.length + p.events.length === 0

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

  // 2. Which complaints belong to which pet. Existing pets keep their members (that is
  //    where approved cluster merges live); any complaint not in a pet becomes its own pet.
  const members = new Map<string, string[]>()
  const assigned = new Set<string>()
  for (const pet of state.pets.values()) {
    const refs = (pet.complaints ?? []).map((c) => c._ref).filter((r) => merged.has(r))
    members.set(pet._id, refs)
    refs.forEach((r) => assigned.add(r))
  }
  for (const c of merged.values()) {
    if (!assigned.has(c._id)) members.set(ids.pothole(c.raw.unique_key), [c._id])
  }

  // 3. Recompute every pet (the 60-day rule needs that even when no record changed).
  const petCreates: PetDoc[] = []
  const petPatches: PetPatch[] = []
  const events: StatusEventDoc[] = []
  for (const [petId, memberIds] of members) {
    if (memberIds.length === 0) continue
    const complaints = memberIds
      .map((id) => ({id, raw: merged.get(id)!.raw}))
      .sort((a, b) => (createdAt(a.raw)?.getTime() ?? 0) - (createdAt(b.raw)?.getTime() ?? 0))
    const firstKey = petId.replace(/^pothole-/, '')
    const derived = derivePet(firstKey, complaints, state.mappings, now)
    counts.unmapped += complaints.filter((c) => isClosed(c.raw) && derived.fields.outcome === 'unmapped').length

    const stored = state.pets.get(petId)
    const templateMeta: BioMeta = {source: 'template', guardPassed: true, factsHash: derived.factsHash}
    if (!stored) {
      petCreates.push({_id: petId, _type: 'pothole', ...derived.fields, bio: derived.bio, bioMeta: templateMeta})
      events.push(...initialHistory(petId, complaints[0]!.raw, derived, runId))
      counts.petsCreated++
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
    if (Object.keys(set).length || unset.length) {
      petPatches.push({id: petId, set, unset})
      counts.petsUpdated++
    }

    if (stored.outcome && stored.outcome !== derived.fields.outcome) {
      const petChanges = memberIds.map((id) => changed.get(id)).filter((c) => !!c)
      events.push(transitionEvent(petId, stored.outcome as Outcome, derived, petChanges, now, runId))
    }
  }

  const newEvents = events.filter((e) => !state.eventIds.has(e._id))
  counts.statusEvents = newEvents.length
  return {complaints: complaintWrites, petCreates, petPatches, events: newEvents, counts, watermark}
}

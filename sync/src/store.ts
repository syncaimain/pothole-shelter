import type {ComplaintDoc, Plan, StoredPet, SyncCounts, SyncState} from './plan.ts'
import type {ResolutionMapping} from './mapping.ts'

export interface SnapshotPageRef {
  _key: string
  file: string
  sha256: string
  rows: number
  retrievedAt: string
}

export interface SyncRunDoc {
  _id: string
  _type: 'syncRun'
  startedAt: string
  finishedAt?: string
  state: 'running' | 'succeeded' | 'failed'
  mode: 'full' | 'incremental'
  watermark?: string
  fetched?: number
  created?: number
  updated?: number
  unchanged?: number
  unmapped?: number
  failed?: number
  statusEvents?: number
  error?: string
  snapshots?: SnapshotPageRef[]
}

/** Where sync state lives. Sanity in production; an in-memory map in tests. */
export interface SyncStore {
  loadState(): Promise<SyncState>
  saveRun(run: SyncRunDoc): Promise<void>
  apply(plan: Plan): Promise<void>
}

export const runCounts = (c: SyncCounts) => ({
  fetched: c.fetched,
  created: c.created,
  updated: c.updated,
  unchanged: c.unchanged,
  unmapped: c.unmapped,
  statusEvents: c.statusEvents,
})

type Doc = {_id: string; _type: string} & Record<string, unknown>

/** Same write semantics as the Sanity store, kept in memory so tests can count real writes. */
export class MemoryStore implements SyncStore {
  docs = new Map<string, Doc>()
  writes = 0

  constructor(seed: Doc[] = []) {
    for (const d of seed) this.docs.set(d._id, structuredClone(d))
  }

  ofType<T>(type: string): T[] {
    return [...this.docs.values()].filter((d) => d._type === type) as T[]
  }

  async loadState(): Promise<SyncState> {
    const lastGood = this.ofType<SyncRunDoc>('syncRun')
      .filter((r) => r.state === 'succeeded')
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
    return structuredClone({
      complaints: new Map(this.ofType<ComplaintDoc>('complaint311').map((c) => [c._id, c])),
      pets: new Map(this.ofType<StoredPet>('pothole').map((p) => [p._id, p])),
      mappings: this.ofType<ResolutionMapping>('resolutionMapping'),
      watermark: lastGood?.watermark,
      // Same rule as the Sanity store's query: only merges a person ("g…" id) approved.
      approvedClusters: this.ofType<{_id: string; decision: string; decidedBy?: string; complaints: {_ref: string}[]}>('clusterDecision')
        .filter((c) => c.decision === 'approved' && typeof c.decidedBy === 'string' && c.decidedBy.startsWith('g'))
        .map((c) => ({_id: c._id, complaintIds: c.complaints.map((x) => x._ref)})),
    })
  }

  async saveRun(run: SyncRunDoc): Promise<void> {
    this.docs.set(run._id, structuredClone(run) as unknown as Doc)
  }

  async apply(plan: Plan): Promise<void> {
    for (const c of plan.complaints) this.put(c as unknown as Doc)
    for (const p of plan.petCreates) if (!this.docs.has(p._id)) this.put(p as unknown as Doc)
    for (const {id, set, unset, append} of plan.petPatches) {
      const doc = this.docs.get(id)
      if (!doc) throw new Error(`patch on missing document ${id}`)
      const next: Doc = {...doc, ...structuredClone(set)}
      for (const k of unset) delete next[k]
      if (append.length) next.events = [...((next.events as unknown[]) ?? []), ...structuredClone(append)]
      this.put(next)
    }
  }

  private put(doc: Doc) {
    this.docs.set(doc._id, JSON.parse(JSON.stringify(doc))) // drop undefined, like the HTTP API does
    this.writes++
  }
}

// GROQ projections and the shapes they return. Shared by the live data layer and the
// fallback exporter, so the snapshot always has exactly the shape the pages read.
import type {Outcome} from '@pothole/sync/domain'

export const CARD = `name, "slug": slug.current, outcome, temperament, street, crossStreet, firstReportedAt, lastEventAt, hasCoordinates, complaintCount`

export const DETAIL = `${CARD}, bio, communityBoard, location,
  "events": events[]{_key, from, to, at, cause{kind, field, oldValue, newValue, complaint}},
  "complaints": complaints[]->{"key": raw.unique_key, "created": raw.created_date, "closed": raw.closed_date,
    "status": raw.status, "resolution": raw.resolution_description, "addressType": raw.address_type, sourceUrl}`

export const RUN = `_id, startedAt, finishedAt, state, mode, fetched, created, updated, unchanged, unmapped, statusEvents, error`

export interface PetCard {
  name: string
  slug: string
  outcome: Outcome
  temperament: string
  street?: string
  crossStreet?: string
  firstReportedAt?: string
  lastEventAt?: string
  hasCoordinates: boolean
  complaintCount: number
}

export interface ComplaintRow {
  key: string
  /** 311 floating timestamps, New York wall-clock time, exactly as the city published them. */
  created?: string
  closed?: string
  status?: string
  resolution?: string
  addressType?: string
  sourceUrl: string
}

export interface EventRow {
  _key: string
  from: string
  to: string
  at: string
  cause: {kind: 'complaintChange' | 'timeRule' | 'mappingChange'; field?: string; oldValue?: string; newValue?: string; complaint?: {_ref: string}}
}

export interface PetDetail extends PetCard {
  bio?: string
  communityBoard?: string
  location?: {lat: number; lng: number}
  events: EventRow[]
  complaints: ComplaintRow[]
}

export interface SyncRunRow {
  _id: string
  startedAt: string
  finishedAt?: string
  state: 'running' | 'succeeded' | 'failed'
  mode?: 'full' | 'incremental'
  fetched?: number
  created?: number
  updated?: number
  unchanged?: number
  unmapped?: number
  statusEvents?: number
  error?: string
}

export interface MappingRow {
  pattern: string
  outcome: Outcome
  rationale: string
}

/** The committed last-good snapshot: everything the public pages need, in query shape. */
export interface FallbackSnapshot {
  exportedAt: string
  pets: PetDetail[]
  runs: SyncRunRow[]
  mappings: MappingRow[]
}

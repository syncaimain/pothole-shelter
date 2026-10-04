import type {Outcome} from './domain.ts'
import {ids} from './domain.ts'
import {hashOf} from './hash.ts'
import type {ResolutionMapping} from './mapping.ts'
import {closedAt, createdAt, feralAt, isClosed} from './outcome.ts'
import type {DerivedPet} from './pets.ts'
import type {RawRecord} from './soda.ts'
import {toIso} from './time.ts'

export type EventState = Outcome | 'reported'

export interface EventCause {
  kind: 'complaintChange' | 'timeRule' | 'mappingChange'
  complaint?: {_type: 'reference'; _ref: string}
  field?: string
  oldValue?: string
  newValue?: string
  mapping?: {_type: 'reference'; _ref: string; _weak: true}
}

/**
 * One entry in a pet's `events` array. Events live inside the pothole document, not as
 * documents of their own: one document per event put the dataset over its 10,000-document
 * cap (4,992 of 10,022). The sync only ever appends; nothing else writes this array.
 */
export interface StatusEvent {
  /** Content hash of what happened. Stable across runs, so the same event is never appended twice. */
  _key: string
  _type: 'statusEvent'
  from: EventState
  to: EventState
  at: string
  cause: EventCause
  syncRun?: {_type: 'reference'; _ref: string; _weak: true}
}

const ref = (id: string) => ({_type: 'reference' as const, _ref: id})
const asText = (v: unknown) => (v === undefined ? undefined : typeof v === 'string' ? v : JSON.stringify(v))

/** The key depends only on what happened, never on which run noticed it, so a rerun
 *  (or a retry after a partial failure) can never append the same event twice. It is the
 *  same hash that ended the old per-event document IDs, so migrated events keep their keys. */
export const eventKey = (petId: string, from: EventState, to: EventState, at: string, cause: Pick<EventCause, 'kind' | 'complaint' | 'field'>) =>
  hashOf({petId, from, to, at, kind: cause.kind, complaint: cause.complaint?._ref, field: cause.field}).slice(0, 20)

function event(petId: string, from: EventState, to: EventState, at: Date, cause: EventCause, runId: string): StatusEvent {
  return {
    _key: eventKey(petId, from, to, toIso(at), cause),
    _type: 'statusEvent',
    from,
    to,
    at: toIso(at),
    cause,
    syncRun: {_type: 'reference', _ref: runId, _weak: true},
  }
}

const mappingRef = (m?: ResolutionMapping) => (m ? {_type: 'reference' as const, _ref: m._id, _weak: true as const} : undefined)

function closingCause(raw: RawRecord, mapping?: ResolutionMapping): EventCause {
  return {kind: 'complaintChange', complaint: ref(ids.complaint(raw.unique_key)), field: 'status', newValue: asText(raw.status), mapping: mappingRef(mapping)}
}

/**
 * A new pet's history, rebuilt from the city record: reported → in the shelter,
 * then feral at 60 days if it got that far open, then the closing outcome.
 */
export function initialHistory(petId: string, firstRaw: RawRecord, derived: DerivedPet, runId: string): StatusEvent[] {
  const out: StatusEvent[] = []
  const reported = createdAt(firstRaw)
  if (!reported) return out
  out.push(
    event(petId, 'reported', 'shelter', reported, {
      kind: 'complaintChange',
      complaint: ref(ids.complaint(firstRaw.unique_key)),
      field: 'created_date',
      newValue: asText(firstRaw.created_date),
    }, runId),
  )
  const final = derived.fields.outcome
  if (final === 'shelter') return out

  const deciding = derived.deciding
  const feral = feralAt(deciding)
  const closed = isClosed(deciding) ? closedAt(deciding) : undefined
  let current: EventState = 'shelter'
  if (feral && (final === 'feral' || (closed && closed.getTime() >= feral.getTime()))) {
    out.push(event(petId, 'shelter', 'feral', feral, {kind: 'timeRule', complaint: ref(ids.complaint(deciding.unique_key)), field: 'created_date', newValue: asText(deciding.created_date)}, runId))
    current = 'feral'
  }
  if (final !== 'feral' && closed) {
    out.push(event(petId, current, final, closed, closingCause(deciding, derived.mapping), runId))
  }
  return out
}

const CAUSE_FIELDS = ['status', 'resolution_description', 'closed_date', 'resolution_action_updated_date']

/**
 * The event for an existing pet whose outcome changed in this sync. Its cause is the
 * complaint field that changed; failing that, the 60-day rule; failing that, a mapping
 * document that changed.
 */
export function transitionEvent(
  petId: string,
  from: Outcome,
  derived: DerivedPet,
  changed: readonly {id: string; before: RawRecord; after: RawRecord}[],
  now: Date,
  runId: string,
): StatusEvent {
  const to = derived.fields.outcome
  const deciding = derived.deciding
  const change = changed.find((c) => c.after.unique_key === deciding.unique_key) ?? changed[0]
  if (change) {
    const keys = [...CAUSE_FIELDS, ...Object.keys({...change.before, ...change.after}).sort()]
    const field = keys.find((k) => asText(change.before[k]) !== asText(change.after[k]))
    const at = (isClosed(deciding) && closedAt(deciding)) || (to === 'feral' && feralAt(deciding)) || now
    return event(petId, from, to, at, {
      kind: 'complaintChange',
      complaint: ref(change.id),
      field,
      oldValue: field ? asText(change.before[field]) : undefined,
      newValue: field ? asText(change.after[field]) : undefined,
      mapping: mappingRef(derived.mapping),
    }, runId)
  }
  const feral = feralAt(deciding)
  if (to === 'feral' && from === 'shelter' && feral) {
    return event(petId, from, to, feral, {kind: 'timeRule', complaint: ref(ids.complaint(deciding.unique_key)), field: 'created_date', newValue: asText(deciding.created_date)}, runId)
  }
  return event(petId, from, to, now, {
    kind: 'mappingChange',
    complaint: ref(ids.complaint(deciding.unique_key)),
    field: 'resolution_description',
    newValue: asText(deciding.resolution_description),
    mapping: mappingRef(derived.mapping),
  }, runId)
}

import {CLOSED_STATUS, FERAL_AFTER_DAYS, type Outcome} from './domain.ts'
import {matchResolution, type ResolutionMapping} from './mapping.ts'
import type {RawRecord} from './soda.ts'
import {DAY_MS, parseNycLocal} from './time.ts'

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined)

export const isClosed = (raw: RawRecord) => raw.status === CLOSED_STATUS
export const createdAt = (raw: RawRecord) => parseNycLocal(str(raw.created_date))

/** When the city closed it: closed_date, else the resolution update date. */
export const closedAt = (raw: RawRecord) =>
  parseNycLocal(str(raw.closed_date)) ?? parseNycLocal(str(raw.resolution_action_updated_date))

/** The moment an open complaint turns feral. */
export const feralAt = (raw: RawRecord) => {
  const c = createdAt(raw)
  return c ? new Date(c.getTime() + FERAL_AFTER_DAYS * DAY_MS) : undefined
}

export interface ComplaintOutcome {
  outcome: Outcome
  mapping?: ResolutionMapping
}

/**
 * The deterministic rule (spec, "Outcomes"):
 * - not Closed → feral once 60 days old, otherwise in the shelter;
 * - Closed → whatever the matching resolutionMapping says, else unmapped.
 */
export function complaintOutcome(raw: RawRecord, mappings: readonly ResolutionMapping[], now: Date): ComplaintOutcome {
  if (!isClosed(raw)) {
    const f = feralAt(raw)
    return {outcome: f && now.getTime() >= f.getTime() ? 'feral' : 'shelter'}
  }
  const m = matchResolution(str(raw.resolution_description), mappings)
  return m.kind === 'matched' ? {outcome: m.mapping.outcome, mapping: m.mapping} : {outcome: 'unmapped'}
}

/** The complaint whose state decides a pet's outcome, and that outcome. */
export function decidingComplaint(
  complaints: readonly RawRecord[],
  mappings: readonly ResolutionMapping[],
  now: Date,
): {raw: RawRecord} & ComplaintOutcome {
  // Any open complaint keeps the pet in the shelter; the oldest open one sets its age.
  const open = complaints.filter((c) => !isClosed(c))
  const byCreated = (a: RawRecord, b: RawRecord) => (createdAt(a)?.getTime() ?? 0) - (createdAt(b)?.getTime() ?? 0)
  if (open.length) {
    const raw = [...open].sort(byCreated)[0]!
    return {raw, ...complaintOutcome(raw, mappings, now)}
  }
  // All closed: the most recently closed complaint has the last word.
  const raw = [...complaints].sort((a, b) => (closedAt(b)?.getTime() ?? 0) - (closedAt(a)?.getTime() ?? 0))[0]!
  return {raw, ...complaintOutcome(raw, mappings, now)}
}

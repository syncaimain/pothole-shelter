// Keeps one pothole-lifecycle workflow instance per open pet in step with the sync.
//
// Budget: the Growth trial allows ~250k API requests a month, so the sync never ticks every
// instance. Each run plans exactly the operations needed: start instances for open pets
// that have none, record the outcome when a pet's complaint closes, and tick only the
// pets the 60-day rule just turned feral. The plan is pure and unit-tested.
import {FERAL_AFTER_DAYS} from './domain.ts'
import {DAY_MS} from './time.ts'

export const LIFECYCLE_DEFINITION = 'pothole-lifecycle'
const OPEN = new Set(['shelter', 'feral'])

/** What the sync stores on the pet about its lifecycle instance. */
export interface LifecycleState {
  instance: string
  /** The last stage the sync drove it to: shelter | feral | adopted | ghost | transferred | unmapped. */
  stage: string
}

export interface LifecyclePet {
  _id: string
  outcome: string
  firstReportedAt?: string
  lifecycle?: LifecycleState
  /** The pet's latest status event, whose cause the recorded outcome cites. */
  last?: {to: string; cause?: {complaint?: {_ref: string}; field?: string}}
}

export type LifecycleOp =
  | {kind: 'start'; petId: string; feralAt: string; expectStage: 'shelter' | 'feral'}
  | {kind: 'record'; petId: string; instance: string; outcome: string; complaint: string; field: string}
  | {kind: 'tick'; petId: string; instance: string}

export const feralAtFor = (firstReportedAt: string) => new Date(Date.parse(firstReportedAt) + FERAL_AFTER_DAYS * DAY_MS).toISOString()

export function planLifecycles(pets: readonly LifecyclePet[]): LifecycleOp[] {
  const ops: LifecycleOp[] = []
  for (const p of pets) {
    const open = OPEN.has(p.outcome)
    if (!p.lifecycle) {
      // Only open pets get an instance; pets that closed before the engine existed keep
      // their history in the embedded events and are not back-filled.
      if (open && p.firstReportedAt) {
        ops.push({kind: 'start', petId: p._id, feralAt: feralAtFor(p.firstReportedAt), expectStage: p.outcome as 'shelter' | 'feral'})
      }
      continue
    }
    if (p.lifecycle.stage === p.outcome) continue
    if (!open) {
      const complaint = p.last?.cause?.complaint?._ref
      if (complaint) {
        ops.push({kind: 'record', petId: p._id, instance: p.lifecycle.instance, outcome: p.outcome, complaint, field: p.last?.cause?.field ?? 'status'})
      }
    } else if (p.outcome === 'feral' && p.lifecycle.stage === 'shelter') {
      ops.push({kind: 'tick', petId: p._id, instance: p.lifecycle.instance})
    }
  }
  return ops
}

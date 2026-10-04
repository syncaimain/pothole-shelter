// Executes the lifecycle plan against the Workflows engine with the sync's robot token
// (the only kind of caller pothole-lifecycle's record-outcome action admits).
import type {SanityClient} from '@sanity/client'
import {createEngine, gdrRef} from '@sanity/workflow-engine'
import {LIFECYCLE_DEFINITION, planLifecycles, type LifecycleOp, type LifecyclePet} from './lifecycle.ts'
import {SANITY_DATASET, SANITY_PROJECT_ID} from './sanityStore.ts'

export const WORKFLOW_RESOURCE = {type: 'dataset' as const, id: `${SANITY_PROJECT_ID}.${SANITY_DATASET}`}
export const WORKFLOW_TAG = 'prod'

export interface LifecycleReport {
  planned: number
  started: number
  recorded: number
  ticked: number
  failed: number
  errors: string[]
}

export async function reconcileLifecycles(client: SanityClient, opts: {concurrency?: number; limit?: number} = {}): Promise<LifecycleReport> {
  const pets = await client.fetch<LifecyclePet[]>(
    `*[_type == "pothole"]{_id, outcome, firstReportedAt, lifecycle, "last": events[-1]{to, cause{complaint, field}}}`,
  )
  const ops = planLifecycles(pets).slice(0, opts.limit ?? Infinity)
  const engine = createEngine({client, tag: WORKFLOW_TAG, workflowResource: WORKFLOW_RESOURCE})
  const report: LifecycleReport = {planned: ops.length, started: 0, recorded: 0, ticked: 0, failed: 0, errors: []}

  const run = async (op: LifecycleOp) => {
    try {
      let instanceId: string
      let stage: string
      if (op.kind === 'start') {
        const {instance} = await engine.startInstance({
          definition: LIFECYCLE_DEFINITION,
          initialFields: [
            {type: 'subject', name: 'subject', value: gdrRef({res: WORKFLOW_RESOURCE, documentId: op.petId, type: 'pothole'})},
            {type: 'datetime', name: 'feralAt', value: op.feralAt},
          ],
        })
        instanceId = instance._id
        stage = instance.currentStage
        report.started++
      } else if (op.kind === 'record') {
        const {instance} = await engine.fireAction({
          instanceId: op.instance,
          activity: 'city-record',
          action: 'record-outcome',
          params: {outcome: op.outcome, complaint: op.complaint, field: op.field},
          idempotencyKey: `${op.instance}:${op.outcome}`,
        })
        instanceId = op.instance
        stage = instance.currentStage
        report.recorded++
      } else {
        const {instance} = await engine.tick({instanceId: op.instance})
        instanceId = op.instance
        stage = instance.currentStage
        report.ticked++
      }
      await client.patch(op.petId).set({lifecycle: {instance: instanceId, stage}}).commit({visibility: 'async'})
    } catch (err) {
      report.failed++
      if (report.errors.length < 5) report.errors.push(`${op.kind} ${op.petId}: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`)
    }
  }

  // A small worker pool: the engine makes several requests per operation.
  const queue = [...ops]
  const workers = Array.from({length: Math.min(opts.concurrency ?? 4, queue.length)}, async () => {
    for (let op = queue.shift(); op; op = queue.shift()) await run(op)
  })
  await Promise.all(workers)
  return report
}

// One-off cleanup (2026-10-04): abort workflow instances that duplicate another instance
// for the same subject and that no document references.
//
// How they arose: two backfills were stopped from their shell (a background time limit and
// a TaskStop), but the Node processes behind them kept running for several minutes. They
// raced the re-runs started afterwards, so some subjects got two instances; the later one is
// referenced, the earlier one orphaned (180 cluster-review, 3 pothole-lifecycle).
//
// Abort, not delete: the engine records the reason, so the trail stays honest.
//   pnpm --filter @pothole/ingest abort:orphans            dry run
//   pnpm --filter @pothole/ingest abort:orphans --apply
import {createEngine} from '@sanity/workflow-engine'
import {sanityWriteClient} from '@pothole/sync'

const token = process.env.SANITY_API_WRITE_TOKEN
if (!token) throw new Error('SANITY_API_WRITE_TOKEN is not set')
const apply = process.argv.includes('--apply')
const client = sanityWriteClient(token)
const engine = createEngine({client, tag: 'prod', workflowResource: {type: 'dataset', id: 'fixjy07h.production'}})

type Inst = {_id: string; definition: string; subject?: string; done: boolean}
const instances = await client.fetch<Inst[]>(
  `*[_type == "sanity.workflow.instance"]{_id, definition, "subject": fields[name == "subject"][0].value.id, "done": defined(completedAt) || defined(abortedAt)}`,
)
const referenced = new Set([
  ...(await client.fetch<string[]>(`*[_type == "pothole" && defined(lifecycle.instance)].lifecycle.instance`)),
  ...(await client.fetch<string[]>(`*[_type == "clusterDecision" && defined(workflowInstance)].workflowInstance`)),
  ...(await client.fetch<string[]>(`*[_type == "adoption" && defined(workflowInstance)].workflowInstance`)),
])
const subjectHasReferenced = new Set(instances.filter((i) => referenced.has(i._id)).map((i) => i.subject))
// Only an unreferenced, still-running instance whose subject already has a referenced one.
const orphans = instances.filter((i) => !referenced.has(i._id) && !i.done && i.subject && subjectHasReferenced.has(i.subject))
const byDef: Record<string, number> = {}
for (const o of orphans) byDef[o.definition] = (byDef[o.definition] ?? 0) + 1
console.log(`instances ${instances.length}; referenced ${referenced.size}; duplicate orphans to abort: ${orphans.length} ${JSON.stringify(byDef)}`)
if (!apply) process.exit(0)

let aborted = 0
let failed = 0
const queue = [...orphans]
await Promise.all(
  Array.from({length: 6}, async () => {
    for (let o = queue.shift(); o; o = queue.shift()) {
      try {
        await engine.abortInstance({instanceId: o._id, reason: 'Duplicate created when an interrupted backfill kept running; another instance for this subject is the live one.'})
        aborted++
      } catch (err) {
        failed++
        if (failed <= 3) console.error(o._id, err instanceof Error ? err.message.slice(0, 200) : err)
      }
    }
  }),
)
console.log(`aborted ${aborted}; failed ${failed}`)

// Writes the cluster rule's proposals as clusterDecision documents and starts a
// cluster-review workflow instance for each. Nothing merges until a person approves one
// in the Shelter Office; the sync honours only person-approved decisions.
//
// Usage: pnpm --filter @pothole/ingest write:clusters [--dry-run]
// Re-runnable: decision IDs are deterministic and written with createIfNotExists.
import {createEngine, gdrRef} from '@sanity/workflow-engine'
import {proposeClusters, sanityWriteClient, type RawRecord} from '@pothole/sync'

const token = process.env.SANITY_API_WRITE_TOKEN
if (!token) throw new Error('SANITY_API_WRITE_TOKEN is not set')
const dryRun = process.argv.includes('--dry-run')
const client = sanityWriteClient(token)
const res = {type: 'dataset' as const, id: 'fixjy07h.production'}
const engine = createEngine({client, tag: 'prod', workflowResource: res})

const complaints = await client.fetch<RawRecord[]>(`*[_type == "complaint311"].raw`)
const proposals = proposeClusters(complaints)
const existing = new Set(await client.fetch<string[]>(`*[_type == "clusterDecision"]._id`))
const fresh = proposals.filter((p) => !existing.has(p._id))
console.log(`${complaints.length} complaints → ${proposals.length} proposals; ${fresh.length} new`)
if (dryRun) process.exit(0)

const now = new Date().toISOString()
let started = 0
let failed = 0
const queue = [...fresh]
await Promise.all(
  Array.from({length: 4}, async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      try {
        await client.createIfNotExists({...p, proposedAt: now})
        const {instance} = await engine.startInstance({
          definition: 'cluster-review',
          initialFields: [{type: 'subject', name: 'subject', value: gdrRef({res, documentId: p._id, type: 'clusterDecision'})}],
        })
        await client.patch(p._id).set({workflowInstance: instance._id}).commit({visibility: 'async'})
        started++
      } catch (err) {
        failed++
        if (failed <= 3) console.error(p._id, err instanceof Error ? err.message.slice(0, 200) : err)
      }
    }
  }),
)
console.log(`written with workflow instances: ${started}; failed: ${failed}`)

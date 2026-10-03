// Creates the initial resolutionMapping documents. Uses createIfNotExists, so once a
// person edits a mapping in the Studio, re-running this never overwrites their decision.
// Usage: pnpm --filter @pothole/ingest seed:mappings
import {sanityWriteClient} from '@pothole/sync'
import {MAPPINGS} from './mappings.ts'

const token = process.env.SANITY_API_WRITE_TOKEN
if (!token) throw new Error('SANITY_API_WRITE_TOKEN is not set')
const client = sanityWriteClient(token)

const existing = new Set(await client.fetch<string[]>(`*[_type == "resolutionMapping"]._id`))
const tx = client.transaction()
for (const m of MAPPINGS) tx.createIfNotExists({_type: 'resolutionMapping', ...m})
await tx.commit()

for (const m of MAPPINGS) console.log(`${existing.has(m._id) ? 'kept   ' : 'created'}  ${m._id} → ${m.outcome}`)

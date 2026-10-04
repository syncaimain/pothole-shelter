// One-off migration (2026-10-04): move statusEvent documents into pothole.events arrays.
// Why: one document per event put the dataset at 10,022 of its 10,000-document cap.
//
// Moves, never re-derives: each event is copied verbatim; its array _key is the content hash
// that ended its old document ID, checked against eventKey() so future sync appends dedupe.
//
//   pnpm --filter @pothole/ingest migrate:events            dry run: plan and checks only
//   pnpm --filter @pothole/ingest migrate:events --apply    append events into their pets
//   pnpm --filter @pothole/ingest migrate:events --apply --delete
//                                                           ...then, only if every event is
//                                                           verified inside its pet, delete the
//                                                           statusEvent documents
// Re-runnable: keys already present in a pet are skipped.
import {eventKey, sanityWriteClient, type StatusEvent} from '@pothole/sync'

const token = process.env.SANITY_API_WRITE_TOKEN
if (!token) throw new Error('SANITY_API_WRITE_TOKEN is not set')
const apply = process.argv.includes('--apply')
const del = process.argv.includes('--delete')
if (del && !apply) throw new Error('--delete requires --apply')
const client = sanityWriteClient(token)
const BATCH = 200

type EventDoc = Omit<StatusEvent, '_key'> & {_id: string; pothole: {_ref: string}}

const docs = await client.fetch<EventDoc[]>(`*[_type == "statusEvent"]{_id, pothole, from, to, at, cause, syncRun}`)
console.log(`statusEvent documents: ${docs.length}`)

// Convert and check every key against the scheme the sync now uses.
const byPet = new Map<string, StatusEvent[]>()
const mismatched: string[] = []
for (const d of docs) {
  const key = d._id.slice(d._id.lastIndexOf('-') + 1)
  if (key !== eventKey(d.pothole._ref, d.from, d.to, d.at, d.cause)) mismatched.push(d._id)
  const entry = JSON.parse(JSON.stringify({_key: key, _type: 'statusEvent', from: d.from, to: d.to, at: d.at, cause: d.cause, syncRun: d.syncRun}, (_k, v) => (v === null ? undefined : v))) as StatusEvent
  byPet.set(d.pothole._ref, [...(byPet.get(d.pothole._ref) ?? []), entry])
}
if (mismatched.length) throw new Error(`${mismatched.length} event keys do not match eventKey(); first: ${mismatched[0]}`)
console.log(`keys verified against eventKey(): ${docs.length}/${docs.length}; pets with events: ${byPet.size}`)

const existing = new Map(
  (await client.fetch<{_id: string; keys: string[] | null}[]>(`*[_type == "pothole"]{_id, "keys": events[]._key}`)).map((p) => [p._id, new Set(p.keys ?? [])]),
)
const missingPets = [...byPet.keys()].filter((id) => !existing.has(id))
if (missingPets.length) throw new Error(`${missingPets.length} events point at pets that do not exist; first: ${missingPets[0]}`)

const patches = [...byPet].flatMap(([petId, events]) => {
  const fresh = events.filter((e) => !existing.get(petId)!.has(e._key)).sort((a, b) => a.at.localeCompare(b.at))
  return fresh.length ? [{petId, fresh}] : []
})
console.log(`pets needing events appended: ${patches.length} (${patches.reduce((n, p) => n + p.fresh.length, 0)} events)`)

if (!apply) {
  console.log('dry run: nothing written. Re-run with --apply.')
  process.exit(0)
}

for (let i = 0; i < patches.length; i += BATCH) {
  const tx = client.transaction()
  for (const {petId, fresh} of patches.slice(i, i + BATCH)) tx.patch(client.patch(petId).setIfMissing({events: []}).append('events', fresh))
  await tx.commit()
}
console.log(`appended into ${patches.length} pets`)

// Verify every source event now sits inside its pet, before anything is deleted.
const after = new Map(
  (await client.fetch<{_id: string; keys: string[] | null}[]>(`*[_type == "pothole"]{_id, "keys": events[]._key}`)).map((p) => [p._id, new Set(p.keys ?? [])]),
)
const absent = [...byPet].flatMap(([petId, events]) => events.filter((e) => !after.get(petId)?.has(e._key)))
const inArrays = await client.fetch<number>(`count(*[_type == "pothole"].events[])`)
console.log(`verification: ${docs.length - absent.length}/${docs.length} events found in their pets; total array entries ${inArrays}`)
if (absent.length) throw new Error(`${absent.length} events missing after append; NOT deleting anything`)

if (!del) {
  console.log('statusEvent documents kept. Re-run with --apply --delete to remove them.')
  process.exit(0)
}
const ids = docs.map((d) => d._id)
for (let i = 0; i < ids.length; i += BATCH) {
  const tx = client.transaction()
  for (const id of ids.slice(i, i + BATCH)) tx.delete(id)
  await tx.commit()
}
console.log(`deleted ${ids.length} statusEvent documents; remaining: ${await client.fetch<number>(`count(*[_type == "statusEvent"])`)}`)

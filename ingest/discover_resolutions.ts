// Lists every distinct resolution text in the sync's scope, with counts by status.
// Run this before writing or changing resolutionMapping documents: mappings come from
// what the city actually wrote, never from guesses.
//
// Usage: pnpm --filter @pothole/ingest discover
// Output: a snapshot under data/raw/discovery-<timestamp>/ and data/resolutions.json.
import {writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {fetchPages, fileSnapshotter, fullWhere, SCOPE, splitRow, type SnapshotPageRef} from '@pothole/sync'

const now = new Date()
const runId = `discovery-${now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`
const where = fullWhere(now)
const snapshot = fileSnapshotter(fileURLToPath(new URL('./data/raw/', import.meta.url)))

const tally = new Map<string, {text: string; total: number; byStatus: Record<string, number>; exampleKeys: string[]}>()
const pages: SnapshotPageRef[] = []
let rows = 0
for await (const page of fetchPages({where, appToken: process.env.SOCRATA_APP_TOKEN})) {
  const file = await snapshot(runId, page)
  pages.push({_key: `p${page.index + 1}`, file, sha256: page.sha256, rows: page.rows.length, retrievedAt: page.retrievedAt})
  for (const row of page.rows) {
    const {raw} = splitRow(row)
    rows++
    const text = typeof raw.resolution_description === 'string' ? raw.resolution_description : '(none)'
    const status = typeof raw.status === 'string' ? raw.status : '(none)'
    const t = tally.get(text) ?? {text, total: 0, byStatus: {}, exampleKeys: []}
    t.total++
    t.byStatus[status] = (t.byStatus[status] ?? 0) + 1
    if (t.exampleKeys.length < 3) t.exampleKeys.push(raw.unique_key)
    tally.set(text, t)
  }
}
await snapshot.finish(runId, pages, {purpose: 'resolution discovery', where, dataset: 'erm2-nwe9'})

const phrases = [...tally.values()].sort((a, b) => b.total - a.total)
const out = {retrievedAt: now.toISOString(), scope: SCOPE, where, rows, snapshot: runId, distinctPhrases: phrases.length, phrases}
await writeFile(fileURLToPath(new URL('./data/resolutions.json', import.meta.url)), JSON.stringify(out, null, 2) + '\n')

console.log(`${rows} complaints, ${phrases.length} distinct resolution texts (snapshot ${runId})\n`)
for (const p of phrases) {
  const statuses = Object.entries(p.byStatus).map(([s, n]) => `${s} ${n}`).join(', ')
  console.log(`${String(p.total).padStart(5)}  [${statuses}]  ${p.text}`)
}

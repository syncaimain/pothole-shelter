// Runs the cluster rule over a committed snapshot and reports what it would propose.
// Read-only: verifies each page's SHA-256 against its manifest, writes nothing to Sanity.
// Usage: pnpm --filter @pothole/ingest measure:clusters [snapshot-folder]
import {readdirSync, readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {proposeClusters, sha256, splitRow, type SodaRow} from '@pothole/sync'

const raw = fileURLToPath(new URL('./data/raw/', import.meta.url))
const folder = process.argv[2] ?? readdirSync(raw).filter((d) => d.startsWith('syncRun-')).sort()[0]!
const manifest = JSON.parse(readFileSync(`${raw}${folder}/manifest.json`, 'utf8')) as {pages: {file: string; sha256: string}[]}

const rows: SodaRow[] = []
for (const p of manifest.pages) {
  const text = readFileSync(`${raw}${p.file}`, 'utf8')
  if (sha256(text) !== p.sha256) throw new Error(`checksum mismatch: ${p.file}`)
  rows.push(...(JSON.parse(text) as SodaRow[]))
}
const complaints = rows.map((r) => splitRow(r).raw)
const proposals = proposeClusters(complaints)

const located = proposals.filter((p) => p.distanceMetres !== undefined)
const strays = proposals.filter((p) => p.distanceMetres === undefined)
const members = proposals.reduce((n, p) => n + p.complaints.length, 0)
const sizes = new Map<number, number>()
for (const p of proposals) sizes.set(p.complaints.length, (sizes.get(p.complaints.length) ?? 0) + 1)
const stretched = located.filter((p) => p.distanceMetres! > 60)

console.log(`snapshot ${folder}: ${complaints.length} complaints (checksums verified)`)
console.log(`proposals: ${proposals.length} (${located.length} by distance, ${strays.length} same-block strays)`)
console.log(`complaints in a proposal: ${members}; pets if every proposal were approved: ${complaints.length - members + proposals.length}`)
console.log(`group sizes: ${[...sizes].sort((a, b) => a[0] - b[0]).map(([s, n]) => `${s}×${n}`).join(', ')}`)
console.log(`distance proposals whose chained spread exceeds 60 m: ${stretched.length}`)
for (const p of [...proposals].sort((a, b) => b.complaints.length - a.complaints.length).slice(0, 5)) console.log(`  e.g. ${p.reason}`)

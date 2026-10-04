// Writes web/data/fallback.json: the last-good snapshot every public page falls back to
// when Sanity is unreachable. Read-only against the public dataset (no token).
// Usage: pnpm --filter @pothole/web export:fallback
import {writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {createClient} from '@sanity/client'
import {DETAIL, RUN, type FallbackSnapshot} from '../lib/queries.ts'

const client = createClient({projectId: 'fixjy07h', dataset: 'production', apiVersion: '2025-02-19', useCdn: false, perspective: 'published'})

const snap = await client.fetch<Omit<FallbackSnapshot, 'exportedAt'>>(
  `{"pets": *[_type == "pothole"] | order(slug.current asc){${DETAIL}},
    "runs": *[_type == "syncRun"] | order(startedAt desc)[0...30]{${RUN}},
    "mappings": *[_type == "resolutionMapping"] | order(outcome asc, pattern asc){pattern, outcome, rationale}}`,
)
// GROQ returns null for missing fields; drop them so the snapshot matches live shapes.
const clean = JSON.parse(JSON.stringify(snap, (_k, v) => (v === null ? undefined : v)))
const out: FallbackSnapshot = {exportedAt: new Date().toISOString(), ...clean}
const file = fileURLToPath(new URL('../data/fallback.json', import.meta.url))
await writeFile(file, JSON.stringify(out) + '\n')
console.log(`fallback snapshot: ${out.pets.length} pets, ${out.runs.length} runs, ${out.mappings.length} mappings → ${file}`)

// Restyles a deterministic sample of template bios with Gemini, keeping only those the fact
// guard accepts. Writes a report (accepted, rejected and why) for the build log.
//
// Usage: pnpm --filter @pothole/agent restyle [--per-outcome N]
import {mkdirSync, writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {OUTCOMES} from '@pothole/sync/domain'
import {sanityWriteClient} from '@pothole/sync'
import {geminiGenerate, MODEL_ID, modelVersion, restyle} from './restyle.ts'

const apiKey = process.env.GEMINI_API_KEY
const token = process.env.SANITY_API_WRITE_TOKEN
if (!apiKey || !token) throw new Error('GEMINI_API_KEY and SANITY_API_WRITE_TOKEN are required')
const i = process.argv.indexOf('--per-outcome')
const perOutcome = i > 0 ? Number(process.argv[i + 1]) : 10

const client = sanityWriteClient(token)
const version = await modelVersion(apiKey)
const model = `${MODEL_ID} (version ${version})`
const generate = geminiGenerate(apiKey)
console.log(`model: ${model}`)

type Pet = {_id: string; _rev: string; name: string; outcome: string; bio: string; bioMeta?: {factsHash?: string}}
// Deterministic sample: the first N template bios per outcome, by slug.
const pets: Pet[] = []
for (const o of OUTCOMES) {
  pets.push(
    ...(await client.fetch<Pet[]>(
      `*[_type == "pothole" && !defined(mergedInto) && outcome == $o && bioMeta.source == "template"] | order(slug.current asc)[0...$n]{_id, _rev, name, outcome, bio, bioMeta}`,
      {o: o.value, n: perOutcome},
    )),
  )
}

const report = {model, generatedAt: new Date().toISOString(), attempted: 0, accepted: 0, rejected: 0, results: [] as unknown[]}
for (const pet of pets) {
  report.attempted++
  const r = await restyle(generate, pet.bio)
  if (r.bio) {
    try {
      // ifRevisionId: never overwrite a pet the sync changed while we were generating.
      await client
        .patch(pet._id)
        .ifRevisionId(pet._rev)
        .set({bio: r.bio, bioMeta: {source: 'model', model, guardPassed: true, factsHash: pet.bioMeta?.factsHash, generatedAt: new Date().toISOString()}})
        .commit()
      report.accepted++
      report.results.push({pet: pet._id, outcome: pet.outcome, accepted: true})
    } catch {
      report.results.push({pet: pet._id, outcome: pet.outcome, accepted: false, reasons: ['pet changed during generation; kept template']})
      report.rejected++
    }
  } else {
    report.rejected++
    report.results.push({pet: pet._id, outcome: pet.outcome, accepted: false, reasons: r.guard.reasons})
  }
  process.stdout.write(r.bio ? '.' : 'x')
}

const dir = fileURLToPath(new URL('../data/', import.meta.url))
mkdirSync(dir, {recursive: true})
const file = `${dir}restyle-${report.generatedAt.slice(0, 10)}.json`
writeFileSync(file, JSON.stringify(report, null, 2) + '\n')
console.log(`\nattempted ${report.attempted} · accepted ${report.accepted} · rejected ${report.rejected} → ${file}`)

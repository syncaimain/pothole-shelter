import {readFileSync} from 'node:fs'
import type {ResolutionMapping} from '../src/mapping.ts'
import type {SodaRow} from '../src/soda.ts'
import {MemoryStore} from '../src/store.ts'

/** Real rows copied verbatim from discovery snapshot discovery-20261003T202235Z (checksums in the file). */
const fixture = JSON.parse(readFileSync(new URL('./fixtures/cb13-rows.json', import.meta.url), 'utf8')) as {
  rows: Record<string, SodaRow>
}
export const ROWS = fixture.rows
export const row = (name: string): SodaRow => structuredClone(ROWS[name]!)
export const allRows = () => Object.keys(ROWS).map(row)

/** The clock the fixtures were picked against: 2026-10-03 20:00 UTC. */
export const T0 = new Date('2026-10-03T20:00:00Z')
export const at = (d: Date) => () => d
export const plusDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)

const DOT = 'The Department of Transportation'
/** The same exact patterns as ingest/mappings.ts (kept separate so sync tests don't depend on ingest). */
export const MAPPINGS: ResolutionMapping[] = [
  {_id: 'resolutionMapping-repaired', matchType: 'exact', outcome: 'adopted', pattern: `${DOT} inspected this complaint and repaired the problem.`},
  {_id: 'resolutionMapping-found-fixed', matchType: 'exact', outcome: 'adopted', pattern: `${DOT} inspected this complaint and found that the problem was fixed.`},
  {_id: 'resolutionMapping-not-found', matchType: 'exact', outcome: 'ghost', pattern: `${DOT} inspected this complaint and did not find the reported problem.`},
  {
    _id: 'resolutionMapping-duplicate',
    matchType: 'exact',
    outcome: 'transferred',
    pattern: `${DOT} determined that this complaint is a duplicate of a previously filed complaint. The original complaint is being addressed.`,
  },
]

export const storeWithMappings = (mappings = MAPPINGS) =>
  new MemoryStore(mappings.map((m) => ({...m, _type: 'resolutionMapping'})))

/** A fake SODA endpoint serving `rows` with real $limit/$offset paging. Records every URL it was asked for. */
export function fakeSoda(rows: () => SodaRow[]) {
  const calls: URL[] = []
  const impl = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input)
    calls.push(url)
    const limit = Number(url.searchParams.get('$limit'))
    const offset = Number(url.searchParams.get('$offset'))
    return new Response(JSON.stringify(rows().slice(offset, offset + limit)), {status: 200})
  }) as typeof fetch
  return {impl, calls}
}

export const failingSoda = (status = 503) =>
  (async () => new Response('{"message":"service unavailable"}', {status})) as unknown as typeof fetch

export const noSleep = async () => {}

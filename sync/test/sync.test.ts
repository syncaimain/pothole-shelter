import {describe, expect, it} from 'vitest'
import type {StatusEventDoc} from '../src/events.ts'
import type {ComplaintDoc, PetDoc} from '../src/plan.ts'
import {runSync} from '../src/run.ts'
import {fetchPages, splitRow} from '../src/soda.ts'
import type {SyncRunDoc} from '../src/store.ts'
import {MemoryStore} from '../src/store.ts'
import {allRows, at, failingSoda, fakeSoda, MAPPINGS, noSleep, plusDays, row, ROWS, storeWithMappings, T0} from './helpers.ts'

const sync = (store: MemoryStore, rows: () => ReturnType<typeof allRows>, clock = T0, full = false) =>
  runSync({store, fetchImpl: fakeSoda(rows).impl, clock: at(clock), full, sleep: noSleep})

const pet = (store: MemoryStore, key: string) => store.docs.get(`pothole-${key}`) as unknown as PetDoc
const eventsFor = (store: MemoryStore, key: string) =>
  store.ofType<StatusEventDoc>('statusEvent').filter((e) => e.pothole._ref === `pothole-${key}`).sort((a, b) => a.at.localeCompare(b.at))

describe('sync idempotency', () => {
  it('a second sync over the same data changes nothing', async () => {
    const store = storeWithMappings()
    const first = await sync(store, allRows)
    expect(first.state).toBe('succeeded')
    expect(first.created).toBe(Object.keys(ROWS).length)

    const writesBefore = store.writes
    const docsBefore = JSON.stringify([...store.docs.entries()].filter(([, d]) => d._type !== 'syncRun'))
    const second = await sync(store, allRows, T0, true) // full refetch, same clock
    expect(second).toMatchObject({state: 'succeeded', created: 0, updated: 0, statusEvents: 0, unchanged: Object.keys(ROWS).length})
    expect(store.writes).toBe(writesBefore)
    expect(JSON.stringify([...store.docs.entries()].filter(([, d]) => d._type !== 'syncRun'))).toBe(docsBefore)
  })

  it('an incremental sync after a full one also changes nothing when the source is unchanged', async () => {
    const store = storeWithMappings()
    await sync(store, allRows)
    const writes = store.writes
    const again = await sync(store, allRows)
    expect(again.mode).toBe('incremental')
    expect(again).toMatchObject({created: 0, updated: 0, statusEvents: 0})
    expect(store.writes).toBe(writes)
  })
})

describe('raw records stay untouched', () => {
  it('stores each row exactly as Socrata sent it, minus Socrata system fields', async () => {
    const store = storeWithMappings()
    await sync(store, allRows)
    for (const r of allRows()) {
      const doc = store.docs.get(`complaint311-${r.unique_key}`) as unknown as ComplaintDoc
      expect(doc.raw).toEqual(splitRow(r).raw)
      expect(doc.raw).not.toHaveProperty(':updated_at')
      expect(doc.sourceUpdatedAt).toBe(r[':updated_at'])
    }
  })

  it('rewrites a record only when its content hash changes', async () => {
    const store = storeWithMappings()
    await sync(store, allRows)
    const before = store.docs.get('complaint311-68586622') as unknown as ComplaintDoc
    // Socrata touched :updated_at but nothing in the record changed.
    const touched = () => allRows().map((r) => ({...r, ':updated_at': '2026-10-05T00:00:00.000Z'}))
    const run = await sync(store, touched, T0, true)
    expect(run.updated).toBe(0)
    expect(store.docs.get('complaint311-68586622')).toEqual(before)
  })

  it('never uses a dot in any document ID (dotted IDs are hidden from anonymous readers)', async () => {
    const store = storeWithMappings()
    await sync(store, allRows)
    for (const id of store.docs.keys()) expect(id).not.toContain('.')
  })
})

describe('outcomes come from mappings and the clock, never from guesses', () => {
  it('maps each real fixture to the expected outcome, with strays flagged', async () => {
    const store = storeWithMappings()
    await sync(store, allRows)
    expect(pet(store, ROWS.repairedWithCoords!.unique_key)).toMatchObject({outcome: 'adopted', hasCoordinates: true})
    expect(pet(store, ROWS.foundFixed!.unique_key).outcome).toBe('adopted')
    expect(pet(store, ROWS.ghostNoCoords!.unique_key)).toMatchObject({outcome: 'ghost', hasCoordinates: false})
    expect(pet(store, ROWS.duplicate!.unique_key).outcome).toBe('transferred')
    expect(pet(store, ROWS.unmappedClosed!.unique_key).outcome).toBe('unmapped')
    expect(pet(store, ROWS.feralPending!.unique_key).outcome).toBe('feral')
    expect(pet(store, ROWS.shelterOpenRecent!.unique_key).outcome).toBe('shelter')
  })

  it('rounds display coordinates to 3 decimals', async () => {
    const store = storeWithMappings()
    await sync(store, allRows)
    const p = pet(store, ROWS.repairedWithCoords!.unique_key)
    expect(p.location!.lat).toBe(Math.round(Number(ROWS.repairedWithCoords!.latitude) * 1000) / 1000)
    expect(String(p.location!.lat).split('.')[1]!.length).toBeLessThanOrEqual(3)
  })

  it('rebuilds a new pet\'s history from the record, each event citing a complaint field', async () => {
    const store = storeWithMappings()
    await sync(store, allRows)
    const repaired = eventsFor(store, ROWS.repairedWithCoords!.unique_key)
    expect(repaired.map((e) => `${e.from}>${e.to}`)).toEqual(['reported>shelter', 'shelter>adopted'])
    expect(repaired[1]!.cause).toMatchObject({kind: 'complaintChange', field: 'status', newValue: 'Closed', mapping: {_ref: 'resolutionMapping-repaired'}})

    const feral = eventsFor(store, ROWS.feralPending!.unique_key)
    expect(feral.map((e) => `${e.from}>${e.to}`)).toEqual(['reported>shelter', 'shelter>feral'])
    expect(feral[1]!.cause.kind).toBe('timeRule')
    for (const e of store.ofType<StatusEventDoc>('statusEvent')) expect(e.cause.complaint?._ref).toMatch(/^complaint311-/)
  })
})

describe('changes arrive only through sync events', () => {
  it('a complaint closing as repaired adopts its pet, citing the status change', async () => {
    const store = storeWithMappings()
    await sync(store, allRows)
    const key = ROWS.shelterOpenRecent!.unique_key
    const closed = () => [{
      ...row('shelterOpenRecent'),
      status: 'Closed',
      closed_date: '2026-10-04T09:30:00.000',
      resolution_description: MAPPINGS[0]!.pattern,
      resolution_action_updated_date: '2026-10-04T09:30:00.000',
      ':updated_at': '2026-10-05T01:00:00.000Z',
    }]
    const run = await sync(store, closed, plusDays(T0, 2))
    expect(run).toMatchObject({mode: 'incremental', updated: 1, statusEvents: 1})
    expect(pet(store, key).outcome).toBe('adopted')
    const last = eventsFor(store, key).at(-1)!
    expect(last).toMatchObject({from: 'shelter', to: 'adopted'})
    expect(last.cause).toMatchObject({kind: 'complaintChange', complaint: {_ref: `complaint311-${key}`}, field: 'status', oldValue: 'Open', newValue: 'Closed'})

    const again = await sync(store, closed, plusDays(T0, 2))
    expect(again).toMatchObject({updated: 0, statusEvents: 0})
  })

  it('the 60-day rule turns an open pet feral on a fixed clock, with no record change', async () => {
    const store = storeWithMappings()
    const nearFeral = ROWS.openNearFeral!
    await sync(store, () => [row('openNearFeral')])
    expect(pet(store, nearFeral.unique_key).outcome).toBe('shelter')

    // created 2026-08-20 16:22:35 New York (EDT) = 20:22:35Z; feral exactly 60 days later.
    const feralAt = new Date('2026-10-19T20:22:35Z')
    const before = await sync(store, () => [], new Date(feralAt.getTime() - 1000))
    expect(before.statusEvents).toBe(0)
    expect(pet(store, nearFeral.unique_key).outcome).toBe('shelter')

    const after = await sync(store, () => [], feralAt)
    expect(after.statusEvents).toBe(1)
    expect(pet(store, nearFeral.unique_key).outcome).toBe('feral')
    expect(eventsFor(store, nearFeral.unique_key).at(-1)).toMatchObject({from: 'shelter', to: 'feral', at: '2026-10-19T20:22:35.000Z', cause: {kind: 'timeRule'}})
  })

  it('a new mapping document moves unmapped pets, recorded as a mapping change', async () => {
    const store = storeWithMappings()
    await sync(store, allRows)
    const key = ROWS.unmappedClosed!.unique_key
    store.docs.set('resolutionMapping-test', {
      _id: 'resolutionMapping-test', _type: 'resolutionMapping', matchType: 'exact', outcome: 'transferred',
      pattern: String(ROWS.unmappedClosed!.resolution_description),
    })
    const run = await sync(store, () => [], plusDays(T0, 1))
    expect(run.statusEvents).toBe(1)
    expect(pet(store, key).outcome).toBe('transferred')
    expect(eventsFor(store, key).at(-1)).toMatchObject({from: 'unmapped', to: 'transferred', cause: {kind: 'mappingChange', mapping: {_ref: 'resolutionMapping-test'}}})
  })

  it('keeps a model-restyled bio until the facts under it change', async () => {
    const store = storeWithMappings()
    await sync(store, allRows)
    const id = `pothole-${ROWS.shelterOpenRecent!.unique_key}`
    const p = store.docs.get(id)! as unknown as PetDoc
    store.docs.set(id, {...p, bio: 'restyled', bioMeta: {...p.bioMeta, source: 'model', model: 'test'}} as never)
    await sync(store, () => [], T0)
    expect((store.docs.get(id) as unknown as PetDoc).bio).toBe('restyled')

    await sync(store, () => [{...row('shelterOpenRecent'), status: 'Pending', ':updated_at': '2026-10-05T00:00:00.000Z'}], plusDays(T0, 1))
    expect((store.docs.get(id) as unknown as PetDoc).bioMeta.source).toBe('template')
  })
})

describe('paging and outages', () => {
  it('pages with $limit/$offset in a stable order until a short page', async () => {
    const soda = fakeSoda(allRows)
    const pages = []
    for await (const p of fetchPages({where: 'x', pageSize: 4, fetchImpl: soda.impl})) pages.push(p)
    expect(pages.map((p) => p.rows.length)).toEqual([4, 4, 1])
    expect(soda.calls.map((u) => u.searchParams.get('$offset'))).toEqual(['0', '4', '8'])
    expect(soda.calls.every((u) => u.searchParams.get('$order') === ':id')).toBe(true)
    expect(new Set(pages.flatMap((p) => p.rows.map((r) => r.unique_key))).size).toBe(9)
  })

  it('sends the app token in X-App-Token', async () => {
    let header: string | null = null
    const impl = (async (_u: URL, init?: RequestInit) => {
      header = new Headers(init?.headers).get('X-App-Token')
      return new Response('[]')
    }) as unknown as typeof fetch
    for await (const _ of fetchPages({where: 'x', appToken: 'tok', fetchImpl: impl})) void _
    expect(header).toBe('tok')
  })

  it('an API outage fails the run, keeps the last good data, and leaves the reason for the banner', async () => {
    const store = storeWithMappings()
    const good = await sync(store, allRows)
    const snapshot = JSON.stringify([...store.docs.entries()].filter(([, d]) => d._type !== 'syncRun'))

    const failed = await runSync({store, fetchImpl: failingSoda(503), clock: at(plusDays(T0, 1)), sleep: noSleep})
    expect(failed.state).toBe('failed')
    expect(failed.error).toMatch(/SODA 503/)
    expect(JSON.stringify([...store.docs.entries()].filter(([, d]) => d._type !== 'syncRun'))).toBe(snapshot)

    // What the stale-data banner needs: the last good run's time and the latest failure's reason.
    const runs = store.ofType<SyncRunDoc>('syncRun').sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    expect(runs[0]).toMatchObject({state: 'failed', error: failed.error})
    expect(runs.find((r) => r.state === 'succeeded')!.startedAt).toBe(good.startedAt)
  })

  it('retries a transient 503 before succeeding', async () => {
    let n = 0
    const flaky = (async () => (++n === 1 ? new Response('busy', {status: 503}) : new Response('[]'))) as unknown as typeof fetch
    const store = storeWithMappings()
    const run = await runSync({store, fetchImpl: flaky, clock: at(T0), sleep: noSleep})
    expect(run.state).toBe('succeeded')
    expect(n).toBe(2)
  })
})

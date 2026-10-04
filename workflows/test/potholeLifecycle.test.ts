import type {Actor} from '@sanity/workflow-engine'
import {createBench, subjectField} from '@sanity/workflow-engine-test'
import {describe, expect, it} from 'vitest'
import {potholeLifecycle} from '../src/potholeLifecycle.ts'

// Real fixture: complaint 70133745 (Queens CB 13) was filed 2026-08-20 16:22:35 New York
// time = 20:22:35Z, so the 60-day rule makes it feral at 2026-10-19T20:22:35Z.
const PET = 'pothole-70133745'
const FERAL_AT = '2026-10-19T20:22:35.000Z'

const syncActor: Actor = {kind: 'system', id: 'p-syncRobot01', roles: ['editor']}
const person: Actor = {kind: 'person', id: 'gStaffMember01', roles: ['editor']}

async function start(now = '2026-10-03T20:00:00.000Z') {
  const bench = createBench({now, documents: [{_id: PET, _type: 'pothole'}]})
  await bench.deployDefinitions({expectedMinReaderModel: 10, definitions: [potholeLifecycle]})
  const {instance} = await bench.startInstance({
    definition: 'pothole-lifecycle',
    initialFields: [subjectField(PET, {type: 'pothole'}), {type: 'datetime', name: 'feralAt', value: FERAL_AT}],
  })
  return {bench, id: instance._id}
}

const record = (bench: Awaited<ReturnType<typeof start>>['bench'], id: string, outcome: string, actor = syncActor) =>
  bench.fireAction({
    instanceId: id,
    activity: 'city-record',
    action: 'record-outcome',
    params: {outcome, complaint: 'complaint311-70133745', field: 'status'},
    actor,
  })

describe('potholeLifecycle (engine test bench)', () => {
  it('admits a reported pet straight into the shelter', async () => {
    const {bench, id} = await start()
    expect(await bench.currentStage(id)).toBe('shelter')
  })

  it('turns feral exactly at 60 days on the bench clock, not a moment before', async () => {
    const {bench, id} = await start()
    bench.setNow('2026-10-19T20:22:34.000Z')
    await bench.tick({instanceId: id})
    expect(await bench.currentStage(id)).toBe('shelter')

    bench.setNow(FERAL_AT)
    await bench.tick({instanceId: id})
    expect(await bench.currentStage(id)).toBe('feral')
  })

  it.each([
    ['adopted', 'adopted'],
    ['ghost', 'ghost'],
    ['transferred', 'transferred'],
    ['unmapped', 'unmapped'],
  ])('the sync recording "%s" moves the pet to %s, keeping the cause', async (outcome, stage) => {
    const {bench, id} = await start()
    await record(bench, id, outcome)
    expect(await bench.currentStage(id)).toBe(stage)
    const inst = await bench.getInstance({instanceId: id})
    const fields = Object.fromEntries((inst.fields ?? []).map((f: {name: string; value?: unknown}) => [f.name, f.value]))
    expect(fields).toMatchObject({outcome, causeComplaint: 'complaint311-70133745', causeField: 'status'})
  })

  it('a feral pet can still be adopted when the city repairs it', async () => {
    const {bench, id} = await start()
    bench.setNow(FERAL_AT)
    await bench.tick({instanceId: id})
    await record(bench, id, 'adopted')
    expect(await bench.currentStage(id)).toBe('adopted')
  })

  it('an unmapped pet moves on once a mapping exists and the sync re-records it', async () => {
    const {bench, id} = await start()
    await record(bench, id, 'unmapped')
    await record(bench, id, 'transferred')
    expect(await bench.currentStage(id)).toBe('transferred')
  })

  it('a closed pet never turns feral, however long the clock runs', async () => {
    const {bench, id} = await start()
    await record(bench, id, 'ghost')
    bench.setNow('2027-06-01T00:00:00.000Z')
    await bench.tick({instanceId: id})
    expect(await bench.currentStage(id)).toBe('ghost')
  })

  it('only the sync role may record an outcome: a person is refused and nothing moves', async () => {
    const {bench, id} = await start()
    // Refused by the role gate specifically (ActionDisabledError), not by some other failure.
    await expect(record(bench, id, 'adopted', person)).rejects.toThrow(/not allowed: action filter returned false/)
    expect(await bench.currentStage(id)).toBe('shelter')
  })
})

import type {Actor} from '@sanity/workflow-engine'
import {createBench, subjectField} from '@sanity/workflow-engine-test'
import {describe, expect, it} from 'vitest'
import {adoptionModeration, clusterReview} from '../src/review.ts'

// Realistic id shapes matter: account-global user ids start 'g', robot tokens start 'p-'.
const person: Actor = {kind: 'person', id: 'gStaffMember01', roles: ['editor']}
const agent: Actor = {kind: 'agent', id: 'p-agentProposer01', roles: ['editor']} // the cluster proposer runs on a robot token
const robot: Actor = {kind: 'system', id: 'p-syncRobot01', roles: ['editor']}

const cases = [
  {def: clusterReview, waiting: 'proposed', subject: 'clusterDecision-68586622-68589432', type: 'clusterDecision'},
  {def: adoptionModeration, waiting: 'submitted', subject: 'adoption-1', type: 'adoption'},
] as const

async function start(c: (typeof cases)[number]) {
  const bench = createBench({now: '2026-10-04T00:00:00.000Z', documents: [{_id: c.subject, _type: c.type}]})
  await bench.deployDefinitions({expectedMinReaderModel: 10, definitions: [c.def]})
  const {instance} = await bench.startInstance({definition: c.def.name, initialFields: [subjectField(c.subject, {type: c.type})]})
  const fire = (action: 'approve' | 'reject', actor: Actor) =>
    bench.fireAction({instanceId: instance._id, activity: 'review', action, params: {note: 'test'}, actor})
  return {bench, id: instance._id, fire}
}

describe.each(cases)('$def.name', (c) => {
  it(`starts ${c.waiting}`, async () => {
    const {bench, id} = await start(c)
    expect(await bench.currentStage(id)).toBe(c.waiting)
  })

  it('a person can approve, and the decision records who and when', async () => {
    const {bench, id, fire} = await start(c)
    await fire('approve', person)
    expect(await bench.currentStage(id)).toBe('approved')
    const inst = await bench.getInstance({instanceId: id})
    const fields = Object.fromEntries((inst.fields ?? []).map((f: {name: string; value?: unknown}) => [f.name, f.value]))
    expect(fields.decision).toBe('approved')
    expect(fields.decidedBy).toMatchObject({id: 'gStaffMember01'})
    expect(fields.decidedAt).toBe('2026-10-04T00:00:00.000Z')
  })

  it('a person can reject', async () => {
    const {bench, id, fire} = await start(c)
    await fire('reject', person)
    expect(await bench.currentStage(id)).toBe('rejected')
  })

  it.each([
    ['an agent', agent],
    ['the sync robot', robot],
  ])('%s cannot decide; the item stays waiting', async (_label, actor) => {
    const {bench, id, fire} = await start(c)
    await expect(fire('approve', actor)).rejects.toThrow(/not allowed: action filter returned false/)
    await expect(fire('reject', actor)).rejects.toThrow(/not allowed: action filter returned false/)
    expect(await bench.currentStage(id)).toBe(c.waiting)
  })
})

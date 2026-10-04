import {describe, expect, it} from 'vitest'
import {CLAIMED, feralAtFor, planLifecycles, type LifecyclePet} from '../src/lifecycle.ts'

const base: LifecyclePet = {_id: 'pothole-1', outcome: 'shelter', firstReportedAt: '2026-08-20T20:22:35.000Z'}
const last = {to: 'adopted', cause: {complaint: {_ref: 'complaint311-1'}, field: 'status'}}

describe('planLifecycles', () => {
  it('starts an instance for an open pet without one, feral at exactly 60 days', () => {
    expect(planLifecycles([base])).toEqual([{kind: 'start', petId: 'pothole-1', feralAt: '2026-10-19T20:22:35.000Z', expectStage: 'shelter'}])
    expect(feralAtFor('2026-08-20T20:22:35.000Z')).toBe('2026-10-19T20:22:35.000Z')
  })

  it('starts feral pets too (the engine cascades them straight to feral)', () => {
    expect(planLifecycles([{...base, outcome: 'feral'}])[0]).toMatchObject({kind: 'start', expectStage: 'feral'})
  })

  it('never back-fills pets that closed before the engine existed', () => {
    expect(planLifecycles([{...base, outcome: 'adopted', last}])).toEqual([])
  })

  it('records a closing outcome once, citing the same cause as the status event', () => {
    const pet = {...base, outcome: 'adopted', lifecycle: {instance: 'prod.wf-instance.1', stage: 'shelter'}, last}
    expect(planLifecycles([pet])).toEqual([
      {kind: 'record', petId: 'pothole-1', instance: 'prod.wf-instance.1', outcome: 'adopted', complaint: 'complaint311-1', field: 'status'},
    ])
    // Once the sync has driven it to the same stage, nothing more happens.
    expect(planLifecycles([{...pet, lifecycle: {instance: 'prod.wf-instance.1', stage: 'adopted'}}])).toEqual([])
  })

  it('ticks only the pets the 60-day rule just turned feral', () => {
    const pets: LifecyclePet[] = [
      {...base, _id: 'a', outcome: 'feral', lifecycle: {instance: 'i-a', stage: 'shelter'}},
      {...base, _id: 'b', outcome: 'feral', lifecycle: {instance: 'i-b', stage: 'feral'}},
      {...base, _id: 'c', outcome: 'shelter', lifecycle: {instance: 'i-c', stage: 'shelter'}},
    ]
    expect(planLifecycles(pets)).toEqual([{kind: 'tick', petId: 'a', instance: 'i-a'}])
  })

  it('a steady state plans nothing (no requests spent)', () => {
    const pets: LifecyclePet[] = [
      {...base, lifecycle: {instance: 'i', stage: 'shelter'}},
      {...base, _id: 'g', outcome: 'ghost', lifecycle: {instance: 'j', stage: 'ghost'}},
    ]
    expect(planLifecycles(pets)).toEqual([])
  })
})

describe('claims', () => {
  const now = Date.parse('2026-10-04T18:00:00.000Z')
  it('skips a pet another runner claimed recently', () => {
    const pet = {...base, lifecycle: {instance: CLAIMED, stage: CLAIMED, claimedAt: '2026-10-04T17:55:00.000Z'}}
    expect(planLifecycles([pet], now)).toEqual([])
  })
  it('retries a claim abandoned for over 15 minutes', () => {
    const pet = {...base, lifecycle: {instance: CLAIMED, stage: CLAIMED, claimedAt: '2026-10-04T17:30:00.000Z'}}
    expect(planLifecycles([pet], now)).toMatchObject([{kind: 'start', petId: 'pothole-1'}])
  })
})

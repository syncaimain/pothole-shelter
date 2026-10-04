import {describe, expect, it} from 'vitest'
import {CLUSTER_METRES, linkBetween, metresBetween, proposeClusters} from '../src/cluster.ts'
import {splitRow, type RawRecord} from '../src/soda.ts'
import {row} from './helpers.ts'

// Hand-made cases built from one real located row (68586622) and one real stray (68589432),
// changing only what each case is about. Metres per degree of latitude ≈ 111,195.
const base = splitRow(row('repairedWithCoords')).raw
const stray = splitRow(row('ghostNoCoords')).raw
const LAT_PER_M = 1 / 111_195

let n = 0
function at(dMetresNorth: number, created: string, over: Partial<RawRecord> = {}): RawRecord {
  return {
    ...base,
    unique_key: `9000000${n++}`,
    latitude: String(Number(base.latitude) + dMetresNorth * LAT_PER_M),
    created_date: created,
    ...over,
  }
}

describe('the 60 m / 30 days / same street rule', () => {
  it('measures distance correctly enough for a 60 m threshold', () => {
    const a = {lat: 40.7, lng: -73.75}
    expect(metresBetween(a, {lat: a.lat + 50 * LAT_PER_M, lng: a.lng})).toBeCloseTo(50, 0)
  })

  it('links two complaints 40 m and 10 days apart on the same street', () => {
    const link = linkBetween(at(0, '2026-05-01T10:00:00.000'), at(40, '2026-05-11T10:00:00.000'))
    expect(link).toMatchObject({basis: 'distance'})
    expect(link!.metres!).toBeCloseTo(40, 0)
  })

  it('does not link at 61 m', () => {
    expect(linkBetween(at(0, '2026-05-01T10:00:00.000'), at(61, '2026-05-02T10:00:00.000'))).toBeUndefined()
  })

  it('does not link 31 days apart', () => {
    expect(linkBetween(at(0, '2026-05-01T10:00:00.000'), at(10, '2026-06-01T10:00:01.000'))).toBeUndefined()
  })

  it('treats street spelling case and spacing as the same street', () => {
    const odd = ` ${String(base.intersection_street_1).toLowerCase()}  `
    expect(linkBetween(at(0, '2026-05-01T10:00:00.000'), at(5, '2026-05-01T11:00:00.000', {intersection_street_1: odd}))).toBeDefined()
  })

  it('puts an intersection on both of its streets (real rows have no street_name there)', () => {
    expect(base.address_type).toBe('INTERSECTION')
    expect(base.street_name).toBeUndefined()
    // A blockface complaint on the intersection's second street, 30 m away, links to it.
    const onCross = at(30, '2026-04-10T10:00:00.000', {
      address_type: 'BLOCKFACE',
      street_name: base.intersection_street_2,
      intersection_street_1: undefined,
      intersection_street_2: undefined,
    })
    expect(linkBetween(base, onCross)).toMatchObject({basis: 'distance'})
  })

  it('does not link across streets, however close (intersections too)', () => {
    const elsewhere = {intersection_street_1: 'ANOTHER STREET', intersection_street_2: 'YET ANOTHER'}
    expect(linkBetween(at(0, '2026-05-01T10:00:00.000'), at(5, '2026-05-01T11:00:00.000', elsewhere))).toBeUndefined()
  })

  it('links strays only when they describe the same block, and records no distance', () => {
    const s1 = {...stray, unique_key: 's1'}
    const s2 = {...stray, unique_key: 's2', created_date: '2026-04-20T09:00:00.000', cross_street_1: stray.cross_street_2, cross_street_2: stray.cross_street_1}
    expect(linkBetween(s1, s2)).toEqual({basis: 'same-block'})
    expect(linkBetween(s1, {...s2, cross_street_2: 'SOMEWHERE ELSE'})).toBeUndefined()
  })

  it('never links a stray to a located complaint (nothing to measure between them)', () => {
    expect(linkBetween({...stray, street_name: base.street_name, created_date: base.created_date}, base)).toBeUndefined()
  })
})

describe('proposals', () => {
  it('a single complaint is not proposed (it is its own pet automatically)', () => {
    expect(proposeClusters([at(0, '2026-05-01T10:00:00.000')])).toEqual([])
  })

  it('proposes a group with its true spread, even when chaining stretches past 60 m', () => {
    const chain = [at(0, '2026-05-01T10:00:00.000'), at(50, '2026-05-05T10:00:00.000'), at(100, '2026-05-09T10:00:00.000')]
    const [p, ...rest] = proposeClusters(chain)
    expect(rest).toEqual([])
    expect(p!.complaints.map((c) => c._key)).toEqual(chain.map((c) => c.unique_key))
    expect(p!.distanceMetres).toBeGreaterThan(CLUSTER_METRES) // honest: the reviewer sees ~100 m
    expect(p!.daysApart).toBe(8)
    expect(p!).toMatchObject({proposedBy: 'rule', decision: 'proposed'})
    expect(p!.reason).toMatch(/3 complaints on .+ within 100 m .+ 8 days apart/)
  })

  it('stray proposals say what they rest on and carry no distance', () => {
    const s1 = {...stray, unique_key: 's1'}
    const s2 = {...stray, unique_key: 's2', created_date: '2026-04-20T09:00:00.000'}
    const [p] = proposeClusters([s1, s2])
    expect(p!.distanceMetres).toBeUndefined()
    expect(p!.reason).toMatch(/same block .+ no coordinates to measure/)
  })

  it('proposal IDs are deterministic and dot-free, so re-running proposes nothing new', () => {
    const group = [at(0, '2026-05-01T10:00:00.000'), at(20, '2026-05-02T10:00:00.000')]
    const a = proposeClusters(group)
    const b = proposeClusters([...group].reverse())
    expect(a.map((p) => p._id)).toEqual(b.map((p) => p._id))
    expect(a[0]!._id).not.toContain('.')
  })
})

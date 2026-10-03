import {describe, expect, it} from 'vitest'
import {canonicalJson, hashOf} from '../src/hash.ts'
import {matchResolution} from '../src/mapping.ts'
import {complaintOutcome} from '../src/outcome.ts'
import {derivePet, petName} from '../src/pets.ts'
import {fullWhere, incrementalWhere, inScope, splitRow} from '../src/soda.ts'
import {parseNycLocal} from '../src/time.ts'
import {MAPPINGS, row, ROWS, T0} from './helpers.ts'

describe('time', () => {
  it('reads 311 floating timestamps as New York wall-clock time, across DST', () => {
    expect(parseNycLocal('2026-08-20T16:22:35.000')!.toISOString()).toBe('2026-08-20T20:22:35.000Z') // EDT
    expect(parseNycLocal('2026-01-15T09:00:00.000')!.toISOString()).toBe('2026-01-15T14:00:00.000Z') // EST
    expect(parseNycLocal(undefined)).toBeUndefined()
  })
})

describe('hashing', () => {
  it('ignores key order', () => {
    expect(canonicalJson({b: 1, a: {d: 2, c: 3}})).toBe('{"a":{"c":3,"d":2},"b":1}')
    expect(hashOf({a: 1, b: 2})).toBe(hashOf({b: 2, a: 1}))
  })
})

describe('resolution matching', () => {
  it('matches real texts exactly, ignoring case and whitespace differences', () => {
    const text = String(ROWS.repairedWithCoords!.resolution_description)
    expect(matchResolution(text, MAPPINGS)).toMatchObject({kind: 'matched', mapping: {outcome: 'adopted'}})
    expect(matchResolution(`  ${text.toUpperCase().replace(/ /g, '  ')} `, MAPPINGS).kind).toBe('matched')
  })

  it('leaves unknown wording unmapped rather than guessing', () => {
    expect(matchResolution(String(ROWS.unmappedClosed!.resolution_description), MAPPINGS).kind).toBe('unmatched')
    expect(matchResolution('The Department of Transportation repaired the problem.', MAPPINGS).kind).toBe('unmatched')
    expect(matchResolution(undefined, MAPPINGS).kind).toBe('unmatched')
  })

  it('refuses to pick between contains-patterns that disagree', () => {
    const m = [
      {_id: 'a', pattern: 'repaired', matchType: 'contains' as const, outcome: 'adopted' as const},
      {_id: 'b', pattern: 'problem', matchType: 'contains' as const, outcome: 'ghost' as const},
    ]
    expect(matchResolution('repaired the problem', m).kind).toBe('conflict')
  })

  it('never applies a mapping to an open complaint', () => {
    const pending = {...splitRow(row('feralPending')).raw, resolution_description: MAPPINGS[0]!.pattern}
    expect(complaintOutcome(pending, MAPPINGS, T0).outcome).toBe('feral')
  })
})

describe('scope queries', () => {
  it('full = window or still open; incremental = everything touched since the watermark', () => {
    expect(fullWhere(T0)).toContain("community_board='13 QUEENS'")
    expect(fullWhere(T0)).toContain("(created_date > '2026-04-06T20:00:00' OR status != 'Closed')")
    expect(incrementalWhere('2026-10-03T01:39:26.742Z')).toContain(":updated_at >= '2026-10-03T01:39:26.742Z'")
    expect(incrementalWhere('x')).not.toContain('status')
  })

  it('keeps old open complaints in scope and drops old closed ones', () => {
    expect(inScope(splitRow(row('feralPending')).raw, T0)).toBe(true)
    expect(inScope({...splitRow(row('feralPending')).raw, status: 'Closed'}, T0)).toBe(false)
  })
})

describe('pets', () => {
  it('names are deterministic per first complaint key', () => {
    expect(petName('68586622')).toBe(petName('68586622'))
    expect(petName('68586622')).not.toBe(petName('68589432'))
  })

  it('bios never include a house number, only street names', () => {
    const r = splitRow(row('addressWithHouseNumber')).raw
    const {bio} = derivePet(r.unique_key, [{id: 'x', raw: r}], MAPPINGS, T0)
    expect(String(r.incident_address)).toMatch(/^218-16 /)
    expect(bio).not.toContain('218-16')
  })

  it('bios restate record facts: the reported date and the city\'s note verbatim', () => {
    const r = splitRow(row('repairedWithCoords')).raw
    const {bio} = derivePet(r.unique_key, [{id: 'x', raw: r}], MAPPINGS, T0)
    expect(bio).toContain('April 7, 2026')
    expect(bio).toContain(`"${r.resolution_description}"`)
    expect(bio).toMatch(/adopted into forever pavement/)
  })

  it('temperament: three or more complaints makes a pet grumpy', () => {
    const r = splitRow(row('repairedWithCoords')).raw
    const three = [0, 1, 2].map((i) => ({id: `c${i}`, raw: {...r, unique_key: `${r.unique_key}${i}`}}))
    expect(derivePet('k', three, MAPPINGS, T0).fields.temperament).toBe('grumpy')
  })
})

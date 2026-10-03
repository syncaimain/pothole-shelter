import {readFileSync} from 'node:fs'
import {matchResolution} from '@pothole/sync'
import {describe, expect, it} from 'vitest'
import {MAPPINGS} from '../mappings.ts'

// The discovery output: every real resolution text in scope, with counts by status.
const discovery = JSON.parse(readFileSync(new URL('../data/resolutions.json', import.meta.url), 'utf8')) as {
  phrases: {text: string; total: number; byStatus: Record<string, number>}[]
}

const DELIBERATELY_UNMAPPED = [
  /currently not available online/,
  /will schedule the repair/,
  /defect was not accessible/,
]

describe('resolution mappings against the real discovery texts', () => {
  it('every mapping pattern is a text the city actually used', () => {
    const texts = new Set(discovery.phrases.map((p) => p.text))
    for (const m of MAPPINGS) expect(texts, m._id).toContain(m.pattern)
  })

  it('every real text either maps or is on the deliberate unmapped list', () => {
    for (const {text} of discovery.phrases) {
      const mapped = matchResolution(text, MAPPINGS).kind === 'matched'
      const excused = DELIBERATELY_UNMAPPED.some((re) => re.test(text))
      expect(mapped !== excused, text).toBe(true)
    }
  })

  it('mapping IDs contain no dots and every mapping has a rationale', () => {
    for (const m of MAPPINGS) {
      expect(m._id).not.toContain('.')
      expect(m.rationale.length).toBeGreaterThan(40)
    }
  })
})

import type {MAPPABLE_OUTCOMES} from './domain.ts'

export type MappableOutcome = (typeof MAPPABLE_OUTCOMES)[number]

/** The fields of a resolutionMapping document the sync needs. */
export interface ResolutionMapping {
  _id: string
  pattern: string
  matchType: 'exact' | 'contains'
  outcome: MappableOutcome
}

export const normalizePhrase = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

export type MatchResult =
  | {kind: 'matched'; mapping: ResolutionMapping}
  | {kind: 'unmatched'}
  | {kind: 'conflict'; mappings: ResolutionMapping[]}

/**
 * Exact patterns win over `contains` patterns. If several `contains` patterns match and
 * disagree on the outcome, nothing is guessed: the phrase is a conflict and stays unmapped.
 */
export function matchResolution(text: string | undefined, mappings: readonly ResolutionMapping[]): MatchResult {
  if (!text) return {kind: 'unmatched'}
  const phrase = normalizePhrase(text)
  const exact = mappings.find((m) => m.matchType === 'exact' && normalizePhrase(m.pattern) === phrase)
  if (exact) return {kind: 'matched', mapping: exact}
  const hits = mappings.filter((m) => m.matchType === 'contains' && phrase.includes(normalizePhrase(m.pattern)))
  if (hits.length === 0) return {kind: 'unmatched'}
  if (new Set(hits.map((h) => h.outcome)).size > 1) return {kind: 'conflict', mappings: hits}
  return {kind: 'matched', mapping: hits[0]!}
}

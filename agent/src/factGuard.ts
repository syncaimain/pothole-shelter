// The fact guard: a model may restyle a pet's bio, but may not change or add a fact.
// The template bio (built by the sync from the 311 record) is the source of truth; a
// candidate is accepted only if every date, number and street it mentions is in the
// template, the city's quoted note survives word for word, and the tone rule holds.

export interface GuardResult {
  ok: boolean
  reasons: string[]
}

const MONTH = '(January|February|March|April|May|June|July|August|September|October|November|December)'
const FULL_DATE = new RegExp(`\\b${MONTH} \\d{1,2}, \\d{4}\\b`, 'g')
const MONTH_DAY = new RegExp(`\\b${MONTH} \\d{1,2}\\b`, 'g')
const NUMBER = /\d+(?:[.,]\d+)*/g
const STREET =
  /\b(?:\d+ |[A-Z][a-z]+ )*(?:Street|Avenue|Boulevard|Road|Place|Lane|Drive|Parkway|Turnpike|Expressway|Court|Way|Highway|Terrace|Crescent)\b/g
const QUOTE = /"([^"]{20,})"/g
// Contempt for the people who report or fix potholes fails the guard (the shelter's tone rule).
const CONTEMPT = /\b(idiot|stupid|lazy|useless|incompetent|morons?|dumb|scum|hate|blame|whin\w*|complain(?:er|ers)|slack\w*|can'?t be bothered)\b/i
const LINK = /(https?:\/\/|www\.)/i
export const MAX_BIO = 700

const all = (re: RegExp, s: string) => [...s.matchAll(re)].map((m) => m[0])
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

export function checkBio(candidate: string, template: string): GuardResult {
  const reasons: string[] = []
  const c = norm(candidate)
  const t = norm(template)
  if (!c) return {ok: false, reasons: ['empty bio']}
  if (c.length > MAX_BIO) reasons.push(`longer than ${MAX_BIO} characters`)
  if (LINK.test(c)) reasons.push('contains a link')
  if (CONTEMPT.test(c)) reasons.push('tone: contempt for residents or crews')

  for (const d of new Set(all(FULL_DATE, c))) if (!t.includes(d)) reasons.push(`date not in the record: ${d}`)
  const datesInTemplate = all(FULL_DATE, t)
  for (const d of new Set(all(MONTH_DAY, c))) {
    if (!datesInTemplate.some((full) => full.startsWith(d + ','))) reasons.push(`date not in the record: ${d}`)
  }
  const templateNumbers = new Set(all(NUMBER, t))
  for (const n of new Set(all(NUMBER, c))) if (!templateNumbers.has(n)) reasons.push(`number not in the record: ${n}`)
  for (const s of new Set(all(STREET, c))) if (!t.includes(s)) reasons.push(`street not in the record: ${s}`)

  // The city's own words stay the city's own words.
  for (const q of all(QUOTE, t)) if (!c.includes(q)) reasons.push('the city’s quoted note was changed or dropped')

  return {ok: reasons.length === 0, reasons}
}

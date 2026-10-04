import {describe, expect, it} from 'vitest'
import {checkBio} from '../src/factGuard.ts'

// A real template bio as the sync wrote it (pet "Button Hollowell", complaint filed April 7, 2026).
const NOTE = '"The Department of Transportation inspected this complaint and repaired the problem."'
const TEMPLATE = `Button Hollowell was first reported on April 7, 2026 on 260 Street between 75 Avenue and Union Turnpike, in Community Board 13, Queens. The city's note on May 29, 2026: ${NOTE} After 51 days in the shelter, Button Hollowell has been adopted into forever pavement. Congratulations, 260 Street!`

const FAITHFUL = `Meet Button Hollowell! First spotted on April 7, 2026 on 260 Street between 75 Avenue and Union Turnpike (Community Board 13, Queens), this little dip waited 51 days for help. On May 29, 2026 the city wrote: ${NOTE} Button Hollowell is now adopted into forever pavement. Hooray for 260 Street!`

describe('fact guard', () => {
  it('accepts a restyle that keeps every fact', () => {
    expect(checkBio(FAITHFUL, TEMPLATE)).toEqual({ok: true, reasons: []})
  })

  it('rejects a bio with a wrong date (the spec’s test)', () => {
    const r = checkBio(FAITHFUL.replace('April 7, 2026', 'April 8, 2026'), TEMPLATE)
    expect(r.ok).toBe(false)
    expect(r.reasons).toContain('date not in the record: April 8, 2026')
  })

  it('rejects a date given without a year if no record date matches it', () => {
    expect(checkBio(FAITHFUL.replace('On May 29, 2026', 'On June 2'), TEMPLATE).reasons).toContain('date not in the record: June 2')
  })

  it('rejects an invented number', () => {
    expect(checkBio(FAITHFUL.replace('51 days', '52 days'), TEMPLATE).reasons).toContain('number not in the record: 52')
  })

  it('rejects an invented street', () => {
    const r = checkBio(FAITHFUL.replace('Union Turnpike', 'Hillside Avenue'), TEMPLATE)
    expect(r.reasons).toContain('street not in the record: Hillside Avenue')
  })

  it('rejects a bio that paraphrases or drops the city’s note', () => {
    const r = checkBio(FAITHFUL.replace(NOTE, 'the city fixed it'), TEMPLATE)
    expect(r.reasons).toContain('the city’s quoted note was changed or dropped')
  })

  it('rejects contempt for residents or crews', () => {
    const r = checkBio(FAITHFUL.replace('Hooray for 260 Street!', 'About time the lazy crews showed up.'), TEMPLATE)
    expect(r.reasons).toContain('tone: contempt for residents or crews')
  })

  it('rejects links and empty output', () => {
    expect(checkBio(`${FAITHFUL} www.example.com`, TEMPLATE).reasons).toContain('contains a link')
    expect(checkBio('   ', TEMPLATE)).toEqual({ok: false, reasons: ['empty bio']})
  })
})

import {describe, expect, it} from 'vitest'
import {isPersonId, MESSAGE_MAX, pendingId, PUBLIC_ADOPTION_FILTER, publicId, validateAdoption} from './adopt'

const ok = {displayName: 'Ana from 212 Place', message: 'Rooting for you, little crater. Hope the crew gets to you soon!', website: ''}

describe('validateAdoption', () => {
  it('accepts a friendly note and tidies whitespace', () => {
    const r = validateAdoption({...ok, message: '  Rooting   for you!  '})
    expect(r).toEqual({ok: true, value: {displayName: 'Ana from 212 Place', message: 'Rooting for you!'}})
  })

  it('rejects empty and over-long fields', () => {
    expect(validateAdoption({...ok, displayName: '  '})).toMatchObject({ok: false, errors: {displayName: expect.any(String)}})
    expect(validateAdoption({...ok, message: 'x'.repeat(MESSAGE_MAX + 1)})).toMatchObject({ok: false, errors: {message: expect.stringMatching(/up to/)}})
  })

  it.each([
    ['a link', 'visit https://example.com'],
    ['a bare domain', 'see pothole-deals.com'],
    ['an email', 'write me at ana@example.org'],
    ['a phone number', 'call 718 555 0199'],
  ])('rejects %s', (_label, message) => {
    expect(validateAdoption({...ok, message})).toMatchObject({ok: false, errors: {message: expect.stringMatching(/links, email/)}})
  })

  it('rejects contempt for residents or crews (the tone rule)', () => {
    expect(validateAdoption({...ok, message: 'the road crews are lazy'})).toMatchObject({ok: false, errors: {message: expect.stringMatching(/kind place/)}})
  })

  it('a filled honeypot fails without saying why', () => {
    expect(validateAdoption({...ok, website: 'spam'})).toEqual({ok: false, errors: {form: 'Something went wrong. Please try again later.'}})
  })
})

describe('who may approve, and what is public', () => {
  it('only account-global user ids count as a person; robot tokens never do', () => {
    expect(isPersonId('gStaffMember01')).toBe(true)
    expect(isPersonId('p-syncRobot01')).toBe(false)
    expect(isPersonId('p8x7')).toBe(false)
    expect(isPersonId(undefined)).toBe(false)
  })

  it('pending notes use a dotted id (never served anonymously); approved ones do not', () => {
    expect(pendingId('u1')).toBe('pending.adoption-u1')
    expect(publicId('u1')).toBe('adoption-u1')
    expect(publicId('u1')).not.toContain('.')
  })

  it('the public filter demands approval by a person and excludes pending ids', () => {
    expect(PUBLIC_ADOPTION_FILTER).toContain('moderation == "approved"')
    expect(PUBLIC_ADOPTION_FILTER).toContain('string::startsWith(moderatedBy, "g")')
    expect(PUBLIC_ADOPTION_FILTER).toContain('path("pending.**")')
  })
})

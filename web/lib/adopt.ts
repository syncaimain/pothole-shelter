// Adoption notes: validation and the visibility rule. Pure, so it is unit-tested.
//
// Privacy model: the dataset is public-read, so a submitted note is stored under a dotted
// ID (`pending.adoption-<uuid>`). Sanity never serves dotted IDs to anonymous readers
// (verified 2026-10-04: 0 visible anonymously, 1 with a token). Only when a person approves
// it does a public `adoption-<uuid>` copy exist. Nothing a visitor types is public first.

export const NAME_MAX = 40
export const MESSAGE_MAX = 280
/** Per visitor (hashed IP) per hour, and for the whole site per hour. */
export const PER_VISITOR_PER_HOUR = 3
export const SITE_PER_HOUR = 60

export const pendingId = (uuid: string) => `pending.adoption-${uuid}`
export const publicId = (uuid: string) => `adoption-${uuid}`

export interface AdoptionInput {
  displayName: string
  message: string
  /** Honeypot: a hidden field people never fill in. */
  website: string
}

export type FieldErrors = Partial<Record<'displayName' | 'message' | 'form', string>>

// Notes are moderated by a person anyway; these filters only stop the obvious before it
// reaches the queue. The shelter's tone rule: no contempt for residents or road crews.
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co|xyz|ru|info)\b)/i
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i
const PHONE = /(\d[\s().-]?){7,}/
const ABUSE = /\b(idiot|stupid|lazy|useless|incompetent|morons?|dumb|scum|hate)\b/i

const clean = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim()

export function validateAdoption(raw: AdoptionInput): {ok: true; value: {displayName: string; message: string}} | {ok: false; errors: FieldErrors} {
  const errors: FieldErrors = {}
  // A filled honeypot gets the same generic answer as everything else, never a hint.
  if (raw.website.trim()) return {ok: false, errors: {form: 'Something went wrong. Please try again later.'}}

  const displayName = clean(raw.displayName)
  const message = clean(raw.message)
  if (!displayName) errors.displayName = 'Please add a name to sign your note.'
  else if (displayName.length > NAME_MAX) errors.displayName = `Names can be up to ${NAME_MAX} characters.`
  else if (!/^[\p{L}\p{N} .,'’-]+$/u.test(displayName)) errors.displayName = 'Names can use letters, numbers, spaces and simple punctuation.'

  if (!message) errors.message = 'Please write a short note.'
  else if (message.length > MESSAGE_MAX) errors.message = `Notes can be up to ${MESSAGE_MAX} characters.`
  else if (LINK.test(message) || EMAIL.test(message) || PHONE.test(message)) errors.message = 'Please leave out links, email addresses and phone numbers.'

  if (ABUSE.test(`${displayName} ${message}`)) {
    errors.message = 'The shelter is a kind place: please keep notes friendly to everyone, including the people who report and fix potholes.'
  }
  return Object.keys(errors).length ? {ok: false, errors} : {ok: true, value: {displayName, message}}
}

/**
 * Who may approve: a person. Account-global user ids start with "g"; robot tokens (the
 * sync, the agent) start with "p-". The public site only ever shows notes whose approver
 * is a person, so a note "approved" by a token stays hidden even if someone writes one.
 */
export const isPersonId = (id: unknown): id is string => typeof id === 'string' && /^g[A-Za-z0-9-]+$/.test(id) && !id.startsWith('p-')

/** The same rule as a GROQ filter, for the public query. */
export const PUBLIC_ADOPTION_FILTER = `_type == "adoption" && moderation == "approved" && string::startsWith(moderatedBy, "g") && !(_id in path("pending.**"))`

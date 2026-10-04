import {OUTCOMES, type Outcome} from '@pothole/sync/domain'

const TZ = 'America/New_York'

export const outcomeTitle = (o: string) =>
  o === 'reported' ? 'Reported' : (OUTCOMES.find((x) => x.value === o)?.title ?? o)

export const outcomeDescription = (o: Outcome) => OUTCOMES.find((x) => x.value === o)?.description ?? ''

/** A UTC instant, shown as a New York date. */
export const day = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-US', {timeZone: TZ, year: 'numeric', month: 'short', day: 'numeric'}) : '—'

export const dateTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString('en-US', {timeZone: TZ, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'})
    : '—'

/**
 * A 311 floating timestamp ("2026-04-07T13:03:16.000") is already New York wall-clock
 * time. Show it as written; never shift it through the server's time zone.
 */
export const floating = (s?: string) => {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return '—'
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!))
  return d.toLocaleString('en-US', {timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'})
}

export const daysSince = (iso?: string, now = Date.now()) => (iso ? Math.max(0, Math.floor((now - Date.parse(iso)) / 86_400_000)) : undefined)

/** Street names arrive in capitals; show them the way a sign would. */
export const street = (s?: string) => (s ? s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()) : undefined)

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

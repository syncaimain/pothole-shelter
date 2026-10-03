// 311 dates are Socrata "floating timestamps" (no zone), recorded in New York local time.
// Everything stored in Sanity is UTC ISO, so convert once, here.

const TZ = 'America/New_York'
export const DAY_MS = 86_400_000

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Minutes New York is ahead of UTC at `instant` (e.g. -240 in summer). */
function nyOffsetMinutes(instant: number): number {
  const p = Object.fromEntries(fmt.formatToParts(new Date(instant)).map((x) => [x.type, x.value]))
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!)
  return Math.round((asUtc - Math.floor(instant / 1000) * 1000) / 60_000)
}

/** "2026-10-01T11:45:59.000" (New York wall clock) → UTC Date. Undefined for missing/invalid input. */
export function parseNycLocal(local: string | undefined): Date | undefined {
  const m = local?.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (!m) return undefined
  const wall = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0))
  let t = wall - nyOffsetMinutes(wall) * 60_000
  // Re-check at the corrected instant so DST transitions land on the right side.
  const second = wall - nyOffsetMinutes(t) * 60_000
  if (second !== t) t = second
  return new Date(t)
}

export const toIso = (d: Date) => d.toISOString()

/** Whole days between two instants (floor), never negative. */
export const daysBetween = (from: Date, to: Date) => Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS))

/** "October 1, 2026" in New York time — the only date format bios use, so the fact guard can check it. */
export const longDate = (d: Date) =>
  d.toLocaleDateString('en-US', {timeZone: TZ, year: 'numeric', month: 'long', day: 'numeric'})

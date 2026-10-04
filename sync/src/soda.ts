import {sha256} from './hash.ts'
import {DAY_MS} from './time.ts'

// Verified live on 2026-10-03/04 — see docs/BUILD_LOG.md §2 and the scope decision.
export const DATASET_ID = 'erm2-nwe9'
export const SODA_ENDPOINT = `https://data.cityofnewyork.us/resource/${DATASET_ID}.json`
export const SCOPE = {
  complaintType: 'Street Condition',
  descriptor: 'Pothole',
  borough: 'QUEENS',
  communityBoard: '13 QUEENS',
  windowDays: 180,
} as const
export const PAGE_SIZE = 1000

/** One row as Socrata returns it. Values are strings except `location`; empty fields are omitted. */
export type SodaRow = {unique_key: string; ':updated_at'?: string} & Record<string, unknown>

/** The record exactly as stored on complaint311.raw: the row minus Socrata system fields. */
export type RawRecord = {unique_key: string} & Record<string, unknown>

export const rowUrl = (uniqueKey: string) => `${SODA_ENDPOINT}?unique_key=${encodeURIComponent(uniqueKey)}`

const q = (s: string) => `'${s.replaceAll("'", "''")}'`

/** Floating timestamp N days before `now`, as SoQL compares created_date. */
export function windowStart(now: Date): string {
  return new Date(now.getTime() - SCOPE.windowDays * DAY_MS).toISOString().slice(0, 19)
}

export function baseWhere(): string {
  return [
    `complaint_type=${q(SCOPE.complaintType)}`,
    `descriptor=${q(SCOPE.descriptor)}`,
    `borough=${q(SCOPE.borough)}`,
    `community_board=${q(SCOPE.communityBoard)}`,
  ].join(' AND ')
}

/** Full sync: the rolling window plus every complaint that is still not closed, whatever its age. */
export function fullWhere(now: Date): string {
  return `${baseWhere()} AND (created_date > ${q(windowStart(now))} OR status != 'Closed')`
}

/**
 * Incremental sync: everything in the base scope that Socrata changed since the watermark.
 * Deliberately not limited to window/open: a known complaint that just closed no longer
 * matches "status != Closed", and we must still see that change.
 */
export function incrementalWhere(watermark: string): string {
  return `${baseWhere()} AND :updated_at >= ${q(watermark)}`
}

/** A row is in scope if it is inside the window or still open. */
export function inScope(row: RawRecord, now: Date): boolean {
  const created = typeof row.created_date === 'string' ? row.created_date : ''
  return row.status !== 'Closed' || created > windowStart(now)
}

export function splitRow(row: SodaRow): {raw: RawRecord; sourceUpdatedAt?: string} {
  const raw: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) if (!k.startsWith(':')) raw[k] = v
  return {raw: raw as RawRecord, sourceUpdatedAt: row[':updated_at']}
}

export interface FetchedPage {
  index: number
  url: string
  /** The response body exactly as received; this is what gets snapshotted and hashed. */
  text: string
  sha256: string
  retrievedAt: string
  rows: SodaRow[]
}

export interface FetchOptions {
  where: string
  appToken?: string
  pageSize?: number
  fetchImpl?: typeof fetch
  clock?: () => Date
  /** Retries for 429/5xx/network errors, with a short linear backoff. */
  retries?: number
  sleep?: (ms: number) => Promise<void>
}

export class SodaError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'SodaError'
    this.status = status
  }
}

/** Pages through the query with a stable `$order=:id` until a short page comes back. */
export async function* fetchPages(opts: FetchOptions): AsyncGenerator<FetchedPage> {
  const {where, appToken, pageSize = PAGE_SIZE, fetchImpl = fetch, clock = () => new Date(), retries = 3} = opts
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  for (let index = 0; ; index++) {
    const url = new URL(SODA_ENDPOINT)
    url.searchParams.set('$select', '*, :updated_at')
    url.searchParams.set('$where', where)
    url.searchParams.set('$order', ':id')
    url.searchParams.set('$limit', String(pageSize))
    url.searchParams.set('$offset', String(index * pageSize))

    let text!: string // assigned by every path out of the retry loop
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetchImpl(url, {headers: appToken ? {'X-App-Token': appToken} : {}})
        text = await res.text()
        if (res.ok) break
        const retryable = res.status === 429 || res.status >= 500
        if (!retryable || attempt >= retries) {
          throw new SodaError(`SODA ${res.status}: ${text.slice(0, 200)}`, res.status)
        }
      } catch (err) {
        if (err instanceof SodaError || attempt >= retries) throw err
      }
      await sleep(1000 * (attempt + 1))
    }

    const rows = JSON.parse(text) as SodaRow[]
    if (!Array.isArray(rows)) throw new SodaError(`SODA returned a non-array body: ${text.slice(0, 200)}`)
    yield {index, url: url.toString(), text, sha256: sha256(text), retrievedAt: clock().toISOString(), rows}
    if (rows.length < pageSize) return
  }
}

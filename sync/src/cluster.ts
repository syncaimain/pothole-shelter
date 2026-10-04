// Cluster proposals: which complaints might be the same pothole. Code only proposes;
// a person approves or rejects each one through the cluster-review workflow.
import {ids} from './domain.ts'
import {sha256} from './hash.ts'
import {createdAt} from './outcome.ts'
import type {RawRecord} from './soda.ts'
import {DAY_MS} from './time.ts'

/** Spec: within 60 m and 30 days of each other, on the same street. */
export const CLUSTER_METRES = 60
export const CLUSTER_DAYS = 30

const norm = (v: unknown) => (typeof v === 'string' ? v.trim().toUpperCase().replace(/\s+/g, ' ') : '')

function point(raw: RawRecord): {lat: number; lng: number} | undefined {
  const lat = Number(raw.latitude)
  const lng = Number(raw.longitude)
  return raw.latitude !== undefined && raw.longitude !== undefined && Number.isFinite(lat) && Number.isFinite(lng) ? {lat, lng} : undefined
}

/** Great-circle distance in metres (haversine; plenty for 60 m on a city street). */
export function metresBetween(a: {lat: number; lng: number}, b: {lat: number; lng: number}): number {
  const R = 6_371_008.8
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** The block a coordinate-less complaint describes: its two cross streets, order-free. */
const blockOf = (raw: RawRecord) => {
  const crosses = [norm(raw.cross_street_1), norm(raw.cross_street_2)].filter(Boolean).sort()
  return crosses.length === 2 ? crosses.join(' / ') : undefined
}

export type ClusterBasis = 'distance' | 'same-block'

/**
 * The streets a complaint is on. In CB 13, 866 of the 951 located complaints are
 * INTERSECTION rows with no street_name at all, only intersection_street_1/2. An
 * intersection is on both of its streets, so keying on street_name alone would have
 * left 91% of the measurable complaints out of clustering.
 */
export function streetsOf(raw: RawRecord): Set<string> {
  return new Set([raw.street_name, raw.intersection_street_1, raw.intersection_street_2].map(norm).filter(Boolean))
}

const sharedStreet = (a: RawRecord, b: RawRecord) => {
  const sb = streetsOf(b)
  return [...streetsOf(a)].find((s) => sb.has(s))
}

/** Why two complaints were linked, or undefined if they aren't. */
export function linkBetween(a: RawRecord, b: RawRecord): {basis: ClusterBasis; metres?: number} | undefined {
  if (!sharedStreet(a, b)) return undefined
  const ta = createdAt(a)
  const tb = createdAt(b)
  if (!ta || !tb || Math.abs(ta.getTime() - tb.getTime()) > CLUSTER_DAYS * DAY_MS) return undefined
  const pa = point(a)
  const pb = point(b)
  if (pa && pb) {
    const metres = metresBetween(pa, pb)
    return metres <= CLUSTER_METRES ? {basis: 'distance', metres} : undefined
  }
  // Lost strays have no point to measure. Two of them describing the same block (same street
  // between the same two cross streets) is the closest honest stand-in; it is labelled as
  // such, with no distance, so the reviewer knows what the proposal rests on.
  if (!pa && !pb) {
    const block = blockOf(a)
    return block && block === blockOf(b) ? {basis: 'same-block'} : undefined
  }
  return undefined
}

export interface ClusterProposal {
  _id: string
  _type: 'clusterDecision'
  complaints: {_type: 'reference'; _key: string; _ref: string}[]
  proposedBy: 'rule'
  /** Largest pairwise distance inside the group; absent when the basis is same-block. */
  distanceMetres?: number
  /** Days between the first and last complaint in the group. */
  daysApart: number
  reason: string
  decision: 'proposed'
}

/**
 * Groups linked complaints (single linkage, so A~B and B~C put A, B, C together) and
 * proposes each group of two or more. Chaining can stretch a group past 60 m end to end;
 * the proposal reports the real maximum spread so a reviewer can reject it.
 */
export function proposeClusters(complaints: readonly RawRecord[]): ClusterProposal[] {
  // Index each complaint under every street it is on; a pair is compared within each street
  // they share, which is harmless (union-find is idempotent).
  const byStreet = new Map<string, RawRecord[]>()
  for (const c of complaints) {
    for (const s of streetsOf(c)) byStreet.set(s, [...(byStreet.get(s) ?? []), c])
  }

  const parent = new Map<string, string>()
  const find = (k: string): string => {
    const p = parent.get(k) ?? k
    if (p === k) return k
    const root = find(p)
    parent.set(k, root)
    return root
  }
  const linked = new Set<string>()
  for (const group of byStreet.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const link = linkBetween(group[i]!, group[j]!)
        if (!link) continue
        const [ra, rb] = [find(group[i]!.unique_key), find(group[j]!.unique_key)]
        if (ra !== rb) parent.set(ra, rb)
        linked.add(group[i]!.unique_key).add(group[j]!.unique_key)
      }
    }
  }

  const groups = new Map<string, RawRecord[]>()
  for (const c of complaints) {
    if (!linked.has(c.unique_key)) continue
    const root = find(c.unique_key)
    groups.set(root, [...(groups.get(root) ?? []), c])
  }

  const proposals: ClusterProposal[] = []
  for (const members of groups.values()) {
    if (members.length < 2) continue
    members.sort((a, b) => (createdAt(a)?.getTime() ?? 0) - (createdAt(b)?.getTime() ?? 0))
    const times = members.map((m) => createdAt(m)!.getTime())
    const daysApart = Math.round(((Math.max(...times) - Math.min(...times)) / DAY_MS) * 10) / 10
    const points = members.map(point)
    const located = points.every(Boolean)
    let spread = 0
    if (located) {
      for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) spread = Math.max(spread, metresBetween(points[i]!, points[j]!))
    }
    const keys = members.map((m) => m.unique_key)
    // Name the street most members share (intersections are on two; chained groups may span both).
    const tally = new Map<string, number>()
    for (const m of members) for (const s of streetsOf(m)) tally.set(s, (tally.get(s) ?? 0) + 1)
    const street = [...tally].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0]?.[0] ?? 'an unnamed street'
    const basis = located
      ? `within ${Math.round(spread)} m of each other`
      : `on the same block (between ${blockOf(members[0]!) ?? 'unknown cross streets'}), no coordinates to measure`
    proposals.push({
      _id: `clusterDecision-${keys[0]}-${sha256(keys.join(',')).slice(0, 10)}`,
      _type: 'clusterDecision',
      complaints: members.map((m) => ({_type: 'reference', _key: m.unique_key, _ref: ids.complaint(m.unique_key)})),
      proposedBy: 'rule',
      ...(located ? {distanceMetres: Math.round(spread)} : {}),
      daysApart,
      reason: `${members.length} complaints on ${street}, ${basis}, filed ${daysApart} days apart.`,
      decision: 'proposed',
    })
  }
  return proposals.sort((a, b) => a._id.localeCompare(b._id))
}

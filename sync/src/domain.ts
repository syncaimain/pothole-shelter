// Shared vocabulary for the shelter: outcome values, statuses and document IDs.
// Imported by the Studio schema and by the sync, so both agree on every value.

/** A pet's outcome. Written only by the sync; read-only everywhere else. */
export const OUTCOMES = [
  {value: 'shelter', title: 'In the shelter', description: 'Open for less than 60 days'},
  {value: 'feral', title: 'Feral', description: 'Still open after 60 days'},
  {value: 'adopted', title: 'Adopted into forever pavement', description: 'Closed: the city repaired it'},
  {value: 'ghost', title: 'Ghost', description: 'Closed: no defect was found'},
  {value: 'transferred', title: 'Transferred', description: 'Referred elsewhere or closed as a duplicate'},
  {value: 'unmapped', title: 'Unmapped', description: 'Closed with a resolution no mapping covers yet'},
] as const

export type Outcome = (typeof OUTCOMES)[number]['value']

/** Outcomes a resolutionMapping may assign (open-ness is decided by status and age, not text). */
export const MAPPABLE_OUTCOMES = ['adopted', 'ghost', 'transferred'] as const satisfies readonly Outcome[]

/** Days a complaint may stay open before its pet turns feral. */
export const FERAL_AFTER_DAYS = 60

/** 311 `status` values seen in the live data on 2026-10-03. Anything except Closed counts as open. */
export const CLOSED_STATUS = 'Closed'

// Document IDs are deterministic so re-syncs update instead of duplicating.
// They use hyphens, never dots: Sanity hides any _id containing a dot from
// anonymous readers, which would make the public site and mirrors blind.
export const ids = {
  complaint: (uniqueKey: string) => `complaint311-${uniqueKey}`,
  pothole: (firstUniqueKey: string) => `pothole-${firstUniqueKey}`,
}

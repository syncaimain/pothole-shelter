// The initial resolutionMapping documents, written after reading the discovery output
// (snapshot discovery-20261003T202235Z: Queens CB 13, 2,503 complaints, 11 distinct texts).
// Every pattern is an exact, real resolution_description. New wording the city introduces
// will match nothing and land in the public Unmapped bucket instead of being guessed at.
//
// Deliberately NOT mapped (they say the work isn't finished, or say nothing at all):
//   "The status of this Service Request is currently not available online. …"   510 (505 Pending, 5 Closed)
//   "…inspected this complaint and will schedule the repair."                     2 (Pending)
//   "…found that the defect was not accessible. The repair will be rescheduled."  1 (Pending)
// Open/Pending complaints never use a mapping anyway: status and age decide (shelter/feral).
import type {ResolutionMapping} from '@pothole/sync'

export type MappingSeed = ResolutionMapping & {examplePhrases: string[]; rationale: string}

const DOT = 'The Department of Transportation'
const SRC = 'Discovery snapshot discovery-20261003T202235Z (Queens CB 13).'

const seed = (slug: string, pattern: string, outcome: ResolutionMapping['outcome'], rationale: string): MappingSeed => ({
  _id: `resolutionMapping-${slug}`,
  pattern,
  matchType: 'exact',
  outcome,
  examplePhrases: [pattern],
  rationale: `${rationale} ${SRC}`,
})

export const MAPPINGS: MappingSeed[] = [
  seed('repaired', `${DOT} inspected this complaint and repaired the problem.`, 'adopted',
    'The city says it inspected the spot and repaired it. 654 complaints carry this text (653 Closed, 1 Pending).'),
  seed('found-fixed', `${DOT} inspected this complaint and found that the problem was fixed.`, 'adopted',
    'The city found the defect already fixed. The record does not say who fixed it, so bios quote this text verbatim rather than credit anyone. 15 complaints, all Closed.'),
  seed('not-found', `${DOT} inspected this complaint and did not find the reported problem.`, 'ghost',
    'The city looked and found no defect: the spec\'s "no pothole found" ghost. This is not a judgement on the person who reported it; potholes get patched, misplaced, or described differently. 408 complaints, all Closed.'),
  seed('duplicate', `${DOT} determined that this complaint is a duplicate of a previously filed complaint. The original complaint is being addressed.`, 'transferred',
    'Closed as a duplicate of another complaint, which the spec maps to Transferred. 446 complaints (445 Closed, 1 Pending).'),
  seed('referred-inspections', `${DOT} referred this complaint to the Inspections Unit for further action.`, 'transferred',
    'Referral inside DOT. Decided 2026-10-04 by the project owner: a closed ticket that was referred on counts as Transferred. In CB 13 all 235 are still Pending, so today status and age decide them, not this mapping.'),
  seed('referred-arterial', `${DOT} inspected this complaint and referred it to the Arterial Division for further action.`, 'transferred',
    'Referral inside DOT; same owner decision as the Inspections Unit mapping. All 122 in CB 13 are Pending.'),
  seed('referred-maintenance', `${DOT} referred this complaint to the appropriate Maintenance Unit for repair.`, 'transferred',
    'Referral inside DOT; same owner decision. All 71 in CB 13 are Open (67) or Pending (4).'),
  seed('referred-bridge', `${DOT} inspected this complaint and referred it to the Bridge Division for further action.`, 'transferred',
    'Referral inside DOT; same owner decision. All 39 in CB 13 are Pending.'),
]

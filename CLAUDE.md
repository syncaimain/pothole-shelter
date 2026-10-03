# Pothole Adoption Agency — build brief (Path Two)

**Source of truth:** `Pothole Adoption Agency (Path Two).md` in this directory. Read it end to end before writing code. This file is the operating brief; where the two disagree, the spec wins.

## What you own

A Path Two app that turns real NYC 311 pothole complaints from one borough (Queens) into adoptable pets, whose fates follow the city record: repaired, "no pothole found", referred elsewhere, or still open.

You own **only this directory**. Never read or write sibling folders (`../best-track`, `../folklore-lab`, …) — four other agents are working in them in parallel.

## Assigned ports — do not change

| Service | Port |
| --- | --- |
| Next.js dev | 3004 |
| Sanity Studio | 3337 |

## Toolchain

Node v24.12.0 (spec wants 22.12+), pnpm 12.8.1, pnpm workspaces. **Use pnpm, never npm** — the hard-linked shared store is what keeps five repos inside the disk budget.

## Non-negotiable ground rules

- **Check the current Sanity docs first.** Workflows and the App SDK are new and Workflows packages are 0.x. Do not code against remembered APIs or package names.
- **Everything marked "Verify" in the spec is unconfirmed.** That explicitly includes the Socrata dataset ID, field names, complaint values, paging limits and the NYC Open Data terms. Confirm before coding.
- **Never invent facts.** No made-up data, IDs, citations or API fields. Pet bios may only restate facts from the complaint records — no invented detail, however charming.
- **Code decides outcomes.** Deterministic code maps 311 records to outcomes; a model only writes bios and proposes clusters for a person to approve.
- **Keep raw records untouched.** Raw 311 data stays as-is; pet fields live separately; resolution codes are mapped by documents; outcome changes happen only through sync events.
- **Snapshot the data.** Save each sync raw page with retrieval date and SHA-256 so tests and measured results reproduce. The sync must be idempotent, proven by tests.
- **Build log from day one.** `docs/BUILD_LOG.md`: prompts that worked, prompts that failed, where you got stuck, how you fixed it, what you cut. This file is the heart of the Path Two post.
- **Secrets stay server-side.** Never commit or expose tokens (Sanity, Socrata app token, model keys). Scan the transcript before making any agent session public.

## Tone — this one matters

Celebrate repairs. **Never mock residents or road crews.** The joke is the shelter conceit, never the people who filed the complaint or the people who fix the street. Any bio that reads as contempt for either fails review.

## Definition of done — all four criteria at 5

| Criterion | What must be true |
| --- | --- |
| Build process writeup | Honest decisions about messy data (missing coordinates, unclear resolution text), prompts that failed, a public agent session |
| Functionality | Hourly sync with visible "last synced" time, cached fallback, idempotent sync proven by tests, public mirrors of every App SDK view |
| Schema | Raw 311 records untouched; pet fields separate; resolution codes mapped by documents; outcomes change only through sync events |
| Creativity | Real civic data as a shelter, with "lost strays" and "ghosts" made from the data own gaps |

## First moves

1. Read the spec fully.
2. Verify the Socrata dataset ID, field names and NYC Open Data terms against live docs; record findings in `docs/BUILD_LOG.md`.
3. Confirm the Workflows package names before wiring any workflow.
4. Scaffold the pnpm workspace, then make your first commit.

## Hosting note

The spec wants an hourly sync. Check your Vercel plan cron frequency limits before committing to hourly — the free hobby tier is restricted. Record what you find and fall back to the best allowed interval rather than silently shipping a sync that never fires.

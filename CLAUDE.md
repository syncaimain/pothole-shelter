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

## Model provider — Google Gemini

This build uses Gemini, not Anthropic. The key is `GEMINI_API_KEY` in `.env.local`, loaded for you by `launch.ps1`.

- **Prefer the Vercel AI SDK over a provider-specific SDK.** The spec requires an MCP client to reach the Sanity Context endpoint, and the AI SDK gives you Gemini models plus MCP tool discovery in one place. Discover tools with MCP `tools/list` at runtime; never hardcode tool schemas.
- **Record the exact model name and version in every evaluation result**, as the spec requires. All arms of the evaluation must use the same model.
- **Verify** the current Gemini model IDs and the AI SDK provider package name against live docs before coding. Do not rely on remembered model names.
- The key format supplied does not match the usual Google AI Studio pattern, so make a single cheap call to confirm it authenticates before building anything on top of it. If it fails, stop and report rather than working around it.

## Findings from a sibling agent — re-verify cheaply, then rely on them

The `best-track` agent verified these against live Sanity docs on 2026-10-03. Reported, not gospel: confirm with one cheap check, then trust them.

- Studio v6 requires **Node 22.12+** (confirmed in `sanity@6.17.0`).
- Deploying the **schema** is a separate step from deploying the Studio: `sanity schema deploy`.
- **TypeScript resolves to 7.0.2**, a new major version. Confirm Next.js and Sanity tolerate it and pin to 5.x if not. This will bite you the same way it bit the sibling repo.
- pnpm may print an **ignored builds** warning; some install scripts need approving with `pnpm approve-builds`.
- The shared pnpm store is already warm at `C:\Users\ncai\AppData\Local\pnpm\store\v11`, so your install should be fast.

## Reporting protocol — read this

Coordination happens through two files in this repository. You never read any
sibling project folder; that rule stands.

- **`docs/REPORT.md`** — you write. Append-only, newest at the bottom. Write an
  entry when you finish a meaningful step, hit a blocker, depart from the spec,
  or need a judgement call. Start each entry with a timestamp line, then
  `STATE:` (one line) and `BLOCKED_ON:` (`none`, or exactly what you need).
- **`docs/GUIDANCE.md`** — you read. Answers and sequencing arrive here. Check
  the tail before starting new work, and again after writing a blocked entry.

Rules that make this work:

- **Never inline long URLs, query strings or hashes in a report.** Line wrapping
  destroys them. Write them to a file and reference the path. A 743-character
  TAP query was already lost this way once.
- **Do not idle waiting for a reply.** Write the entry, then continue with
  anything unblocked. Only stop if genuinely blocked.
- **Append, never rewrite.** The exchange is part of the build-process record and
  gets read by judges, so an honest trail beats a tidy one.
- Both files are committed. Keep secrets out of them — reference variable names,
  never values.

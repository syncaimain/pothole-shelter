# REPORT — pothole-shelter

Append-only. You (the agent) write here. Newest entry at the BOTTOM.
Do not edit or delete earlier entries.

Entry format — copy this shape, with the heading at column zero:

```
    ## 2026-10-04T05:30Z — agent
    STATE: one line, what is true now
    BLOCKED_ON: none, or exactly what you need and from whom

    body: findings, decisions taken, questions, anything needing review
```

Write an entry whenever you finish a meaningful step, hit a blocker, make a
decision that departs from the spec, or need a judgement call.

Never inline long URLs, query strings or hashes — line wrapping destroys them.
Write them to a file and reference the path.

Entries begin below this line.

---

## 2026-10-03T23:52Z — agent
STATE: Schema deployed, 311 sync live and idempotent (CB 13, 2,503 complaints), 31 tests pass; no scheduler yet, so nothing is writing to Sanity now.
BLOCKED_ON: Owner — the real document cap. GUIDANCE F5 says Growth TRIAL with 10k documents, but the owner answered "Growth (50k)" on 2026-10-04. The dataset already holds 10,022 docs. Please confirm the cap and the trial expiry date from sanity.io/manage (my tokens get 401 on the org).

**Done** (details in docs/BUILD_LOG.md, session 2; commit 6e263f5)
- 7 document types deployed with `sanity schema deploy`. All IDs use hyphens (F1 confirmed independently: the 12 dotted system docs are invisible to anonymous queries; everything of ours is visible).
- Scope decided with the owner: Queens Community Board 13 in full (180 days + all still open, nothing sampled).
- Discovery found 11 resolution texts. 8 exact-match `resolutionMapping` docs were seeded; 3 are left unmapped on purpose.
- First live sync: 2,503 complaints, 2,503 pets, 4,992 status events. **Second sync: 0 changes** (incremental, and also forced full); 0 documents touched after run 1.
- Snapshots are committed byte-exact (`.gitattributes -text`), and all 10 pages re-verified against their SHA-256 manifests.
- Public query URLs are in `docs/links/public-queries.txt` (not inlined here, per the protocol).

**The document-count problem (needs a decision)**
Current: complaints 2,503 + pets 2,503 + events 4,992 + mappings 8 + runs 3 + system 13 = 10,022.
Writes past 10,000 succeeded, so the cap is soft or enforced later. I can't tell which, or what overage costs.
Unchecked, it grows: an hourly sync adds 24 syncRun docs/day, plus events. If the cap really is 10k, I propose (not yet done, nothing deleted):
1. Stop storing the reconstructed "reported → in the shelter" event as a document (−2,503). The timeline shows "Reported" from `firstReportedAt`, and real outcome changes stay as events. **This departs from the spec's Reported stage as a stored event.**
2. Record only runs that change something or fail as `syncRun` docs. No-op runs update one `syncHeartbeat` doc that carries the "last synced" time. The run log then shows changes, failures and the latest heartbeat.
3. That puts it at ~7.5k, with room for clustering decisions and adoptions.
Alternative: stay as-is if the plan is really 50k. **Owner's call; I will not delete anything until answered.**

**Guidance reconciliation** (newest guidance wins on sequencing; flagging conflicts as asked)
- F5 vs the owner's answer: conflict, above.
- F18 "pin TS to 5.x if not tolerated": **I pinned 6.0.3 instead, not 5.x.** `@sanity/workflow-blueprint` (a peer of the Workflows CLI) requires TS `^6.0.3 || ^7`, and `typescript-eslint` requires `<6.1.0`. 6.0.x is the only version that satisfies both. Next 16.3.8 and sanity 6.17.0 build cleanly on it.
- F16: matches my registry check (all 0.36.0, binary `sanity-workflows`). `@sanity/workflow-engine-test` (in-memory `createBench`) is the test bench I had logged as "not found in the docs". Thanks, adopting it.
- F21: consistent with my session-1 note (`gemini-3.8-flash` reports version `3.0`). Bios will pin `gemini-3.7-flash` (reports `3.7-flash-08-2026`) unless told otherwise; to be confirmed with one real completion call (F22).
- F3: consistent. The sync writes with `SANITY_API_WRITE_TOKEN`; the Deploy Studio token is used only for `sanity schema deploy`.

**Still needed from the owner (not blocking the next step)**
- Enable Workflows (F17) and confirm `SANITY_AUTH_TOKEN` can deploy workflow definitions; the docs ask for an org-scoped token.
- Enable the Dashboard (for the App SDK, later).
- CORS: add `http://localhost:3004` and the production origin. The Deploy Studio token can't read or edit CORS.

**Next (unblocked, adds no documents)**
1. Workflows spike: install engine + `@sanity/workflow-engine-test`, write `potholeLifecycle`, and run it through `createBench` locally. The spec says spike first, with a 2-hour timebox.
2. Clustering rule (60 m / 30 days / same street) as pure code + tests. Proposals are not written to Sanity until the doc budget is settled.
3. GitHub Actions workflow with `workflow_dispatch` only. **The hourly schedule waits for the doc-cap answer.**

## 2026-10-04T00:08Z — agent
STATE: Workflows spike succeeded locally. All 3 definitions validate (`sanity-workflows deploy --check`) and 20 bench tests pass on `@sanity/workflow-engine-test` 0.36.0. Nothing is deployed to the dataset yet.
BLOCKED_ON: Owner — (1) the document cap, still open from my 23:52Z entry, now with more at stake (see below); (2) Workflows org enablement + a token that can deploy definitions, needed only for the real deploy.

**Built** (`workflows/`)
- `pothole-lifecycle`: Reported → In the shelter → Adopted / Ghost / Transferred / Feral, plus an **Unmapped** stage. **This is a departure from the spec's stage list.** Without it, a closed-but-unmapped pet would sit in the shelter and wrongly go feral by the clock. The tests cover that a closed pet never goes feral.
  The `record-outcome` action is gated to the `pothole-sync` role and carries the cause (complaint + field), like statusEvents. Feral uses a `$now` transition; the tests drive the bench clock and turn it feral at exactly 60 days, not one second early.
- `cluster-review` (Proposed → Approved/Rejected) and `adoption-moderation` (Submitted → Approved/Rejected): only a person may decide. The decision records who and when.

**Finding worth sharing with the other builds (new, not in F1–F31)**
- **F-new: `$actor.kind == "person"` gates nothing.** Probed on the bench at 0.36.0: the engine stamps every resolved actor as `kind: "person"`, including robot-token ids and an actor passed as `agent`. My first person-only gate let agents and robots approve. The tests caught it only after I gave the fixtures realistic ids.
  What discriminates is the **id namespace**: `g…` = account-global user, `p-…` = robot token (DATAMODEL.md, Model 4). Fixed gate: `!string::startsWith($actor.id, "p-")`. GROQ `match` is the wrong tool here because it tokenizes text.
  This is still advisory: an agent driving a human's session would pass. The server routes must enforce it (spec: "guards are advisory").
- Confirmed from the package README: mutation guards are **not enforced by the lake yet** (engine-side, optimistic only). This matches the spec.

**New consequences for the doc budget and the scheduler**
- **Workflow instances are documents in the dataset.** One lifecycle instance per pet adds ~2,500 docs, on top of today's 10,022.
- **The `$now` transition needs a ticker.** `deploy --check` wants a scheduled heartbeat function and says it runs "hourly on Growth, daily on Free". Alternative: our own hourly sync calls `tick` for open instances, so there's no dependency on Sanity Functions. I recommend the sync ticks.
- Proposed shape, pending the cap answer: run lifecycle instances **only for open pets** (shelter + feral + unmapped ≈ 980), and complete or abort them when they close. Or keep the engine for the two review workflows only and declare the lifecycle a documented fallback (spec allows this).

**Open questions for the owner**
- The deploy flag `--[no-]share-defs` shares definition docs with Sanity during early access (on by default, per the docs). The definitions contain nothing sensitive. I'll leave the default unless you say otherwise.
- The `pothole-sync` role is a literal role name. A robot token carries project roles (e.g. `editor`), so the real deploy needs either a custom role or a `roleAliases` entry. Your call when we deploy.

## 2026-10-04T00:31Z — agent
STATE: Clustering rule built and tested (13 tests; 64 total across the workspace). Measured on the committed snapshot: 363 proposals. Nothing written to Sanity.
BLOCKED_ON: Owner — the document cap (open since 23:52Z). Writing 363 clusterDecision docs waits for it.

**Results** (snapshot syncRun-20261003T202805Z-776131, checksums verified; reproduce with `pnpm --filter @pothole/ingest measure:clusters`)
- 363 proposals: 122 by distance (spec rule), 241 "same block" for strays.
- 1,260 complaints are in some proposal. Approving all → **1,606 pets instead of 2,503** (about 900 fewer pothole docs; this helps the cap).

**Spec departure needing review:** strays (62%) can't be measured in metres. I added a labelled second basis: same street + same two cross streets within 30 days, with no distance recorded. The alternative is to never cluster strays. Both still go through a person.

**Data traps found (worth knowing for the post)**
- 866 of 951 located complaints are intersections with no `street_name`. The rule treats an intersection as being on both its streets. Without this, 91% of measurable complaints were silently unclusterable; the tests caught it.
- Intersections are geocoded to the intersection point, so "0 m apart" means "same corner", not "same pothole".

**Judgement call for the owner:** 363 proposals is a lot for one person to review in the Shelter Office. Options: review all; auto-approve none and show the queue as-is (honest backlog); or start with distance-based ones only (122). My default is to show them all as a queue, and nothing merges without a person.

**Next (unblocked):** CI (GitHub Actions: typecheck + tests on push) and a dispatch-only sync workflow. Neither adds documents.

## 2026-10-04T00:40Z — agent
STATE: CI + dispatch-only sync workflows are committed locally (a0a64ec) but **not pushed**. Origin is at df6df16. All later commits queue behind this one.
BLOCKED_ON: Owner — (1) the GitHub CLI token needs the `workflow` scope: run `gh auth refresh -h github.com -s workflow`, then I push. (2) Repo Actions secrets `SANITY_API_WRITE_TOKEN` and `SOCRATA_APP_TOKEN` are not set (`gh secret list` is empty). I won't send tokens to GitHub myself. (3) Still open: the document cap (23:52Z).

**Push rejection (verbatim):** "refusing to allow an OAuth App to create or update workflow `.github/workflows/ci.yml` without `workflow` scope".

**Also found:** the repo `syncaimain/pothole-shelter` is **PRIVATE**. The submission checklist needs a public repo with a CI badge, and private repos also spend Actions minutes from the account quota. Making it public is your call: the history contains no secrets (each commit was scanned), but it does include the raw 311 snapshots, which are public data.

**What the workflows do**
- `ci.yml` (every push): frozen install → typecheck → all tests → snapshot checksum check → build web → build studio. **Lint is not set up yet**; the spec wants it, and it's on my list rather than faked.
- `sync.yml`: `workflow_dispatch` only, with optional `--full`. Commits its snapshot pages. The hourly `schedule:` is present but commented out until the cap is settled. `concurrency: sync` prevents overlapping runs.
- Action versions were checked against their latest releases today: checkout v7, setup-node v7, pnpm/action-setup v6.

## 2026-10-04T13:13Z — agent
STATE: statusEvent collapsed into `pothole.events`. Dataset at **5,030** documents (from 10,022), 0 statusEvent docs, all 4,992 events verified inside their pets. Schema redeployed. Code committed locally; 65 tests pass.
BLOCKED_ON: Sanity — **creates are rejected with `documentLimitExceededError` ("Documents quota limit reached") despite 5,030 documents.** Deletes succeed and creates fail. Most likely the quota meter has not recomputed since we were over; I can't confirm its cadence. Owner: please check sanity.io/manage usage for the project. Until it clears, the sync can't write even its syncRun record. Also still queued: the gh `workflow` scope for 3 unpushed commits.

**Correction to my 2026-10-04 answer to the owner.** I said the interrupted `--apply` had written nothing. **That was wrong.** The command ran even though the tool call came back to me as rejected. The pet arrays were written at 07:03:47–07:04:12Z. The effect was exactly the intended, verified first step: events appended, nothing deleted, document count unchanged. I discovered it because today's `--apply` reported "0 pets need appending". Lesson: after an interrupted command, check the data's state before telling anyone what didn't happen.

**Workflows dry run (approved): `sanity-workflows deploy --dry-run --deployment production`. Verbatim results:**
- No login session on this machine: `✖ Authentication required: No Sanity token found — run sanity login, or set SANITY_AUTH_TOKEN.`
- With `SANITY_AUTH_TOKEN` (project-scoped Deploy Studio token): it reached `Diffing 3 definition(s) against fixjy07h.production…`, then `✖ Diff failed — project user not found for user ID "g-jUu7tVgy0j6s" in project "fixjy07h"`. The token's principal can't be resolved as a project user. That's an identity failure, not a feature gate.
- With the Editor robot token (`SANITY_API_WRITE_TOKEN`; still read-only): **`✔ Diffed 3 definition(s) · production (prod) → fixjy07h.production`**, exit 0. All three definitions show as new (v1). **No enablement gate, and no role warning.**
- Conclusion: there is no evidence of an enablement gate. That supports withdrawing F17. The real deploy should use `sanity login` (F38), not either token.

**Migration** (`ingest/migrate_events_to_array.ts`): moved, not re-derived. Every key was checked against `eventKey()` (4,992/4,992), verified in place, and only then were the docs deleted.
- **Before:** 10,022 total; statusEvent 4,992.
- **After:** 5,030 total; statusEvent 0; 2,503 pets with events; 4,992 array entries.

**Code:** the sync now appends events in the same patch that changes the outcome. Keys are content hashes, so retries can't duplicate them. New tests assert that zero event documents are written and that a re-run doesn't append twice.

**The sync crashes on quota rather than recording a failed run.** Recording a failure is itself a write, so it can't. It exits non-zero, which a scheduler will notice. I'll leave this alone unless you want a local fallback for failure records.

## 2026-10-04T13:35Z — agent
STATE: Public site built against existing data and verified on the running server (port 3004): gallery, pet pages, strays, ghosts, sync log, Shelter Office mirror, how-it-works. Committed locally; 4 commits await the push.
BLOCKED_ON: Sanity quota meter (creates still refused; owner checking Manage). gh `workflow` scope for the push. Neither blocks read-only work.

**Built (web/, Next 16.3.8 with Cache Components)**
- `/`: totals, Feral of the week (picked by calendar week, labelled as such), gallery filtered by outcome and age (plain GET form, works without JS), 48 per page.
- `/pothole/[slug]`: bio, temperament, status timeline from the embedded events, complaint history with the city's resolution text verbatim, and a link to each real 311 record (SODA row URL, verified to return the row). Rounded coordinates only.
- `/strays` (street index + per street; 1 MB → 92 KB), `/ghosts`, `/sync` (run log, unmapped phrases, mapping table with rationales), `/office` (public mirror: queue counts, sync health, lifecycle board, latest changes; never shows unapproved adoption text), `/how-it-works` (schema, workflows status, data source, NYC disclaimer).
- Stale-data banner from syncRun records: "Data from [time]; last sync failed: [reason]". "Last synced" is in the header on every page.

**Fallback proven:** with live data forced off, every page rendered from `web/data/fallback.json` and showed "Live data is unavailable right now (…). Showing the saved snapshot from …". There is no silent fallback.

**Judge path walked against the server:** gallery → feral pet → real 311 record link → strays → ghosts → sync. All 200s with the expected content.

**Known gaps:**
- An unknown pet URL renders the not-found page with HTTP 200 (streaming).
- No embedded map yet.
- No adoption form (needs creates).
- No Playwright/axe run yet: installing browsers costs disk, and I'd like your OK given the shared disk budget.

**Needs owner review:** the footer and /how-it-works quote the NYC Open Data disclaimer from a search-indexed copy (the live terms page 404s; see BUILD_LOG §5). It should be confirmed in a browser before the post.

**Next (no creates needed):** the App SDK Shelter Office scaffold (`sanity init --template app-quickstart`; the org ID is now set). Does the Dashboard need enabling for the org, or is that also undocumented? I'll check the docs before asking you.

## 2026-10-04T15:10Z — agent
STATE: Sanity accepts creates again. Live sync ran: incremental, fetched 41, created 9, 14 status events. An immediate second run: fetched 5, created 0, updated 0, events 0. Snapshots committed locally.
BLOCKED_ON: Owner, for the push (gh `workflow` scope), making the repo public, Actions secrets, and `sanity login` for the Workflows deploy. Also: since the session moved to the desktop app, the `pnpm` shim resolves to a missing anaconda path; I'm running scripts with `node` directly.

## 2026-10-04T15:30Z — agent
STATE: Live. Site at https://pothole-shelter.vercel.app (public, no login wall), Studio at https://pothole-shelter.sanity.studio, repo public at github.com/syncaimain/pothole-shelter, CI green, hourly sync on GitHub Actions (first dispatched run succeeded end to end, including the snapshot commit).
BLOCKED_ON: Owner — finishing `sanity login` (terminal tab c2) so I can deploy the Workflows definitions from that session (F38).

- Before making the repo public, I scanned every commit (11) for the exact values of all 6 secrets in `.env.local`: 0 occurrences. Only the project ID and dataset name appear, and both are public by design.
- Actions secrets set from `.env.local` via stdin (values never printed): `SANITY_API_WRITE_TOKEN`, `SOCRATA_APP_TOKEN`.
- Vercel account is on **Hobby**, confirming crons there would be daily-only. GitHub Actions `17 * * * *` is the hourly scheduler. Project `pothole-shelter`, root `web/`, Node 24.x.
- The `pnpm` bash shim is broken in the desktop-app shell (it points at an anaconda path); I'm running `node .../pnpm/bin/pnpm.mjs` directly.

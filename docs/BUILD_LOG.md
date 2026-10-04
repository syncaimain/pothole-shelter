# Build log — Pothole Adoption Agency (Path Two)

The honest record of how this was built: prompts that worked, prompts that failed,
where the agent got stuck, how it was fixed, and what was cut. Newest entries at the bottom.

- **Agent / IDE:** Claude Code (model `claude-opus-5-5`), driving a terminal on Windows 11.
- **App model provider:** Google Gemini via the Vercel AI SDK (see "Model" below).

---

## 2026-10-03 — Session 1: verification before any feature code

### Prompt that started it

> Read CLAUDE.md and the spec in full. Then, in order: (1) verify GEMINI_API_KEY with one
> cheap call — if it fails, stop; (2) confirm every "Verify" item against live docs and
> write findings here; (3) scaffold the pnpm workspace. Stop before feature code.

This worked well as a prompt: "stop and report" kept the agent from building on unverified
assumptions, and several of the spec's remembered facts turned out to be wrong (below).

### 1. Gemini key

- The key is not in the usual `AIza…` format (it starts `AQ.`), so authentication was checked first.
- `GET /v1beta/models` → **HTTP 200**. Then a single `generateContent` on `gemini-3.5-flash` →
  **HTTP 200**, `modelVersion: "gemini-3.5-flash"`.
- **Gotcha worth recording:** with `maxOutputTokens: 20` the response had **no text** and
  `finishReason: MAX_TOKENS`, because the thinking budget used up the output tokens. Bio
  generation must leave headroom or set a thinking budget explicitly, or it will return
  empty bios that look like a model failure.
- Models this key can see (selection, from the live list, 2026-10-03): `gemini-3.8-flash`,
  `gemini-3.7-flash`, `gemini-3.6-flash` (`3.6-flash-07-2026`), `gemini-3.5-flash`
  (`3.5-flash-05-2026`), `gemini-3.5-flash-lite`, `gemini-3.1-pro-preview`, `gemini-2.5-pro`,
  `gemini-2.5-flash`. **Not yet chosen.** Whichever model is used, its exact ID *and*
  the `modelVersion` that the API echoes back will be recorded with every eval result.
  Every arm of an evaluation uses the same model.
- **Odd detail:** `gemini-3.8-flash` reports `version: "3.0"` in the model list. It's not a
  blocker, but "record the exact version" means storing the response's `modelVersion`, not
  assuming it from the ID.

### 2. NYC 311 data (Socrata) — verified live, 2026-10-03

| Spec claim | Verified? | Finding |
| --- | --- | --- |
| Dataset `erm2-nwe9` covers current years | ✅ | Title: "311 Service Requests from 2020 to Present". Agency OTI, updated daily, auto-loaded; rows last updated 2026-10-03T01:38:59Z. |
| `complaint_type='Street Condition' AND descriptor='Pothole'` | ✅ (with caveat) | Queens, last 180 days: **17,007** rows. Two *other* pothole variants exist: `Highway Condition / Pothole - Highway` (601) and `Bridge Condition / Pothole` (22). **Decision pending:** spec says street potholes only, so for now highways and bridges are out. |
| `borough='QUEENS'` | ✅ | Values: BRONX, BROOKLYN, MANHATTAN, QUEENS, STATEN ISLAND, `Unspecified`. |
| Expected fields | ✅ all present | `unique_key` is **text**, not a number (deterministic IDs stay strings). Also present: `descriptor_2`, `address_type`, `intersection_street_1/2`, `cross_street_2`, `bbl`, `location` (GeoJSON point), state-plane x/y. |
| `:updated_at` available for incremental sync | ✅ | Present and filterable. Only **343** of 121,296 matching rows changed after 2026-10-02, so the nightly load does **not** touch every row and incremental sync is viable. `date_trunc_ymd(:updated_at)` errors (it is a `fixed_timestamp`), so filter with a plain comparison. |
| Paging limits | ✅ | SODA docs: 2.0 endpoints cap `$limit` at 50,000; 2.1 and 3.0 have no maximum. Live: `$limit=100000` returned 100,000 rows. We will still page at 1,000 with a stable `$order` (`:id` or `unique_key`) to keep snapshot pages small and diff-able. |
| App token in `X-App-Token` | ✅ | Real token → 200; bogus token → **403** (the server does validate it). |
| NYC Open Data terms | ⚠️ partially | See "Terms" below. |

**Status values** (Queens street potholes, last 180 days): `Closed` 15,369 · `Pending` 1,103 ·
`Open` 535. All-time also has `Unspecified` (2 rows). "Still open" therefore means **Open or
Pending** (and probably Unspecified). This is the first place the spec's model doesn't fit
the data: the spec talks about open vs. closed, but the city uses three non-closed states.

**Resolution texts** (distinct values, last 180 days, by count). The mapping will be built
from these with `discover_resolutions.ts`, not from this table, but this shows the shape:

| n | resolution_description | likely outcome (to confirm via mapping docs) |
| ---: | --- | --- |
| 7,471 | …inspected this complaint and repaired the problem. | Adopted |
| 3,835 | …inspected this complaint and did not find the reported problem. | Ghost |
| 3,824 | …determined that this complaint is a duplicate of a previously filed complaint. The original complaint is being addressed. | Transferred (duplicate) |
| 534 | …referred this complaint to the appropriate Maintenance Unit for repair. | ? (referred *within* DOT; is this "transferred"?) |
| 459 | …referred this complaint to the Inspections Unit for further action. | ? |
| 406 | The status of this Service Request is currently not available online. Please call 311… | **Unmapped**: there is no information here |
| 246 | …inspected this complaint and referred it to the Arterial Division for further action. | ? |
| 188 | …inspected this complaint and found that the problem was fixed. | Adopted? (someone fixed it, not necessarily on this ticket) |
| 39 | …referred it to the Bridge Division… | Transferred? |
| 3 | …found that the defect was not accessible. The repair will be rescheduled. | ? |
| 1 | …will schedule the repair. | ? |
| 1 | …assigned this complaint to a field crew for inspection and, if warranted, repair. | ? |

Messy-data notes for the post:
- **Duplicates are a big share (~22%).** A "duplicate" resolution means the city merged it into
  another complaint. That is real clustering evidence from the city itself.
- **"Referred" texts are ambiguous.** DOT referring a complaint to its own Maintenance Unit
  isn't the same as handing it to another agency. A person has to decide this in the mapping
  documents, and the rationale field records why.

### 3. Missing coordinates — the "lost strays" are the majority, not the exception

- Last 180 days: **10,576 of 17,007 (62%)** have no latitude/longitude.
- Almost all of them are `address_type = BLOCKFACE` (10,528). These are complaints about a
  stretch of street between two cross streets, so the city doesn't record a point. 47 are
  intersections; 1 is an address.
- Every one of them still has a street and/or cross street, and almost all have a community
  board. 447 have `community_board = "Unspecified QUEENS"`, and there are also
  `80–84 QUEENS` values (these look like park/airport districts; still to verify).
- **Consequence:** `/strays` is the main exhibit, not a footnote. The map shows only about 38% of pets.
  Geocoding blockfaces was considered and **rejected for now**: it would invent precision
  the city record doesn't have.

### 4. Scope vs. the 3,000 cap — needs a decision

The spec says "rolling 180 days plus every complaint still open, capped at 3,000". Actual:

- 180-day window: **17,007** street-pothole complaints in Queens.
- Not closed, all time: **~8,800** (Pending since 2020: 33 · 2021: 83 · 2022: 247 · 2023: 163 ·
  2024: 1,768 · 2025: 2,647 · 2026: 3,403, plus 655 Open and 2 Unspecified).

The cap is exceeded about 8× before clustering. Some cutting is necessary. The options are
recorded here so the choice is visible later; **not yet decided**. They are: a shorter window,
one or a few community boards, the cap applied after clustering, or the cap dropped (Sanity
document counts and sync time are the real limits).

### 5. Terms of use (NYC Open Data)

- The dataset metadata has **no license field** (`licenseId` absent); provenance is `official`.
- The Open Data terms used to live at `nyc.gov/html/data/terms.html`, but it now returns **404**. The
  portal's `opendata.cityofnewyork.us/overview/#termsofuse` returns **403** to non-browser clients.
  `nyc.gov/main/terms-of-use` covers the general site, and its "AS IS" warranty disclaimer is quoted there.
- A search-indexed copy of the Open Data terms includes this required disclaimer for apps:
  > "The City of New York can not vouch for the accuracy or completeness of data provided by
  > this web site or application or for the usefulness or integrity of the web site or
  > application. This site provides applications using data that has been modified for use
  > from its original source, NYC.gov, the official web site of the City of New York."
- **Status: not fully verified.** The quoted text comes from a search index, not a page fetched
  live. To do: open the current terms in a browser, confirm the wording, then put the
  disclaimer and the dataset citation on `/how-it-works` and in the footer.

### 6. Sanity Workflows, App SDK and the rest of the stack (npm registry + live docs, 2026-10-03)

| Package | Version | Notes |
| --- | --- | --- |
| `@sanity/workflow-engine` | 0.36.0 | ✅ exists. `defineWorkflow`, `defineStage`, `defineTransition`… come from `@sanity/workflow-engine/define`. |
| `@sanity/workflow-cli` | 0.36.0 | ✅ exists. **The binary is `sanity-workflows`**, and it has peer deps `@sanity/workflow-blueprint@0.36.0` and `@sanity/cli-core@^3.6`. Config file: `sanity.workflow.ts` using `defineWorkflowConfig`. Commands: `deploy [--check|--dry-run] --deployment production`, `start`, `fire-action`, `show`. |
| `@sanity/workflow-blueprint` | 0.36.0 | Not in the spec. The docs' deploy page installs it. Peer: TypeScript `^6.0.3 \|\| ^7`. |
| `@sanity/workflow-studio-plugin` | 0.36.0 | ✅ exists, but it pulls in five more `@sanity/workflow-*` peers and requires `sanity ^6.15`. Optional; decide during the spike. |
| `@sanity/sdk-react` / `@sanity/sdk` | 3.7.0 | App SDK. Scaffold template: `sanity init --template app-quickstart`. Needs the **org ID**. |
| `sanity` | 6.17.0 | `engines.node >= 22.12`: the sibling agent's report is **confirmed**. |
| `next` | 16.3.8 | |
| `ai` / `@ai-sdk/google` / `@ai-sdk/mcp` | 7.0.127 / 4.0.87 / 2.0.66 | The provider reads `GOOGLE_GENERATIVE_AI_API_KEY` by default, **not** `GEMINI_API_KEY`. We call `createGoogle({ apiKey: process.env.GEMINI_API_KEY })` explicitly. |
| `vitest` | 5.0.3 | |
| `@playwright/test` / `@axe-core/playwright` | 1.63.0 / 4.13.0 | |
| `maplibre-gl` | 6.11.2 | Chosen over Leaflet; the tile provider is still to pick, and its usage policy will be followed. |

**Doc inconsistencies found:**
- The Workflows getting-started page says "Node.js 20.12 or later" and installs only
  `engine` + `cli`. The deploy-definitions page also installs `@sanity/workflow-blueprint`.
  The registry agrees with the deploy page: the CLI declares blueprint as a peer, so we install it.
- The getting-started page says "Workflows 0.33.0 or later". The current version is 0.36.0, and we pin it exactly
  (the docs say to keep engine and CLI on the same version).
- Workflows deploy needs `SANITY_AUTH_TOKEN` scoped to the **organization**, not just the project.
  It is currently **empty** in `.env.local`, as is `SANITY_ORG_ID`.
- **Still to verify in the spike:** the in-memory "test bench" the docs mention (no command or API
  was documented on the pages read); whether instance documents are anonymously readable; and the
  current API version date for the public query URL.

### 7. TypeScript version — the sibling agent's warning was right, but its fix was wrong for us

- `typescript@latest` is 7.0.2.
- `typescript-eslint` peer: `>=4.8.4 <6.1.0`. `@sanity/workflow-blueprint` peer: `^6.0.3 || ^7`.
- The **only** range that satisfies both is TypeScript **6.0.x**. Pinning to 5.x (as the brief
  suggested) would break the Workflows blueprint. **Decision: pin `typescript@6.0.3`.**

### 8. Hosting — hourly sync can't run on Vercel Hobby cron

- Vercel docs (last updated 2026-07-15): Hobby's minimum interval is **once per day**, and
  `0 * * * *` **fails at deploy time** with "Hobby accounts are limited to daily cron jobs". Pro allows once per minute.
- Plan of record: **GitHub Actions `schedule: '0 * * * *'`** calls a protected sync route
  (or runs the sync script directly). It is free on public repos. GitHub's scheduled runs
  can be delayed under load, so `/sync` shows the *actual* last run time, not the schedule.
- The Vercel plan for this account hasn't been checked yet (`VERCEL_ORG_ID` is empty).

### Where the agent got stuck this session

- A shell helper that passed `--data-urlencode=…` (with `=`) to curl failed on every call.
  Fixed by switching to a tiny Node `fetch` script.
- The NYC terms page moved and the old URL returns 404. That's recorded above instead of
  being papered over.

### 9. Workspace scaffold

- pnpm workspace with `studio`, `web`, `sync`, `workflows`, `app`, `agent`, `ingest`, matching the spec's repo layout.
  The packages are named `@pothole/*`, and `tsconfig.base.json` is shared.
- Ports are wired into the scripts: Next.js `next dev --port 3004`; Studio `sanity dev --port 3337` and `server.port` in `sanity.cli.ts`.
- Exact pins where the docs ask for lockstep: `@sanity/workflow-engine`, `-cli` and `-blueprint` are all `0.36.0`;
  `sanity 6.17.0`; `next 16.3.8`; `typescript 6.0.3`.
- Install: 884 packages, mostly reused from the warm shared store. `pnpm peers check`: **no peer issues**.
- Proven, not assumed:
  - `pnpm -r typecheck`: all 7 packages pass on TS 6.0.3.
  - `next build` (Next 16.3.8 / Turbopack) succeeds, including its own TypeScript pass.
  - `sanity build` succeeds.
  - `sanity-workflows --version` prints `@sanity/workflow-cli/0.36.0`. The CLI **is** on npm in this version,
    unlike the "documented CLI missing from npm" another entrant reported.
- `pnpm ignored-builds` printed "Cannot identify as no node_modules found" even though everything runs.
  Possibly a pnpm 12 reporting quirk; noted, not chased.
- **Deliberately not done yet:** schemas, sync, pages, workflow definitions. `/app` has only its deps.
  It will be regenerated from `sanity init --template app-quickstart` once `SANITY_ORG_ID` is set.

---

## 2026-10-04 — Session 2: schema, mappings, first real sync

### Prompt

> Credentials complete … You are unblocked: schema, sanity schema deploy, then the 311 sync.
> Document IDs must NOT contain dots (Sanity hides them from anonymous readers; best-track hit this).
> Verify the Workflows package names before installing.

The Workflows packages were re-checked on the registry and are unchanged at 0.36.0 (engine, cli, blueprint).

### Decisions made with the project owner (2026-10-04)

| Question | Decision | Why |
| --- | --- | --- |
| Scope (spec: Queens, 180 days + all open, cap 3,000) | **Queens Community Board 13, in full**: every complaint from the last 180 days plus every one still open | The borough has ~25,800 in that scope. One board fits under the cap with **nothing sampled or dropped**, so every pet is traceable and clustering sees complete data. |
| Sanity plan | Growth (50,000 documents) | Free allows 10,000 (Sanity technical-limits page), and complaints + pets + events would get close. |
| DOT-internal referrals (Inspections, Arterial, Maintenance, Bridge) | **Transferred** | Owner's call. **But see below:** in CB 13 none of these are on a closed ticket. |
| Highway and bridge potholes | Excluded (the spec says street potholes) | Default; not asked again. |

### Things the spec had wrong or didn't anticipate

- **Dotted IDs.** The spec says `complaint311.<unique_key>`, but every ID here uses hyphens: `complaint311-<key>`, `pothole-<key>`,
  `statusEvent-…`, `syncRun-…`, `resolutionMapping-…`. Confirmed in this dataset: the 12 system docs
  (`_.groups.*`) are all dotted and all invisible to an anonymous query. After the sync, an anonymous query sees
  every complaint, pet, event, mapping and run. A test asserts that no ID contains a dot.
- **Referrals are never closed.** The discovery run showed that all 467 "referred …" texts in CB 13 sit on
  `Pending` (or `Open`) complaints. Under the spec's own rule, non-closed complaints are In the shelter or Feral by age,
  so the owner's "Transferred" mappings exist but match nothing today. The status rule stays in charge;
  a mapping does not override a ticket the city still lists as open.
- **"Status not available online" (510 rows).** 505 are Pending and 5 are Closed. Those 5 are the whole **Unmapped** bucket:
  the text has no information, so the honest move is to show it unmapped, not guess.
- **Pending complaints that say "repaired" (1) or "duplicate" (1).** The text and status disagree. Status wins (still open).
- **Old ferals dominate.** Outcome distribution: **963 feral vs 14 in the shelter**. CB 13 has 831
  complaints still Pending from 2021–2026. The 60-day rule is the spec's; the data makes the Feral wing huge.
  This is the city's real backlog, not something the code invented.
- **Median days to close is misleading.** It's 0.4 days overall, because **366 duplicates closed within one minute** of filing
  (automatic duplicate closure). By resolution: repaired **0.9 days** (n=653), found fixed 1.0 (15),
  not found 0.5 (408), duplicate 0.0 (445). The post should quote the repaired median, which is worth celebrating.
- **Time zones.** 311 dates are Socrata floating timestamps (no zone). I read them as New York wall-clock
  time and convert to UTC in one place (`sync/src/time.ts`), with DST tests. This is an *assumption*.
  It's consistent with the data (a 19:02 close time pairs with a 01:39Z load the next day), but the dataset page doesn't state it.

### Schema (deployed with `sanity schema deploy`, experimental in sanity 6.17.0)

- `complaint311.raw` is the Socrata row exactly as received, minus system fields like `:updated_at`, which
  sits beside it as `sourceUpdatedAt`. The whole doc is read-only in the Studio. `rawHash` = SHA-256 of canonical JSON.
- `pothole` holds only derived fields: name, slug, temperament, outcome, bio + provenance, refs, place,
  rounded geopoint, `hasCoordinates`. Nothing is copied back onto complaints. Outcome is read-only.
- `resolutionMapping`, `clusterDecision`, `statusEvent` (cause = complaint ref + the field that changed, with
  old/new values; kinds `complaintChange`, `timeRule`, `mappingChange`), `adoption`, `syncRun`.
- Desk structure: pets by outcome, lost strays, staff queues, the read-only city record, events, runs.
  The Studio hides create/delete for sync-owned types, but that is cosmetic. Server-side checks will enforce it (next session).
- The project ID is hardcoded in the Studio config. It is public by design, and the Studio bundle can't read
  non-`SANITY_STUDIO_` env vars.
- The Deploy Studio token can deploy schemas but **cannot read datasets or CORS** (401, missing grants).
  CORS origins need the owner or a broader token.

### Resolution discovery → mappings (spec order respected)

`pnpm --filter @pothole/ingest discover` → snapshot `discovery-20261003T202235Z` (3 pages, SHA-256 in
the manifest), 2,503 complaints, **11 distinct texts**, written to `ingest/data/resolutions.json`.
There are 8 `resolutionMapping` docs, all exact matches, each with a rationale citing the counts. 3 texts are left unmapped
on purpose (no information, or "will schedule / rescheduled"). A test checks that every real text is either
mapped or on that deliberate list, so new city wording can't slip through silently.

### The sync

- `sync/src/plan.ts` is pure: (stored state, fetched rows, clock) → exact writes. Raw records are written only when
  the hash changes. Every pet is recomputed each run (the 60-day rule needs that). Status events have IDs
  derived from *what happened*, never from the run, so retries can't duplicate them. A model-restyled bio survives
  until the facts under it change.
- Incremental mode filters on `:updated_at >= watermark` **without** the window/open clause. A known
  complaint that just closed no longer matches `status != 'Closed'`, and the sync must still see it close.
- Each fetched page is saved verbatim to `ingest/data/raw/<runId>/page-NNNN.json`, with a manifest recording
  the retrieval time and SHA-256.
- Runs as plain Node 24 TypeScript (type stripping, `.ts` import extensions), with no build step and no `tsx`.

### Measured (live, 2026-10-03 20:28 UTC, CB 13)

| Measure | Value |
| --- | --- |
| Complaints synced | **2,503** (first full run: 1 min 59 s) |
| Status events | 4,992 (rebuilt history: reported → shelter → [feral] → outcome) |
| Outcomes | adopted 668 · ghost 408 · transferred 445 · feral 963 · shelter 14 · unmapped 5 |
| Lost strays (no coordinates) | **1,552 of 2,503 (62%)** |
| Unmapped phrases | 1 distinct ("status … not available online"), 5 complaints |
| Median days to close | 0.9 for repairs; 0.4 overall (skewed by instant duplicate closures) |
| **Second sync** | incremental: fetched 4, **0 created / 0 updated / 0 events**; forced full: fetched 2,503, **0 / 0 / 0**; documents touched after run 1: **0** |
| Tests | **31 passing** (sync 28, ingest 3) |

### Where it got stuck

- **Multi-file shell heredocs failed twice** ("unexpected EOF while looking for matching quote"): once when writing
  8 schema files, and again when appending this very log entry. Quote characters inside the content broke the shell
  parse. Fixed by writing files with the editor tool. Lesson: don't pack source or prose into one shell command.
- **The idempotency test caught a real bug.** Two runs in the same second got the same `syncRun-<timestamp>` ID,
  so the second run's "running" doc overwrote the first's success record, lost the watermark, and silently
  fell back to a full fetch. Fixed with a random suffix on run IDs (nothing derived depends on them).
  This can happen in practice when a manual run overlaps the scheduled one.

### Not done yet

- Clustering (60 m / 30 days, same street) and `clusterDecision` proposals. Today every complaint is its own pet.
- The scheduler (GitHub Actions, hourly), and committing snapshots from CI. A full run adds ~2.3 MB of
  snapshot; incremental runs add a few KB.
- Server-side enforcement that only the sync token changes outcomes; the bio fact guard; the model restyle.

---

## 2026-10-04 — Session 3: coordination protocol, Workflows spike

### Prompt

> New coordination protocol … append one entry to docs/REPORT.md … commit and push everything
> outstanding, and continue with whatever is unblocked. Do not idle waiting for a reply.

### Reconciling the cross-project findings (GUIDANCE F1–F31)

- **F5 contradicted what I had recorded.** The owner had said the plan was Growth 50k; F5 says it's a Growth **trial** with 10k.
  Live count: **10,022 documents**, and the writes past 10,000 succeeded, so the cap is soft or enforced later. The tokens can't
  read the org plan (401/404). Escalated in REPORT; nothing that adds documents runs until it's answered.
- F18 said "pin TS to 5.x". I'd already shown 6.0.3 is the only version satisfying both `typescript-eslint` and
  `@sanity/workflow-blueprint`, so I kept 6.0.3 and said so rather than silently choosing.
- F16 named `@sanity/workflow-engine-test`, the in-memory test bench I'd logged as missing from the docs.

### Workflows spike (spec: 2-hour timebox, fallback ready): **succeeded locally**

- Sources: the package READMEs, `DATAMODEL.md` and the shipped `.d.ts` (2,352 lines for `define`), plus the live
  getting-started page. For a 0.x API the shipped types beat any blog post.
- Three definitions (`workflows/src`): `pothole-lifecycle`, `cluster-review`, `adoption-moderation`.
  `sanity-workflows deploy --check` → "3 definition(s) passed validation". **20 bench tests** pass.
- `defineWorkflow`'s validator is excellent: it rejected a probe with "activity has no path to a terminal
  status … the stage's `$allActivitiesDone` gate would wedge". `startInstance` rejected an untyped initial
  field with "feralAt (undefined) has the wrong kind; expected datetime".
- The Feral rule is a `$now` transition. The bench owns the clock (`setNow` + `tick`), so the test proves the
  pet stays in the shelter at 60 days minus one second and turns feral at exactly 60 days.
- **Departure from the spec:** I added an `unmapped` stage. Otherwise a closed-but-unmapped pet stays "open" in
  the engine and the clock would wrongly turn it feral.

### Where it got stuck: the person-only gate that gated nothing

The prompt that failed was my own assumption. I wrote `filter: '$actor.kind == "person"'` for "only a person
approves". The first test run looked fine for people, but the "an agent cannot approve" tests failed with a
*different* error (an invalid id format), which meant the filter had **let the agent through**.

A probe with three actor kinds showed the engine stamps **every** resolved actor as `kind: "person"`, robot
tokens included. The docs half-say this ("the engine always resolves it from the client's token; there is no way
to pass or synthesize one"). The real discriminator is the id namespace (`g…` user, `p-…` robot; DATAMODEL
Model 4). Fixed gate: `!string::startsWith($actor.id, "p-")`.

The lesson for the post: **my test fixtures used fake ids (`p-staff` for a person!) that happened to look
like robots, which hid the bug.** Realistic fixtures matter as much as assertions. Every refusal test now
asserts the specific "action filter returned false" error, so it can't pass for the wrong reason.

### Consequences discovered

- **Workflow instances live in the dataset as documents.** One per pet is ~2,500 more, which feeds the cap question.
- **`$now` transitions need a ticker.** The CLI expects a scheduled heartbeat function, and says it runs hourly on
  Growth and daily on Free. Recommendation: the hourly sync ticks open instances itself.
- **Engine gates are advisory twice over:** the actor is "provenance, not an authenticated principal", and
  mutation guards are "not enforced by the lake yet". Server routes must enforce who changes outcomes and who approves.

### Clustering rule (pure code + 13 tests; proposals measured, nothing written)

- The spec rule is 60 m / 30 days / same street. **Strays can't be measured in metres**, so a second, clearly labelled
  basis applies to them: same street *and* the same two cross streets (the same block) within 30 days. These proposals carry
  **no `distanceMetres`**, and their reason says "no coordinates to measure". A stray is never linked to a located complaint.
- **The tests caught a data trap:** 866 of the 951 located complaints are `INTERSECTION` rows with **no `street_name`**,
  only `intersection_street_1/2`. Keyed on `street_name`, the rule would have ignored 91% of the measurable complaints.
  Fix: an intersection is on both of its streets.
- Measured on snapshot `syncRun-20261003T202805Z-776131` (checksums verified), via `pnpm --filter @pothole/ingest measure:clusters`:
  **363 proposals** (122 by distance, 241 same-block), covering 1,260 complaints. If every one were approved, CB 13 would
  have **1,606 pets instead of 2,503**. Largest: 35 complaints on one block of 267 Street in 20 days.
- **"0 m apart" is an artifact.** Intersection complaints are geocoded to the intersection point, so a 16-complaint group
  "within 0 m" means "the same corner", not proof of one pothole. A reviewer must know this; the post should say it.
- Single linkage chains: no distance group spreads past 60 m, but time spans chain up to 99 days through 30-day links.
  The reason text reports the true spread and span, and a person decides.

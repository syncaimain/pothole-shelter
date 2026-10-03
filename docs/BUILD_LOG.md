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

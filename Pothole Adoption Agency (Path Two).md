# Pothole Adoption Agency: standalone build spec (Path Two)

Oct 3, 2026 · @hassan

## Overview and standards

Build the Pothole Adoption Agency: a Path Two app that turns real NYC 311 pothole complaints from one borough into adoptable pets, whose fates follow the city's real record: repaired, "no pothole found", referred elsewhere, or still open. The target is a full score on the unofficial scorecard: all four judging criteria at 5 and every checklist item present.

### The challenge rules this build must satisfy

- **Event.** The Sanity Challenge on DEV, Path Two: "Vibe-Code Something Strange." Prompt your way to a working app with an AI-native IDE, Next.js or Astro on the front and Sanity behind it.
- **Judging criteria.**
  - Quality and honesty of the build process writeup.
  - Functionality of the finished app.
  - Thoughtfulness of the schema behind it.
  - Creativity and originality.
- **The brief's bar.** The build is judged as much as the result, and a rough app with an honest writeup beats a polished one with three sentences. Bonus points for reaching past the Studio: an App SDK app with real-time data, and Workflows that model a process as data so an agent can move a draft forward and a person can approve it.
- **Requirements.**
  - A DEV post using the Path Two template with the `#sanitychallenge` tag.
  - The Sanity project ID or a public dataset URL.
  - Testing credentials if anything needs a login.
  - Only one submission per path.
- **Encouraged.** A public agent session uploaded through DEV's Agent Sessions uploader.

### What earns a 5 on each criterion

| Criterion | What the build must show |
| --- | --- |
| Build process writeup | Honest decisions about messy data (missing coordinates, unclear resolution text), prompts that failed, a public agent session |
| Functionality | An hourly sync with a visible "last synced" time, a cached fallback, an idempotent sync proven by tests, public mirrors of every App SDK view |
| Schema | Raw 311 records kept untouched; pet fields separate; resolution codes mapped by documents; outcome changes allowed only through sync events |
| Creativity | Real civic data as a shelter, with "lost strays" and "ghosts" made from the data's own gaps |

### Scope

- **In:** one borough (Queens), complaints from a rolling 180 days plus every complaint still open, capped at 3,000; hourly sync; pets, outcomes, strays and ghosts; an adoption form with moderation; three Workflows; the App SDK Shelter Office with public mirrors.
- **Out:** other boroughs, filing new complaints, public user accounts.
- **Tone:** celebrate repairs; never mock residents or road crews.

### Ground rules

- **Check the docs first.** Read the current Sanity docs before coding against Workflows or the App SDK; both are new and Workflows packages are 0.x. Anything marked **Verify** in this spec comes from other entrants' posts or memory and must be confirmed first.
- **Never invent facts.** Never make up data, IDs, citations or API fields. Pet bios may only restate facts from the complaint records.
- **Code decides outcomes.** Deterministic code maps 311 records to outcomes; any model only writes bios and proposes clusters for a person to approve.
- **Snapshot the data.** Save each sync's raw pages with retrieval date and SHA-256 checksum, so tests and the measured results reproduce.
- **Keep a build log from day one.** Write to `docs/BUILD_LOG.md`: prompts that worked, prompts that failed, where you got stuck, how you fixed it, and what you cut. This file is the heart of the Path Two post.
- **Keep secrets server-side.** Never commit or expose tokens (Sanity, Socrata app token, model keys). Before making the agent session public, scan the transcript for secrets.

### Stack

| Layer | Choice | Note |
| --- | --- | --- |
| Runtime | Node 22.12+, TypeScript, pnpm workspaces | **Verify:** one entrant reported Studio v6 needs Node 22.12 or later |
| Content | Sanity Studio, deployed with `sanity deploy` | Read-only outcome fields, custom desk structure |
| Public site | Next.js (App Router) on Vercel | No login on any public page |
| Sync | Vercel Cron or GitHub Actions, hourly | Socrata SODA API with an app token |
| Workflows | Sanity Workflows engine | **Verify** package names (entrants used `@sanity/workflow-engine`, `@sanity/workflow-cli`, `@sanity/workflow-studio-plugin` around 0.33) |
| App | Sanity App SDK (`@sanity/sdk-react`) | Runs inside the Sanity Dashboard; needs a login |
| Maps | MapLibre GL or Leaflet | Follow the tile provider's usage policy |
| Tests | Vitest (unit), Playwright (end-to-end), axe-core (accessibility) | All run in CI |
| CI | GitHub Actions | Typecheck, lint, test, build; badge in README |

### Repo layout

```
/studio      Sanity Studio: schemas, read-only rules, desk structure
/web         Next.js public site + API routes (adoption form, read-only proxies)
/sync        SODA client, upsert, clustering, outcome mapping, status events, syncRun
/workflows   potholeLifecycle, clusterReview, adoptionModeration + tests
/app         App SDK Shelter Office
/agent       bio writer and cluster proposer, with the fact guard
/ingest      discover_resolutions.ts; data/raw sync snapshots with checksums
/docs        BUILD_LOG.md, decision records, screenshots, video script
```

### Sanity setup

- **Project and dataset.** One project with a `production` dataset that is publicly readable, so judges can run GROQ without a token.
- **Stable IDs.** Deterministic document IDs (`complaint311.<unique_key>`, `pothole.<first unique_key>`), so re-syncs update instead of duplicating.
- **Imports.** Use NDJSON or the client's transactions; one entrant hit a failure importing a JSON array with the CLI.
- **CORS.** Add the production site and localhost as CORS origins.
- **Public query URL for the post.** **Verify** the current API version date:

```
https://<projectId>.api.sanity.io/v2025-02-19/data/query/production?query=*[_type=="pothole"][0...5]
```

### Workflows and App SDK rules

- **Spike first.** Spend a 2-hour timebox installing the Workflows engine and running one definition through its test bench. One entrant reported a documented CLI missing from npm.
- **Fallback if the spike fails.** Model the processes as documents with the same stages and transitions, enforced in server code, and say so plainly in the post.
- **Public proxy for workflow state.** **Verify:** an entrant reported workflow instance documents use dotted IDs that public datasets do not serve anonymously. Public pages read workflow state through a server-side, read-only proxy.
- **Guards are advisory.** A write token can bypass workflow guards, so enforce who may change outcomes and approve in server code as well, and test it.
- **The App SDK needs a login.** App SDK apps open inside the Sanity Dashboard. Every Shelter Office view needs a public read-only mirror, and the post must give test credentials or a video for the gated parts.

### Agent rules (bio writer and cluster proposer)

- **Facts only.** Bios start from a fact template; a model may restyle them, and a guard rejects any bio whose dates or numbers don't match the complaint records.
- **Propose, never decide.** Cluster merges are proposals; a person approves them through the `clusterReview` workflow.
- **Model choice.** Any model, but record its name and version in the build log.

## Data, content model and core logic

Raw 311 records are stored untouched, outcomes come only from documented mappings applied by the sync, and every change to a pet is recorded as an event that cites the complaint change behind it.

### Data source

| Source | What to pull | Terms | Verify |
| --- | --- | --- | --- |
| [NYC 311 Service Requests on NYC Open Data](https://data.cityofnewyork.us/) (Socrata dataset `erm2-nwe9`) | Pothole complaints for one borough | NYC Open Data terms; cite the dataset | Which dataset ID covers current years, the exact complaint type and descriptor values, field names |

Example query (SODA API; page with `$limit` and `$offset`; send an app token in the `X-App-Token` header):

```
https://data.cityofnewyork.us/resource/erm2-nwe9.json?$where=complaint_type='Street Condition' AND descriptor='Pothole' AND borough='QUEENS' AND created_date > '2026-04-01T00:00:00'&$order=created_date&$limit=1000&$offset=0
```

**Expected fields** (**Verify** by sampling): unique\_key, created\_date, closed\_date, agency, status, resolution\_description, resolution\_action\_updated\_date, incident\_address, street\_name, cross\_street\_1, community\_board, borough, latitude, longitude. For incremental sync, **Verify** that Socrata's `:updated_at` system field is available.

### Outcomes (driven only by city data)

| Outcome | Rule |
| --- | --- |
| Adopted into forever pavement | Closed with a resolution saying the defect was repaired |
| Ghost | Closed with a resolution saying no defect was found |
| Transferred | Referred to another agency or closed as a duplicate |
| Feral | Still open after 60 days |
| In the shelter | Open for less than 60 days |
| Lost stray | Any of the above, but with no coordinates; listed by address and community board instead of on the map |

Do not write mapping rules from guesses. First run `ingest/discover_resolutions.ts`, which lists every distinct resolution text with its count. Then write one `resolutionMapping` document per phrase pattern. Unmatched phrases go to a public "Unmapped" bucket.

### Content model

| Type | Key fields |
| --- | --- |
| `complaint311` | Every raw field untouched, plus syncedAt, rawHash, source row URL; ID `complaint311.<unique_key>` |
| `pothole` | name, slug, temperament, complaints\[\] (refs), street, cross street, community board, location (rounded to 3 decimals for display), hasCoordinates, outcome (written only by sync), firstReportedAt, lastEventAt, bio |
| `resolutionMapping` | phrase pattern, outcome, example phrases\[\], rationale |
| `clusterDecision` | complaints\[\] (refs), proposedBy (rule or agent), distance in metres, days apart, reason, decision, decidedBy |
| `statusEvent` | pothole (ref), from, to, at, cause (complaint ref and the field that changed) |
| `adoption` | pothole (ref), display name, message, createdAt, moderation state |
| `syncRun` | started, finished, fetched, created, updated, unchanged, unmapped, failed, error |

**Validation and enforcement:**

- **Outcome.** A pet's outcome is read-only in the Studio, and the server only accepts outcome changes from the sync token.
- **Status events.** Every `statusEvent` cites the complaint change that caused it.
- **Raw records.** A `complaint311` is only rewritten when the source record's hash changes.
- **Adoptions.** Hidden until a person approves them.

### Pets: clustering, names and bios

- **Clustering.** Complaints within 60 m and 30 days of each other on the same street become one pet. Single complaints become a pet automatically. Merges of two or more complaints become a `clusterDecision` for a person to approve.
- **Names and temperaments.** Generated deterministically, seeded by the first complaint's key, from original name lists. Temperament is derived from age and complaint count (for example, three or more complaints makes a pet "grumpy").
- **Bios.** Built from a fact template; a model may restyle them. A guard rejects any bio whose dates or numbers don't match the complaint records.

### Workflows

| Workflow | Stages | Who moves it |
| --- | --- | --- |
| `potholeLifecycle` | Reported, In the shelter, then Adopted, Ghost, Transferred or Feral | The sync runtime only, using the mappings; Feral by a time rule tested with a deterministic clock |
| `clusterReview` | Proposed, then Approved or Rejected | Proposed by the rule or agent; decided by a person |
| `adoptionModeration` | Submitted, then Approved or Rejected | A person |

Follow the Workflows spike-and-fallback rules from the overview, and read workflow state on public pages through the read-only proxy.

### App SDK: Shelter Office (logged-in staff)

- **Queues.** Cluster review, adoption moderation, and unmapped resolution phrases.
- **Sync health.** A panel showing recent sync runs.
- **Lifecycle board.** A live board of pets by outcome.
- **Public mirror.** A read-only mirror at `/office`; test credentials and a video in the post.

### Sync

1. Run hourly (Vercel Cron or GitHub Actions) and fetch only records changed since the last run.
2. Upsert by deterministic ID only when the raw hash changes.
3. Recompute affected pets, write status events and record a `syncRun`.
4. On failure, keep the last good data and show a banner: "Data from \[time\]; last sync failed: \[reason\]".

## Site, evaluation and delivery

The build is done when a judge can follow the judge path below without logging in, a second sync changes nothing, and every checklist item at the end is ticked.

### Public site

- **`/`:** the pet gallery with filters by outcome, community board and age, and a "Feral of the week".
- **`/pothole/[slug]`:** name, temperament and bio; complaint history linking to each real 311 record; a status timeline; a rounded map pin.
- **`/strays`:** lost strays by community board. **`/ghosts`:** the "no pothole found" hall.
- **`/adopt/[slug]`:** an adoption form, rate-limited and filtered, that goes to moderation.
- **`/sync`:** last sync time, run log, failures and unmapped phrases.
- **`/office`:** the public mirror of the Shelter Office.
- **`/how-it-works`:** schema, workflows, data source and terms, and the Workflows status (engine or declared fallback).

**Demo standards for every page:**

- **Instant start.** No login anywhere; the gallery is the first screen.
- **Visible failures.** Loading states, and the stale-data banner when a sync fails; never a silent fallback.
- **Always something to see.** The last good snapshot keeps every page working if the 311 API or Sanity is slow.
- **Accessibility.** Mobile layout, full keyboard use, a list alternative for the map, and axe-core with zero serious violations in CI.
- **Abuse limits.** Rate-limit and filter the adoption form; nothing a visitor types is public until approved.

### Measured results for the post

Compute these from your own snapshot; do not quote other projects' figures:

- complaints synced
- share without coordinates
- outcome distribution
- median days to close
- unmapped phrase count
- the idempotency result ("second sync: 0 changes")
- workflow test pass count

### Tests and CI

- **Mappings and pets.** Mapping rules against fixtures of real resolution texts, and the clustering rule on hand-made cases.
- **Sync.** Running twice gives zero changes, paging works, and a mocked API outage shows the banner.
- **Workflow.**
  - Only the sync token changes outcomes.
  - Only a person approves clusters and adoptions.
  - The Feral time rule works on a fixed clock.
- **Bio guard.** A bio with a wrong date is rejected.
- **End-to-end.** Playwright runs the judge path below, plus axe-core.
- **CI on every push.** Typecheck, lint, unit tests and build; a CI badge in the README.

### DEV post

- **Template.** Path Two headings: What I Built, Demo, Code, My Build Process, Sanity Project Details, Agent Session. Tag `#sanitychallenge`.
- **First screen.** One-line pitch, demo link, the measured results and the project ID.
- **My Build Process (the most important section).**
  - The AI-native IDE or agent used.
  - Prompts that worked and prompts that failed.
  - Where the model got stuck (for example 311 field names, paging, Workflows APIs) and how you course-corrected.
  - The messy-data decisions (strays, ghosts, unmapped phrases), what you cut, and how the Workflows spike and App SDK went.
- **Sanity Project Details.**
  - The project ID and public GROQ query URL.
  - The schema as a type list or diagram, explaining why raw records and pet fields are kept apart.
  - The three workflows.
- **Honesty sections.** Known limitations (one borough, inconsistent resolution wording, clustering heuristics) and the data source with its terms.
- **Why it's new.** One paragraph: no other entry turns live civic data into a shelter, and the data's own gaps become characters.
- **Agent session.** A curated session uploaded through the Agent Sessions uploader, set to Make Public.
- **Video.** 2 to 3 minutes with captions: a Feral pet and its real complaint history; a ghost; a stray; an adoption approved in the Shelter Office; the sync log.

### Judge path (post, video and Playwright)

1. Open the gallery and click a Feral pet.
2. Read its complaint history and follow a link to the real 311 record.
3. Open `/strays` and `/ghosts`.
4. Submit an adoption and see "awaiting moderation"; approve it in the Shelter Office with the test credentials, or watch the video.
5. Open `/sync` for the last sync and the run log.

### Acceptance checklist

- [ ] The post states Path Two and uses the template
- [ ] Project ID and public dataset query URL appear in the post
- [ ] Live demo works with no login
- [ ] Public repo is linked, with a README and CI badge
- [ ] A 2-3 minute video walkthrough is linked
- [ ] A public agent session is embedded
- [ ] Testing instructions and Shelter Office credentials are in the post
- [ ] Measured results (sync stats, idempotency, test counts) appear near the top
- [ ] Known-limitations and what-didn't-work sections
- [ ] Real, cited public data
- [ ] The schema is shown in the post, with reasons
- [ ] The App SDK Shelter Office works, with a public mirror
- [ ] The Workflows definitions run (or the declared fallback)
- [ ] Build process notes: prompts that worked and failed, where the model got stuck
- [ ] A paragraph on why the idea is new

### Risks and Verify list

- **Verify** the dataset ID, field names, complaint values, paging limits and NYC Open Data terms before coding.
- **Verify** Workflows package names and the App SDK setup in the current docs.
- **Privacy:** show street and cross street with rounded coordinates, not exact house numbers.
- **Risk:** resolution wording may be inconsistent; the discovery script and the public Unmapped bucket make this visible instead of hiding it.
- **Workflows packages** are 0.x; keep the server-side fallback ready.

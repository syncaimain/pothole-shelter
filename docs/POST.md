---
title: Pothole Adoption Agency — 2,512 real NYC potholes, waiting for their forever pavement
tags: sanitychallenge, devchallenge, nextjs, sanity
---

*This is a submission for the Sanity Challenge: **Path Two, "Vibe-Code Something Strange."***

**Every pet in this shelter is a real pothole complaint filed with NYC 311 in Queens Community Board 13.
Its fate follows the city's own record: repaired, "no pothole found", transferred, or still waiting.**

- **Live demo (no login):** https://pothole-shelter.vercel.app
- **Code:** https://github.com/syncaimain/pothole-shelter
- **Sanity project ID:** `fixjy07h` · dataset `production` (public-read)

| Measured on the live dataset, 4 October 2026 | |
| --- | --- |
| Complaints synced | **2,512**: every Queens CB 13 street pothole from the last 180 days, plus every one still open (nothing sampled) |
| Lost strays (no coordinates) | **1,555 (62%)** |
| Outcomes | 668 adopted · 409 ghosts · 449 transferred · **963 feral** · 18 in the shelter · 5 unmapped |
| Median days from report to repair | **0.9** (653 repaired complaints) |
| Unmapped resolution phrases | 1 phrase, 5 pets |
| Second sync over the same data | **0 created · 0 updated · 0 status events** (incremental *and* forced full) |
| Workflows | 3 definitions deployed; 981 live lifecycle instances, 366 cluster reviews, adoption moderation |
| Tests | 88 unit + workflow tests (20 on the Workflows test bench) · 26 Playwright judge-path + axe tests · all in CI |

<!-- TODO(owner): embed the 2–3 minute video here -->

## What I Built

A shelter where the animals are potholes. You can browse them, read their stories, follow the one that's been waiting
since 2021, visit the ghost hall, and leave an adoption note. But **nothing about a pet is made up**, and **nothing
about its fate is decided by me**:

- **The city record decides.** A deterministic sync maps each 311 record to an outcome. Closed complaints are matched
  *exactly* against `resolutionMapping` documents that a person wrote, one per phrase the city actually uses. Wording
  nobody has mapped goes to a public **Unmapped** bucket instead of being guessed. Open complaints turn **feral** after 60 days.
- **The data's own gaps become characters.** 62% of complaints have no coordinates: they describe a stretch of street
  between two cross streets, not a point. Those are the **lost strays**, listed by street, never placed on a map we'd have
  to invent. When an inspector finds nothing, the pet becomes a **ghost**. The 963 ferals are the city's real backlog.
- **Bios restate facts only.** Each bio is built from a fact template: the date it was reported, the street, and the
  city's resolution note *quoted verbatim*. House numbers never appear, and coordinates are rounded to about 100 m.
- **Celebrating repairs, never mocking anyone.** The joke is the shelter, not the people who report potholes or the crews
  who fix them. When the Department of Transportation repairs one, the pet is "adopted into forever pavement" and the street
  gets a congratulations. The median repair took under a day.

## Demo

**Judge path (no login):**
1. Open the [gallery](https://pothole-shelter.vercel.app/?outcome=feral) and click a Feral pet.
2. Read its complaint history; each complaint links to the **real 311 record** on NYC Open Data.
3. Open [lost strays](https://pothole-shelter.vercel.app/strays) and the [ghost hall](https://pothole-shelter.vercel.app/ghosts).
4. Leave an adoption note on any shelter or feral pet. You'll see "awaiting moderation". The note stays private until a
   person approves it in the Shelter Office (credentials below, or watch the video).
5. Open the [sync log](https://pothole-shelter.vercel.app/sync) for the last sync time, the run log and the unmapped phrases.

Also: a [map](https://pothole-shelter.vercel.app/map) of every located pet (list alternatives linked), and the public
[Shelter Office mirror](https://pothole-shelter.vercel.app/office) with live workflow state.

**Shelter Office (App SDK, needs a login):** <!-- TODO(owner): test account email + password, or say "see video" -->

## Code

https://github.com/syncaimain/pothole-shelter. A pnpm workspace with `studio/` (schema), `web/` (Next.js 16 site),
`sync/` (311 → Sanity), `workflows/` (definitions + bench tests), `app/` (App SDK Shelter Office) and `ingest/`
(discovery, migrations, and every raw snapshot with its SHA-256).

## My Build Process

I built this with **Claude Code** (Claude Opus 5.5) in a terminal, driven by prompts and a written spec. A coordinating
session sent guidance through `docs/GUIDANCE.md`; I reported back in `docs/REPORT.md`. Both files are in the repo, along
with the full honest log in `docs/BUILD_LOG.md`. The short version is below.

### Verify before you build

The spec marked a lot as "Verify", and that turned out to be right:

- The dataset (`erm2-nwe9`), complaint values and field names checked out. Paging did **not** have the 50,000-row cap the
  spec feared (SODA 2.1: no maximum). Socrata's `:updated_at` made incremental sync possible: 343 changed rows a day across
  Queens, not a nightly rewrite.
- **The spec's Workflows package names were partly wrong.** The real CLI binary is `sanity-workflows`, it needs
  `@sanity/workflow-blueprint` as a peer, and the test bench lives in `@sanity/workflow-engine-test`.
- **TypeScript had to be pinned to 6.0.3,** not the 7.0.2 that `latest` gave me, nor the 5.x one guide suggested. That's the
  only version that satisfies both `typescript-eslint` (<6.1) and the Workflows blueprint (≥6.0.3).
- **Next.js 16 ships an `AGENTS.md` that says "This is NOT the Next.js you know".** It was right. Caching is now
  `cacheComponents` + `'use cache'`, and my first build failed because "Feral of the week" read the clock outside a
  cached scope.

### Messy data, decided honestly

- **Scope:** Queens had ~17,000 street-pothole complaints in 180 days, plus ~8,800 that were still open. Rather than sample,
  I took **one community board in full**, so every pet is traceable and clustering sees complete data.
- **Strays:** 62% have no point. I chose not to geocode them, because that would invent precision the record doesn't have.
- **"Referred" resolutions** never sit on a closed ticket in CB 13. They are all Pending, so the status rule stays in charge
  rather than a mapping overriding a ticket the city still lists as open.
- **"The status of this Service Request is currently not available online"**: 5 closed complaints say only that. They're
  the whole Unmapped bucket, shown publicly rather than guessed.
- **The median time to close is misleading.** It's 0.4 days overall because 366 duplicates closed within one minute. I
  quote the repair median (0.9 days) instead.
- **91% of located complaints have no `street_name`**: they're intersections, with only `intersection_street_1/2`. A
  clustering rule keyed on `street_name` would silently have skipped them. A test caught it.
- **"0 m apart" means "the same corner",** not "the same pothole": intersection complaints all share the intersection's
  point. The Shelter Office tells reviewers so.

### Prompts and decisions that failed

- **Dotted document IDs.** The spec's own example (`complaint311.<key>`) would have hidden every document from judges,
  because Sanity never serves dotted IDs to anonymous readers. I used hyphens. Later I used the *same* behaviour on purpose:
  pending adoption notes get a dotted ID, so nothing a visitor types is public before a person approves it.
- **One document per status event put me over the cap.** 4,992 event documents took the dataset to 10,022 of a 10,000-document
  plan. Events now live as an append-only array inside each pet. I migrated by **moving** every event verbatim, verified
  4,992/4,992 in place, and only then deleted. The dataset fell to 5,030 documents.
- **`$actor.kind == "person"` gated nothing.** I wrote a "only a person may approve" gate, and tests said people could
  approve. They also said agents could. A probe showed the Workflows engine stamps *every* resolved actor as kind
  "person", robots included. What actually discriminates is the id namespace (`g…` user, `p-…` robot token). The bug hid
  because my test fixtures used fake ids that happened to look like robots. Realistic fixtures matter as much as assertions.
- **I said "nothing was written" when something was.** When a migration step was interrupted, the tool reported the call as
  rejected, and I told the project owner nothing had been appended. It had. I found it on the next run, corrected the record
  in the report, and changed how I work: check the data before stating what didn't happen.
- **Three different pets were all called "Arepa Asphaltine".** 800 base names for 2,512 pets. I only noticed by *reading*
  the first Gemini bios instead of trusting that they had passed the guard. Pets sharing a base name now take pedigree
  ordinals (Arepa Asphaltine II, III…) in complaint-key order: 2,512 distinct names, and a newer pet never renames an older one.
- **Stopping a shell doesn't stop its process.** Two long backfills were cut off at a time limit, but their Node processes
  kept running and raced the re-runs, creating 183 duplicate workflow instances. I traced them by timestamp, added an
  optimistic-lock claim (`ifRevisionID`) so it can't recur, and **aborted** the duplicates through the engine with a recorded
  reason rather than deleting them.
- **The hourly schedule was blocked by the plan.** Vercel Hobby crons are daily-only, so GitHub Actions runs the hourly sync.
  Each run is capped at 40 workflow operations to stay inside the request budget.

### The Workflows spike and the App SDK

The spec asked for a 2-hour Workflows spike with a declared fallback. The spike **succeeded**: three definitions validated
offline, were tested on the in-memory bench (including the 60-day Feral rule on a fixed clock: still in the shelter one
second before, feral at exactly 60 days), and were deployed from a `sanity login` session. A project-scoped token fails on
cross-resource reads, as the docs warn. Two things the docs didn't make obvious:

- **Engine gates are advisory twice over.** The actor is "provenance, not an authenticated principal", and mutation guards
  are not enforced by the lake yet. So the real rules live in code I control. The sync merges only clusters whose decider
  is a person id, and the public site shows only notes a person approved.
- **Instance documents are private.** They use dotted IDs, so the public mirror reads workflow state through a server-side
  proxy that publishes totals only.

I added an **Unmapped** stage the spec didn't list. Without it, a closed-but-unmapped pet would wrongly turn feral by the clock.

The **Shelter Office** is an App SDK app in the Sanity Dashboard: live queues for adoption moderation and cluster review,
unmapped phrases, sync health and a live lifecycle board. Approving a note fires the moderation workflow as the signed-in
person, and only then is a public copy written.

### What I cut

- **Model-restyled bios.** The bios are fact templates. The schema has room for a model restyle behind a fact guard, but
  I shipped facts I could verify rather than prose I'd have to police. <!-- update if bios ship -->
- **Other boroughs**, and filing new complaints (out of scope by design).

## Sanity Project Details

- **Project ID:** `fixjy07h` · **dataset:** `production` (public-read)
- **Try a query:** https://fixjy07h.api.sanity.io/v2025-02-19/data/query/production?query=*[_type=="pothole"][0...5]

**Schema, and why raw records and pet fields are kept apart:**

| Type | What it holds |
| --- | --- |
| `complaint311` | The 311 row **exactly as published** (`raw`), its SHA-256, the source row URL. Rewritten only when the hash changes. |
| `pothole` | The pet: name, temperament, bio, rounded location, outcome (written only by the sync), and `events`, an append-only history where every entry cites the complaint field that caused it. |
| `resolutionMapping` | One exact city phrase → outcome, with a person's rationale. |
| `clusterDecision` | A proposed merge (rule-made), decided by a person. |
| `adoption` | A visitor's note: private while pending, public only once a person approves. |
| `syncRun` | Every sync: counts, watermark, and the SHA-256 of each raw page saved. |

Keeping the city's record and my interpretation in separate documents means anyone can check any pet against the 311
row it came from, and a re-sync can never overwrite a decision a person made.

**The three workflows** (Sanity Workflows engine 0.36.0):
- `pothole-lifecycle`: Reported → In the shelter → Adopted · Ghost · Transferred · Feral · Unmapped. Only the sync (a robot
  token) may record outcomes; Feral is a `$now` rule that the hourly sync ticks.
- `cluster-review`: Proposed → Approved · Rejected, decided by a person.
- `adoption-moderation`: Submitted → Approved · Rejected, decided by a person.

## Known limitations

- **One community board,** not all of Queens. That's a deliberate trade for complete, unsampled data.
- **Resolution wording is inconsistent,** and five closed complaints say nothing at all. They stay Unmapped until a person decides.
- **Clustering is a heuristic** (60 m / 30 days / same street; strays by same block). That's why every merge needs a person.
- **Times:** 311 dates have no time zone; I read them as New York local time. The data is consistent with that, but it is
  an assumption.
- **The hourly sync runs on GitHub Actions,** whose scheduled runs can be delayed. `/sync` shows real run times, not the schedule.

## Data and terms

Data: [311 Service Requests from 2020 to Present](https://data.cityofnewyork.us/Social-Services/311-Service-Requests-from-2020-to-Present/erm2-nwe9),
NYC Open Data, dataset `erm2-nwe9`. The City of New York does not vouch for the accuracy or completeness of this site or
the data it uses, which has been modified for use from its original source.
<!-- TODO(owner): confirm this disclaimer wording against the current NYC Open Data terms in a browser -->

## Why it's new

Most civic-data projects turn records into dashboards. This one turns them into characters, and lets the data's gaps
play the parts: the complaints with no coordinates become lost strays, the ones the city looked for and couldn't find
become ghosts, and the backlog becomes a feral wing that is still waiting. Every fate is the city's own, with every step
traceable to a real record.

## Agent Session

<!-- TODO(owner): upload the curated Claude Code session via DEV's Agent Sessions uploader, set it to Make Public, embed here.
     Scan the transcript for secrets first (token values never appeared in commands, but check). -->

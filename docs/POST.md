---
title: Pothole Adoption Agency: 2,512 real NYC potholes, waiting for their forever pavement
published: false
tags: devchallenge, sanitychallenge, nextjs, sanity
cover_image: "[COVER IMAGE: upload docs/media/screens/01-gallery.png or a custom cover]"
---

*This is a submission for the [Sanity Challenge, Path Two: Vibe-Code Something Strange](https://dev.to/challenges/sanity-2026-09-16)*

**Every pet in this shelter is a real pothole complaint filed with NYC 311 in Queens Community Board 13. Its fate follows
the city's own record: repaired, "no pothole found", transferred, or still waiting.**

**Live demo (no login):** https://pothole-shelter.vercel.app · **Code:** https://github.com/syncaimain/pothole-shelter ·
**Sanity project:** `fixjy07h` (dataset `production`, public-read)

| Measured on the live dataset, 4 October 2026 | |
| --- | --- |
| Complaints synced | **2,512**: every Queens CB 13 street pothole from the last 180 days, plus every one still open. Nothing sampled. |
| Lost strays (no coordinates in the record) | **1,555 (62%)** |
| Outcomes | 668 adopted · 409 ghosts · 449 transferred · **963 feral** · 18 in the shelter · 5 unmapped |
| Median time from report to repair | **0.9 days** (653 repaired complaints) |
| Unmapped resolution phrases | 1 phrase, 5 pets, shown publicly instead of guessed |
| Second sync over the same data | **0 created · 0 updated · 0 status events** (incremental *and* forced full) |
| Workflows (Sanity Workflows engine) | 3 definitions deployed · 981 live lifecycle instances · 366 cluster reviews · adoption moderation |
| Tests, all in CI | 98 unit and workflow tests (20 on the Workflows test bench) · 26 Playwright judge-path + axe tests |

## What I Built

A shelter where the animals are potholes. Browse them, read their stories, follow the one that's been waiting since 2021,
visit the ghost hall, and leave one an adoption note. It's for anyone who has ever reported a pothole and wondered what
happened next, and for anyone who likes their civic data with a bit of heart.

The rule I never broke: **nothing about a pet is made up, and nothing about its fate is decided by me.**

- **The city record decides.** A deterministic sync maps each 311 record to an outcome. Closed complaints are matched
  *exactly* against `resolutionMapping` documents that a person wrote, one per phrase the city actually uses. Wording
  nobody has mapped goes to a public **Unmapped** bucket instead of being guessed. Open complaints turn **feral** after 60 days.
- **The data's own gaps become characters.** 62% of complaints have no coordinates: they describe a stretch of street
  between two cross streets, not a point. Those are the **lost strays**, listed by street and never placed on a map I'd
  have to invent. When an inspector finds nothing, the pet becomes a **ghost**. The 963 ferals are the city's real backlog.
- **Bios restate facts only.** Each bio starts from a fact template: the date it was reported, the street, and the city's
  resolution note *quoted verbatim*. Gemini may restyle it, but a fact guard rejects any changed date, number or street, a
  reworded city note, or anything that mocks people. House numbers never appear, and coordinates are rounded to about 100 m.
- **Celebrate repairs, never mock anyone.** The joke is the shelter, not the people who report potholes or the crews who
  fix them. When the Department of Transportation repairs one, the pet is "adopted into forever pavement" and the street
  gets a congratulations.

[SCREENSHOT 01: the gallery, with totals and filters — docs/media/screens/01-gallery.png]

[SCREENSHOT 02: Feral of the week (a lost stray, waiting since March 2024) — docs/media/screens/02-feral-of-the-week.png]

## Demo

**Live:** https://pothole-shelter.vercel.app (no login anywhere on the public site)

[VIDEO: upload docs/media/video/pothole-shelter-demo-voiced.mp4 (2:43) to YouTube with docs/media/video/captions.srt as its captions, then embed the link here]

*The narration is synthetic: each caption line was voiced with Gemini TTS () by , so voice and captions say the same words at the same moments.*

**The judge path:**
1. Open the [gallery](https://pothole-shelter.vercel.app/?outcome=feral&age=years) and click a Feral pet.
2. Read its complaint history and follow the link to the **real 311 record** on NYC Open Data.
3. Open [lost strays](https://pothole-shelter.vercel.app/strays) and the [ghost hall](https://pothole-shelter.vercel.app/ghosts).
4. Leave an adoption note on any shelter or feral pet. You'll see "awaiting moderation". The note stays private until a
   person approves it in the Shelter Office.
5. Open the [sync log](https://pothole-shelter.vercel.app/sync) for the last sync time, the run log and the unmapped phrases.

[SCREENSHOT 04: a feral pet: bio, temperament and the rounded map pin — docs/media/screens/04-pet-page-top.png]

[SCREENSHOT 06: its status timeline and complaint history — docs/media/screens/06-pet-timeline-and-history.png]

[SCREENSHOT 07: the same complaint on NYC Open Data — docs/media/screens/07-real-311-record.png]

[SCREENSHOT 08: every located pet on a map (only 38% have coordinates) — docs/media/screens/08-map.png]

[SCREENSHOT 10: lost strays, listed by street — docs/media/screens/10-strays-one-street.png]

[SCREENSHOT 11: the ghost hall — docs/media/screens/11-ghost-hall.png]

[SCREENSHOT 12: the adoption form — docs/media/screens/12-adoption-form.png]

[SCREENSHOT 13: the sync log — docs/media/screens/13-sync-log.png]

[SCREENSHOT 15: the public mirror of the Shelter Office, with live workflow state — docs/media/screens/15-office-mirror.png]

[SCREENSHOT: the Shelter Office App SDK app inside the Sanity Dashboard, approving a note — take this one yourself while signed in]

[SCREENSHOT 17 + 18 side by side: the phone layout — docs/media/screens/17-mobile-gallery.png, 18-mobile-pet-page.png]

**Testing the Shelter Office (App SDK, needs a Sanity login):** [TEST CREDENTIALS: email and password of a test account in the organization — or write "see the video"]

## Code

{% github syncaimain/pothole-shelter %}

A pnpm workspace: `studio/` (schema and desk structure), `web/` (Next.js 16 public site), `sync/` (311 → Sanity, with the
outcome rules and clustering), `workflows/` (definitions and bench tests), `app/` (the App SDK Shelter Office), `agent/`
(Gemini bio writer and fact guard) and `ingest/` (discovery, migrations, and every raw 311 snapshot with its SHA-256).
CI runs typecheck, lint, all tests, a snapshot checksum check, both builds, and the Playwright judge path with axe-core.

## My Build Process

**IDE and agent:** I built this with **Claude Code** (Claude Opus 5.5) in a terminal, driven by prompts and a written spec.
A second coordinating session sent guidance through `docs/GUIDANCE.md`, and the building agent reported back in
`docs/REPORT.md`. Both files are in the repo, unedited, along with the full log in `docs/BUILD_LOG.md`. The app itself
uses **Gemini** (`gemini-3.7-flash`) for bios.

### The prompt that set the tone

> Read the spec in full. Then, in order: verify the Gemini key with one cheap call (if it fails, stop and report); confirm
> every item marked "Verify" against current live docs; scaffold the pnpm workspace. Stop there and report before writing
> feature code.

"Stop and report" was the most useful instruction I gave. Several of the spec's own facts were wrong:

- **The Workflows package names were partly wrong.** The CLI binary is `sanity-workflows`, it needs
  `@sanity/workflow-blueprint`, and the test bench lives in `@sanity/workflow-engine-test`.
- **TypeScript had to be pinned to 6.0.3,** not the 7.0.2 that `latest` gave, nor the 5.x one guide suggested. It's the only
  version that satisfies both `typescript-eslint` (<6.1) and the Workflows blueprint (≥6.0.3).
- **Next.js 16 ships an `AGENTS.md` that says "This is NOT the Next.js you know"** — and it isn't. Caching is now
  `cacheComponents` + `'use cache'`. The first build failed because "Feral of the week" read the clock outside a cached scope.
- **Vercel's Hobby plan only allows daily crons,** so the hourly sync runs on GitHub Actions instead.

### Messy data, decided honestly

- **Scope:** Queens had ~17,000 street-pothole complaints in 180 days, plus ~8,800 still open. Rather than sample, I took
  **one community board in full**, so every pet is traceable and clustering sees complete data.
- **Missing coordinates:** 62% of complaints have no point. I chose not to geocode them, because that would invent
  precision the record doesn't have. They became the lost strays.
- **"Referred" resolutions** never sit on a closed ticket in CB 13; they're all Pending. The status rule stays in charge
  rather than a mapping overriding a ticket the city still lists as open.
- **Unclear resolution text:** "The status of this Service Request is currently not available online…" is the whole
  Unmapped bucket. It's shown publicly rather than guessed.
- **The median time to close is misleading.** It's 0.4 days overall because 366 duplicates closed within one minute of
  being filed. I quote the repair median (0.9 days) instead.
- **91% of located complaints have no `street_name`**: they're intersections, with only `intersection_street_1/2`. A
  clustering rule keyed on `street_name` would silently have skipped them. A test caught it.
- **"0 m apart" means "the same corner",** not "the same pothole": intersection complaints all share the intersection's
  point. The Shelter Office tells reviewers so.

### Where it got stuck, and how it course-corrected

- **Dotted document IDs.** The spec's own example (`complaint311.<key>`) would have hidden every document from judges,
  because Sanity never serves dotted IDs to anonymous readers. I switched to hyphens. Later I used the *same* behaviour on
  purpose: pending adoption notes get a dotted ID, so nothing a visitor types is public before a person approves it.
- **One document per status event put me over the plan's cap.** 4,992 event documents took the dataset to 10,022 of
  10,000. Events now live as an append-only array inside each pet. I migrated by **moving** every event verbatim,
  verified 4,992/4,992 in place, and only then deleted. The dataset fell to about 5,000 documents.
- **`$actor.kind == "person"` gated nothing.** The tests said people could approve, but they also said agents could. A
  probe showed the Workflows engine stamps *every* resolved actor as kind "person", robots included. What actually
  discriminates is the id namespace (`g…` user, `p-…` robot token). The bug stayed hidden because my test fixtures used
  fake ids that happened to look like robots.
- **I said "nothing was written" when something was.** A migration step was interrupted, the tool reported the call as
  rejected, and the agent told me nothing had been appended. It had. The agent found this itself on the next run and
  corrected the record. Lesson: check the data before stating what didn't happen.
- **Stopping a shell doesn't stop its process.** Two long backfills were cut off at a time limit, but their processes kept
  running and raced the re-runs, creating 183 duplicate workflow instances. The agent traced them by timestamp, added an
  optimistic-lock claim (`ifRevisionID`) so it can't recur, and **aborted** the duplicates through the engine with a
  recorded reason rather than deleting them.
- **Three different pets were all called "Arepa Asphaltine".** 800 base names for 2,512 pets. This was found by
  *reading* the first Gemini bios instead of trusting that they had passed the guard. Pets sharing a base name now take
  pedigree ordinals (II, III…) in complaint-key order, and a newer pet never renames an older one.
- **axe-core found a real accessibility bug:** on phones the sync tables scroll sideways, but the scroll region wasn't
  keyboard-focusable. Fixed, and now tested on every push.

### Reaching past the Studio: Workflows and the App SDK

**Workflows.** The spec asked for a 2-hour spike with a declared fallback. The spike **succeeded**, and nothing fell back.
Three definitions were validated offline and tested on the in-memory bench, including the 60-day Feral rule on a fixed
clock: still in the shelter one second before 60 days, feral at exactly 60. They're deployed from a `sanity login` session.
A project-scoped token deploys fine and then fails on a cross-resource read, exactly as the docs warn.

- `pothole-lifecycle`: Reported → In the shelter → Adopted · Ghost · Transferred · Feral · **Unmapped**. I added the
  Unmapped stage; without it, a closed-but-unmapped pet would wrongly turn feral by the clock. The sync (a robot token) is
  the only caller that can record an outcome, and it ticks the clock-based transitions itself. There's one live instance
  per open pet: 981 right now, matching the pets' outcomes exactly.
- `cluster-review`: Proposed → Approved · Rejected. The rule proposes, and a person decides in the Shelter Office. The sync
  merges only clusters whose decider is a person.
- `adoption-moderation`: Submitted → Approved · Rejected, decided by a person.

Two lessons the docs didn't spell out. Engine gates are **advisory**: the actor is "provenance, not an authenticated
principal", and mutation guards aren't enforced by the lake yet. So the real rules also live in code I control. And
instance documents are **private** (dotted IDs), so the public mirror reads workflow state through a server-side proxy that
publishes totals only.

**App SDK.** The **Shelter Office** is a custom app in the Sanity Dashboard, with real-time data and its own interface: live
queues to moderate adoption notes and review cluster merges, the unmapped phrases, sync health, and a live lifecycle board.
Approving a note fires the moderation workflow *as the signed-in person*. The engine records who decided from their
token, and only then is a public copy of the note written. Every Office view has a public read-only mirror at
[/office](https://pothole-shelter.vercel.app/office).

**Gemini, behind a fact guard.** `gemini-3.7-flash` (version `3.7-flash-08-2026`, recorded on every bio it writes)
restyles template bios into the shelter's voice. The guard accepted 65 of 65 in the sample run. Reasoning models eat
output tokens: a two-letter test reply used 80 reasoning tokens, so bios get a 4,096-token budget.

### What I cut

- **All of Queens.** One community board in full beat a sample of the whole borough.
- **Geocoding strays.** It would have put invented points on a map.
- **Filing new complaints.** Out of scope by design: this shelter only reflects the city's record.

### Known limitations

- **Resolution wording is inconsistent,** and five closed complaints say nothing useful. They stay Unmapped until a person decides.
- **Clustering is a heuristic** (60 m / 30 days / same street; strays by same block). That's why every merge needs a person.
- **311 dates have no time zone.** I read them as New York local time. The data is consistent with that, but it's an assumption.
- **GitHub Actions scheduled runs are best-effort and can be delayed.** The [sync log](https://pothole-shelter.vercel.app/sync)
  shows real run times, never the schedule.
  [CHECK BEFORE PUBLISHING: confirm the hourly schedule has started firing; if not, reword this section and the hourly claim above.]

### Why it's new

Most civic-data projects turn records into dashboards. This one turns them into characters, and lets the data's gaps play
the parts: the complaints with no coordinates become lost strays, the ones the city looked for and couldn't find become
ghosts, and the backlog becomes a feral wing that's still waiting. Every fate is the city's own, and every step can be
traced back to a real record.

## Sanity Project Details

- **Project ID:** `fixjy07h` · **dataset:** `production` (public-read, no token needed)
- **Public query:** https://fixjy07h.api.sanity.io/v2025-02-19/data/query/production?query=*[_type=="pothole"][0...5]

**Schema, and why raw records and pet fields are kept apart:**

| Type | What it holds |
| --- | --- |
| `complaint311` | The 311 row **exactly as published** (`raw`), its SHA-256, and the source row URL. Rewritten only when the hash changes. |
| `pothole` | The pet: name, temperament, bio (with its model and fact-guard provenance), rounded location, outcome (written only by the sync), its lifecycle workflow instance, and `events`, an append-only history where every entry cites the complaint field that caused it. |
| `resolutionMapping` | One exact city phrase → outcome, with a person's rationale. |
| `clusterDecision` | A proposed merge, with its review workflow and the person who decided. |
| `adoption` | A visitor's note: private while pending, public only once a person approves it. |
| `syncRun` | Every sync: counts, watermark, and the SHA-256 of each raw page it saved. |

Keeping the city's record and my interpretation in separate documents means anyone can check any pet against the 311 row
it came from, and a re-sync can never overwrite a decision a person made.

**Data:** [311 Service Requests from 2020 to Present](https://data.cityofnewyork.us/Social-Services/311-Service-Requests-from-2020-to-Present/erm2-nwe9),
NYC Open Data, dataset `erm2-nwe9`. The City of New York does not vouch for the accuracy or completeness of this site or
the data it uses, which has been modified for use from its original source.
[CHECK BEFORE PUBLISHING: confirm this disclaimer wording against the current NYC Open Data terms in a browser]

## Agent Session

[AGENT SESSION: upload the Claude Code transcript at https://dev.to/agent_sessions/new, slice the parts worth showing
(suggested: the "Verify" pass, the document-cap migration, the `$actor.kind` probe, the "nothing was written"
retraction), set it to **Make Public**, and embed it here. Scan it for keys first: token values were only ever read from
`.env.local` inside commands, never printed, but check anyway.]

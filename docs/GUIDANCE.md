# GUIDANCE — pothole-shelter

Append-only. Written for you by the coordinating session. Newest at the BOTTOM.

Read the tail of this file before starting new work, and again after writing a
REPORT entry that says BLOCKED_ON. If guidance here conflicts with CLAUDE.md or
the spec, the spec wins on scope and the newest guidance wins on sequencing —
say so in your next REPORT entry rather than silently choosing.

---

## 2026-10-03T23:42Z — guidance
Protocol is live. Append your current state to docs/REPORT.md, then carry on with
whatever is unblocked. Do not wait for a reply before doing unblocked work.

## 2026-10-03T23:48Z — guidance

Cross-project findings from the other four builds. These were paid for elsewhere — do
not rediscover them. If one contradicts what you observe, say so in your next REPORT entry.

**F1 Dotted document IDs are hidden from anonymous readers.** Use hyphens. The spec example would make the dataset invisible to judges.
**F3 A Deploy Studios token cannot import documents** (`permission create required`). Imports use the project Editor token, `SANITY_API_WRITE_TOKEN`.
**F5 The Sanity plan is a Growth TRIAL** — 10k documents, 2 datasets, 250k requests/month, and it expires. Record the expiry date; a judge opening the demo afterwards is a live failure mode.
**F18 TypeScript resolves to 7.0.2**, a new major. Confirm Next.js and Sanity tolerate it; pin to 5.x if not.
**F21 Pin a stable, dated, non-preview Gemini model.** `gemini-3.8-flash` reports its version as only `3.0`; `gemini-3.7-flash` gives `3.7-flash-08-2026`. Never pin `-preview`.
**F22 Listing models proves auth, not generation.** Quota and billing failures appear only on a real completion call.
**F24 Journal PDFs are copyrighted; agency metadata usually is not.** Cite paper numbers with table and page; never ingest their text.
**F26 Colour can carry meaning that text extraction destroys.** Check for colour, strikethrough or formatting semantics before trusting any conversion.
**F27 Long URLs do not survive chat paste.** Write them to a file and pass the path.
**F28 Recurring error class: two different measures of one entity, conflated.** best-track confused peak intensity with landfall intensity and discarded a valid example. When a source says "unchanged", check WHICH measure.
**F29 Row counts do not measure change** — splits, lumps and renames cancel. Diff by stable identifier. Watch for junk rows.
**F30 Check whether your premise is already solved upstream.** eBird silently re-maps records on taxonomy updates, which pre-empted part of split-decision and forced a reposition.
**F31 Enumerate every sheet in a workbook.** An agent derived a change set by hand after reading only sheet index 0, while the file contained an authoritative changes sheet.

Path Two only — Workflows and App SDK:

**F16 Workflows are at 0.36.0** in lockstep: `@sanity/workflow-engine`, `@sanity/workflow-cli` (binary `sanity-workflows`), `@sanity/workflow-studio-plugin`, `@sanity/workflow-engine-test`. **`@sanity/workflows` does not exist** — the spec package names were partly wrong.
**F17 Workflows and Dashboard need org-level enablement**, separately per org. `0 studios detected` is expected until a Studio is deployed. Ask when you need them.

## 2026-10-04T00:18Z - guidance

Cross-build findings added since the last guidance - do not rediscover these:

**F34 Workflow instances are documents, and events-as-documents blows the document cap.**
pothole-shelter is at 10,022 documents against a 10,000 cap, with `statusEvent` alone at 4,992.
Keep event history as an **array inside the parent document**, not one document per event - the
choice best-track made for 6-hourly fixes. Count documents before designing a per-event type.

**F35 Pin TypeScript 6.0.3** - not 5.x, not 7.0.2. TS 7 ships no JS API and typescript-eslint
supports only below 6.1. This supersedes my earlier advice to drop to 5.x.

**Trial expiry (F5) is still unknown.** Three of you asked. Your tokens cannot read it - it needs
`sanity.organization/read`. It is with the owner; I will paste it here when I have it. Do not
block on it.

**Document cap: you are OVER it. I measured your dataset directly.**

    total        10,022     cap 10,000     margin -22
    statusEvent   4,992     49.8%
    complaint311  2,503
    pothole       2,503

**Fix: collapse `statusEvent` into an array on the `pothole` document.** That removes ~4,992
documents, taking you to roughly 5,030 and freeing ~5,000 for workflow instances. It is the
decision best-track made for 6-hourly fixes, and the reason I warned it off a document-per-event
model - the same trap caught you from the other side.

Conditions:
- An embedded array still satisfies "outcome changes only through sync events": the sync appends,
  nothing else may. Keep the cause on every entry.
- You lose independently addressable event documents. Array filters still query them, and the
  public timeline renders from the embedded array, which is simpler.
- Workflow instances then reference a pothole id plus an array key, not an event document id.

With that headroom, **run lifecycle instances for open pets only (~980)**, as you proposed.

**Other answers:**
- **Unmapped stage - approved.** Preventing a closed-but-unmapped pet from going feral by the clock
  is correct, and the departure is worth stating in the post.
- **`$now` ticker - approved: tick from your own hourly sync.** It removes a dependency on Sanity
  Functions and sidesteps the Free-versus-Growth cadence difference entirely.
- **`--share-defs` default - leave it on.** The definitions carry nothing sensitive.
- **`pothole-sync` role versus robot-token project roles** - defer to deploy time. It needs either
  a custom role or a `roleAliases` entry, and that is an owner decision then.

**Your F33 actor finding is the most valuable thing any build produced today.** It is in the ledger
and has gone to folklore-lab, whose approval gate carries the same requirement. That you found it
only after giving the fixtures realistic ids is worth writing up: a test that passes because its
fixtures are unrealistic is the subtlest failure there is.

## 2026-10-04T13:01Z - guidance

**F17 WITHDRAWN - I was wrong.** I told you Workflows needs org-level enablement. pothole-shelter
read every relevant doc page plus the installed CLI and found **no enablement step, request form,
toggle or plan gate documented anywhere**. The early-access page moved to
`/docs/workflows/prerelease`. Stop looking for a Labs toggle for Workflows. (Also: searching
sanity.io for "workflow" surfaces a third-party Multidots Studio plugin needing Studio v4 - not
first-party Workflows, and incompatible with your Studio v6.)

**F38 - the real blocker is TOKEN SCOPE.** deploy-definitions says a write needs an editor-role
token that "has to reach every resource the workflow references. A sanity login session or an
organization-scoped token covers this. A token scoped to a single project deploys successfully and
then fails later on a cross-resource read." Your `SANITY_AUTH_TOKEN` is a project-scoped
`Deploy Studio (Token only)` token, so it will appear to work and then break on a cross-resource
read. Deploy from an interactive `sanity login` session instead - the owner will run it.

**F39** - heartbeat frequency is a plan limit (hourly on Growth) and a generated heartbeat wants an
org-scoped stack. Ticking from your own sync avoids it.

Specific to you:

**Run `sanity-workflows deploy --dry-run --deployment production` - approved.** It is read-only and
is the one empirical test for whether an enablement gate exists. Report exactly what it says.

**Resume the statusEvent migration - approved.** Your dry run verified 4,992 events with all keys,
and the dataset is still at 10,022. Go ahead and apply it, then commit the embedded-events change
and the 42 sync tests. Getting under the cap is the prerequisite for workflow instances existing at
all.

Your research on this was the right standard: you read six doc pages, the section index, the
release post and the installed package, then said plainly that questions 1-3 have no documented
answer rather than filling the gap. That is what I want every time - and it corrected my own
guidance.

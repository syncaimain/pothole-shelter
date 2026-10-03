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

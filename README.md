# Pothole Adoption Agency

[![CI](https://github.com/syncaimain/pothole-shelter/actions/workflows/ci.yml/badge.svg)](https://github.com/syncaimain/pothole-shelter/actions/workflows/ci.yml)
[![311 sync](https://github.com/syncaimain/pothole-shelter/actions/workflows/sync.yml/badge.svg)](https://github.com/syncaimain/pothole-shelter/actions/workflows/sync.yml)

Real NYC 311 pothole complaints from Queens Community Board 13, turned into adoptable pets whose fates follow the city's
own record: repaired, "no pothole found", transferred, or still waiting. Built for the Sanity Challenge on DEV, Path Two.

- **Live site:** https://pothole-shelter.vercel.app (no login)
- **Sanity project ID:** `fixjy07h`, dataset `production`, public-read. Example queries are in [docs/links/public-queries.txt](docs/links/public-queries.txt).
- **Build log** (the honest version): [docs/BUILD_LOG.md](docs/BUILD_LOG.md)

## What a judge can check

1. Open the gallery and click a Feral pet.
2. Read its complaint history and follow a link to the real 311 record on NYC Open Data.
3. Open `/strays` (complaints with no coordinates) and `/ghosts` (inspected, no defect found).
4. Open `/sync` for the last sync time, the run log, and the unmapped resolution phrases.

## Numbers (live dataset, 4 October 2026)

| | |
| --- | --- |
| Complaints synced | 2,512 (every Queens CB 13 street pothole from the last 180 days, plus every one still open) |
| Lost strays (no coordinates) | 1,555 (62%) |
| Outcomes | 668 adopted · 409 ghosts · 449 transferred · 963 feral · 18 in the shelter · 5 unmapped |
| Median days from report to repair | 0.9 (653 repaired complaints, snapshot of 3 October) |
| Second sync over the same data | 0 created · 0 updated · 0 status events |
| Tests | 65 (sync 42 · workflows 20 · ingest 3), run in CI on every push |

Current figures are always on the site's `/sync` page.

## How it works

- **The city record decides.** Deterministic code maps each 311 record to an outcome. Closed complaints are matched
  exactly against `resolutionMapping` documents that a person wrote; wording nobody has mapped goes to a public
  Unmapped bucket instead of being guessed. Open complaints turn feral after 60 days.
- **Raw records stay untouched.** `complaint311.raw` is the Socrata row as published, rewritten only when its SHA-256
  changes. Pet fields live on `pothole`, and every outcome change is appended to the pet's `events` with the complaint
  field that caused it.
- **Hourly sync** on GitHub Actions (Vercel Hobby crons are daily-only). It fetches only records changed since the last
  run and saves every raw page with its retrieval time and checksum under `ingest/data/raw/`.
- **Workflows:** `pothole-lifecycle`, `cluster-review` and `adoption-moderation` are deployed with the Sanity Workflows
  engine (0.36.0) and tested on its in-memory bench. Engine gates are advisory, so the server enforces who may act.
- **Cached fallback:** if Sanity is unreachable, every page answers from a committed snapshot and says so on the page.

## Repository

```
studio/      Sanity Studio: schema, read-only rules, desk structure
web/         Next.js 16 public site
sync/        SODA client, outcome mapping, status events, clustering, syncRun (+ tests)
workflows/   Workflow definitions and bench tests
ingest/      Resolution discovery, mapping seeds, migrations, raw snapshots
app/         App SDK Shelter Office (in progress)
agent/       Bio writer and cluster proposer (in progress)
docs/        BUILD_LOG.md, REPORT.md, GUIDANCE.md
```

## Run it locally

Requires Node 22.12+ and pnpm.

```bash
pnpm install
pnpm -r test
pnpm dev:web      # http://localhost:3004
pnpm dev:studio   # http://localhost:3337
```

The sync (`pnpm --filter @pothole/sync sync`) needs `SANITY_API_WRITE_TOKEN` and `SOCRATA_APP_TOKEN` in `.env.local`;
see `.env.local.example`. The public site needs no secrets.

## Data and terms

Data: [311 Service Requests from 2020 to Present](https://data.cityofnewyork.us/Social-Services/311-Service-Requests-from-2020-to-Present/erm2-nwe9),
NYC Open Data (dataset `erm2-nwe9`). The City of New York does not vouch for the accuracy or completeness of this
site or the data it uses, which has been modified for use from its original source. Locations are rounded to about
100 m and house numbers are never shown.

Everyone who reports a pothole and everyone who fixes one is doing the city a favour. The jokes are about the potholes.

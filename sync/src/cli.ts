// Usage: pnpm --filter @pothole/sync sync [--full]
// Reads SANITY_API_WRITE_TOKEN and SOCRATA_APP_TOKEN from the environment (.env.local locally,
// repository secrets in CI). Exits non-zero when the run fails, so schedulers notice.
import {fileURLToPath} from 'node:url'
import {reconcileLifecycles} from './lifecycleRun.ts'
import {fileSnapshotter, runSync} from './run.ts'
import {SanityStore, sanityWriteClient} from './sanityStore.ts'

const token = process.env.SANITY_API_WRITE_TOKEN
if (!token) {
  console.error('SANITY_API_WRITE_TOKEN is not set')
  process.exit(2)
}

// Each engine operation makes several sequential requests (~7 per minute observed), so an
// hourly run does at most this many; a backlog drains over successive runs.
const LIFECYCLE_OPS_PER_RUN = 40

const snapshotDir = fileURLToPath(new URL('../../ingest/data/raw/', import.meta.url))
const client = sanityWriteClient(token)
const run = await runSync({
  store: new SanityStore(client),
  appToken: process.env.SOCRATA_APP_TOKEN,
  snapshot: fileSnapshotter(snapshotDir),
  full: process.argv.includes('--full'),
})

// Keep the workflow instances in step with the outcomes this run wrote. A lifecycle failure
// never fails the sync: the data is already correct; the engine catches up next run.
const lifecycles = run.state === 'succeeded' ? await reconcileLifecycles(client, {limit: LIFECYCLE_OPS_PER_RUN}) : undefined

const {snapshots, ...summary} = run
console.log(JSON.stringify({...summary, snapshotPages: snapshots?.length ?? 0, lifecycles}, null, 2))
process.exit(run.state === 'succeeded' ? 0 : 1)

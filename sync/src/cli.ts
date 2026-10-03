// Usage: pnpm --filter @pothole/sync sync [--full]
// Reads SANITY_API_WRITE_TOKEN and SOCRATA_APP_TOKEN from the environment (.env.local locally,
// repository secrets in CI). Exits non-zero when the run fails, so schedulers notice.
import {fileURLToPath} from 'node:url'
import {fileSnapshotter, runSync} from './run.ts'
import {SanityStore, sanityWriteClient} from './sanityStore.ts'

const token = process.env.SANITY_API_WRITE_TOKEN
if (!token) {
  console.error('SANITY_API_WRITE_TOKEN is not set')
  process.exit(2)
}

const snapshotDir = fileURLToPath(new URL('../../ingest/data/raw/', import.meta.url))
const run = await runSync({
  store: new SanityStore(sanityWriteClient(token)),
  appToken: process.env.SOCRATA_APP_TOKEN,
  snapshot: fileSnapshotter(snapshotDir),
  full: process.argv.includes('--full'),
})

const {snapshots, ...summary} = run
console.log(JSON.stringify({...summary, snapshotPages: snapshots?.length ?? 0}, null, 2))
process.exit(run.state === 'succeeded' ? 0 : 1)

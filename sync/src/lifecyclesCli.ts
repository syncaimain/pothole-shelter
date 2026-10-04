// Usage: pnpm --filter @pothole/sync lifecycles [--limit N]
// Brings workflow instances in step with pet outcomes without running a full sync
// (used once to bootstrap instances for every open pet).
import {reconcileLifecycles} from './lifecycleRun.ts'
import {sanityWriteClient} from './sanityStore.ts'

const token = process.env.SANITY_API_WRITE_TOKEN
if (!token) throw new Error('SANITY_API_WRITE_TOKEN is not set')
const i = process.argv.indexOf('--limit')
const limit = i > 0 ? Number(process.argv[i + 1]) : undefined
const started = Date.now()
const report = await reconcileLifecycles(sanityWriteClient(token), {limit, concurrency: 4})
console.log(JSON.stringify({...report, seconds: Math.round((Date.now() - started) / 1000)}, null, 2))

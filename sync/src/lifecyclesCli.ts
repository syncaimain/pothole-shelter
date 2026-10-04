// Usage: pnpm --filter @pothole/sync lifecycles [--limit N] [--concurrency N]
// Brings workflow instances in step with pet outcomes without running a full sync
// (used once to bootstrap instances for every open pet).
import {reconcileLifecycles} from './lifecycleRun.ts'
import {sanityWriteClient} from './sanityStore.ts'

const token = process.env.SANITY_API_WRITE_TOKEN
if (!token) throw new Error('SANITY_API_WRITE_TOKEN is not set')
const i = process.argv.indexOf('--limit')
const limit = i > 0 ? Number(process.argv[i + 1]) : undefined
const started = Date.now()
const c = process.argv.indexOf('--concurrency')
const concurrency = c > 0 ? Number(process.argv[c + 1]) : 4
const report = await reconcileLifecycles(sanityWriteClient(token), {limit, concurrency})
console.log(JSON.stringify({...report, seconds: Math.round((Date.now() - started) / 1000)}, null, 2))

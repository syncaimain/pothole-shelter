import {randomBytes} from 'node:crypto'
import {mkdir, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {isEmptyPlan, planSync} from './plan.ts'
import {fetchPages, fullWhere, incrementalWhere, type FetchedPage} from './soda.ts'
import {runCounts, type SnapshotPageRef, type SyncRunDoc, type SyncStore} from './store.ts'

/** Saves a fetched page exactly as received; returns where it went. */
export type Snapshotter = (runId: string, page: FetchedPage) => Promise<string>

/** Writes `<dir>/<runId>/page-0001.json` plus a manifest with the retrieval time and SHA-256 of each page. */
export function fileSnapshotter(dir: string): Snapshotter & {finish(runId: string, pages: SnapshotPageRef[], meta: object): Promise<void>} {
  const snap = async (runId: string, page: FetchedPage) => {
    const folder = join(dir, runId)
    await mkdir(folder, {recursive: true})
    const name = `page-${String(page.index + 1).padStart(4, '0')}.json`
    await writeFile(join(folder, name), page.text, 'utf8')
    return `${runId}/${name}`
  }
  snap.finish = async (runId: string, pages: SnapshotPageRef[], meta: object) => {
    await mkdir(join(dir, runId), {recursive: true})
    await writeFile(join(dir, runId, 'manifest.json'), JSON.stringify({runId, ...meta, pages}, null, 2) + '\n', 'utf8')
  }
  return snap
}

export interface RunOptions {
  store: SyncStore
  appToken?: string
  fetchImpl?: typeof fetch
  clock?: () => Date
  snapshot?: ReturnType<typeof fileSnapshotter>
  /** Force a full refetch even when a watermark exists. */
  full?: boolean
  sleep?: (ms: number) => Promise<void>
}

// The random suffix keeps two runs started in the same second (a manual run overlapping the
// scheduled one) from overwriting each other's record. Nothing derived depends on the run ID.
export const runIdFor = (d: Date) =>
  `syncRun-${d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-${randomBytes(3).toString('hex')}`

/**
 * One sync. A failure anywhere leaves the last good data in place and records a failed
 * syncRun with the reason, which the site turns into the stale-data banner.
 */
export async function runSync(opts: RunOptions): Promise<SyncRunDoc> {
  const clock = opts.clock ?? (() => new Date())
  const started = clock()
  const run: SyncRunDoc = {_id: runIdFor(started), _type: 'syncRun', startedAt: started.toISOString(), state: 'running', mode: 'full'}
  await opts.store.saveRun(run)

  try {
    const state = await opts.store.loadState()
    run.mode = state.watermark && !opts.full ? 'incremental' : 'full'
    const where = run.mode === 'incremental' ? incrementalWhere(state.watermark!) : fullWhere(started)

    const pages: FetchedPage[] = []
    const snapshots: SnapshotPageRef[] = []
    for await (const page of fetchPages({where, appToken: opts.appToken, fetchImpl: opts.fetchImpl, clock, sleep: opts.sleep})) {
      pages.push(page)
      const file = opts.snapshot ? await opts.snapshot(run._id, page) : `(not saved) page ${page.index + 1}`
      snapshots.push({_key: `p${page.index + 1}`, file, sha256: page.sha256, rows: page.rows.length, retrievedAt: page.retrievedAt})
    }
    await opts.snapshot?.finish(run._id, snapshots, {mode: run.mode, where, dataset: 'erm2-nwe9'})

    const plan = planSync({state, rows: pages.flatMap((p) => p.rows), now: started, runId: run._id})
    if (!isEmptyPlan(plan)) await opts.store.apply(plan)

    Object.assign(run, runCounts(plan.counts), {
      state: 'succeeded',
      finishedAt: clock().toISOString(),
      watermark: plan.watermark,
      failed: 0,
      snapshots,
    })
  } catch (err) {
    Object.assign(run, {state: 'failed', finishedAt: clock().toISOString(), error: err instanceof Error ? err.message : String(err), failed: 1})
  }
  await opts.store.saveRun(run)
  return run
}

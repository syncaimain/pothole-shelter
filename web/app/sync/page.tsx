import Link from 'next/link'
import {Suspense} from 'react'
import {getMappings, getSyncStatus} from '@/lib/data'
import {dateTime, outcomeTitle, plural} from '@/lib/format'
import {SnapshotNotice} from '../components'

export const metadata = {title: 'Sync log'}

export default function SyncPage() {
  return (
    <>
      <h1>Sync log</h1>
      <p className="lede">
        The shelter syncs with NYC 311 and records every run here. A pet&rsquo;s outcome only changes when a sync sees the city record
        change, or when a complaint passes 60 days open.
      </p>
      <Suspense fallback={<p className="muted">Reading the run log…</p>}>
        <Runs />
      </Suspense>
      <Suspense fallback={<p className="muted">Reading the mappings…</p>}>
        <Mappings />
      </Suspense>
    </>
  )
}

async function Runs() {
  const loaded = await getSyncStatus()
  const {runs, lastGood, latest} = loaded.data
  return (
    <section aria-labelledby="runs">
      <SnapshotNotice loaded={loaded} />
      <p>
        Last successful sync: <strong>{dateTime(lastGood?.finishedAt)}</strong>
        {latest?.state === 'failed' && (
          <>
            {' '}
            · <strong>latest run failed</strong>: {latest.error}
          </>
        )}
      </p>
      <h2 id="runs">Recent runs</h2>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Recent sync runs (scrolls sideways)">
        <table>
          <thead>
            <tr>
              <th scope="col">Started</th>
              <th scope="col">Result</th>
              <th scope="col">Mode</th>
              <th scope="col">Fetched</th>
              <th scope="col">New</th>
              <th scope="col">Changed</th>
              <th scope="col">Unchanged</th>
              <th scope="col">Status events</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r._id}>
                <td>{dateTime(r.startedAt)}</td>
                <td>
                  {r.state}
                  {r.error && <div className="small muted">{r.error}</div>}
                </td>
                <td>{r.mode ?? '—'}</td>
                <td>{r.fetched ?? '—'}</td>
                <td>{r.created ?? '—'}</td>
                <td>{r.updated ?? '—'}</td>
                <td>{r.unchanged ?? '—'}</td>
                <td>{r.statusEvents ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">
        A run that changes nothing is the goal: syncing the same city data twice must give zero changes.
      </p>
    </section>
  )
}

async function Mappings() {
  const loaded = await getMappings()
  const {mappings, unmapped} = loaded.data
  return (
    <>
      <section aria-labelledby="unmapped">
        <h2 id="unmapped">Unmapped phrases</h2>
        <p>
          Closed complaints whose resolution wording no mapping covers yet. We show them rather than guess what they mean.
        </p>
        {unmapped.length === 0 ? (
          <p>None right now.</p>
        ) : (
          unmapped.map((u) => (
            <details key={u.phrase}>
              <summary>
                {plural(u.pets.length, 'pet')}: <q>{u.phrase}</q>
              </summary>
              <ul>
                {u.pets.map((p) => (
                  <li key={p.slug}>
                    <Link href={`/pothole/${p.slug}`}>{p.name}</Link>
                  </li>
                ))}
              </ul>
            </details>
          ))
        )}
      </section>
      <section aria-labelledby="mappings">
        <h2 id="mappings">Resolution mappings</h2>
        <p>Each closed complaint&rsquo;s resolution text is matched exactly against these documents. A person wrote every one.</p>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Resolution mappings (scrolls sideways)">
          <table>
            <thead>
              <tr>
                <th scope="col">City wording</th>
                <th scope="col">Outcome</th>
                <th scope="col">Why</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((m) => (
                <tr key={m.pattern}>
                  <td>{m.pattern}</td>
                  <td>{outcomeTitle(m.outcome)}</td>
                  <td className="small">{m.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

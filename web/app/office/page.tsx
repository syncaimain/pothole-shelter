import Link from 'next/link'
import {Suspense} from 'react'
import {OUTCOMES} from '@pothole/sync/domain'
import {getMappings, getOffice, getStats, getSyncStatus} from '@/lib/data'
import {dateTime, outcomeTitle, plural} from '@/lib/format'
import {OutcomeBadge, SnapshotNotice} from '../components'

export const metadata = {title: 'Shelter Office (public mirror)'}

export default function OfficePage() {
  return (
    <>
      <h1>Shelter Office</h1>
      <p className="lede">
        A read-only mirror of the staff Shelter Office, which runs inside the Sanity Dashboard and needs a login. Everything staff see
        here is public, except the text of adoption notes that a person has not approved yet.
      </p>
      <Suspense fallback={<p className="muted">Opening the office…</p>}>
        <Office />
      </Suspense>
    </>
  )
}

async function Office() {
  const [office, stats, sync, maps] = await Promise.all([getOffice(), getStats(), getSyncStatus(), getMappings()])
  const unmappedPets = maps.data.unmapped.reduce((n, u) => n + u.pets.length, 0)
  return (
    <>
      <SnapshotNotice loaded={office} />
      <section aria-labelledby="queues">
        <h2 id="queues">Queues</h2>
        <ul>
          <li>
            <strong>Cluster review:</strong> {plural(office.data.proposedClusters, 'proposal')} awaiting a person. Merges only happen
            after a person approves them.
          </li>
          <li>
            <strong>Adoption moderation:</strong> {plural(office.data.submittedAdoptions, 'note')} awaiting a person. Note text stays
            hidden until approved.
          </li>
          <li>
            <strong>Unmapped resolution phrases:</strong> {plural(maps.data.unmapped.length, 'phrase')} across {plural(unmappedPets, 'pet')}.{' '}
            <Link href="/sync#unmapped">See them</Link>
          </li>
        </ul>
      </section>

      <section aria-labelledby="health">
        <h2 id="health">Sync health</h2>
        <p>
          Last successful sync {dateTime(sync.data.lastGood?.finishedAt)}; latest run{' '}
          <strong>{sync.data.latest?.state ?? 'none recorded'}</strong>. <Link href="/sync">Full run log</Link>
        </p>
      </section>

      <section aria-labelledby="board">
        <h2 id="board">Lifecycle board</h2>
        <ul className="stats" role="list">
          {OUTCOMES.map((o) => (
            <li key={o.value}>
              <strong>{stats.data.byOutcome[o.value].toLocaleString('en-US')}</strong> {o.title.toLowerCase()}
            </li>
          ))}
        </ul>
        <h3>Latest changes</h3>
        <ol>
          {office.data.recentChanges.map((c) => (
            <li key={`${c.slug}-${c.at}`}>
              <Link href={`/pothole/${c.slug}`}>{c.name}</Link>: <OutcomeBadge outcome={c.from} /> → <OutcomeBadge outcome={c.to} />{' '}
              <span className="muted small">
                {dateTime(c.at)} · {c.kind === 'timeRule' ? '60-day rule' : c.kind === 'mappingChange' ? 'mapping added' : 'city record changed'}
              </span>
            </li>
          ))}
        </ol>
        <p className="small muted">Outcomes shown: {OUTCOMES.map((o) => outcomeTitle(o.value)).join(', ')}.</p>
      </section>
    </>
  )
}

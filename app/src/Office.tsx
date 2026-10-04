import {OUTCOMES} from '@pothole/sync/domain'
import {useClient, useCurrentUser, useQuery} from '@sanity/sdk-react'
import {useState, type CSSProperties} from 'react'
import {decide, decideCluster, type PendingAdoption, type ProposedCluster} from './moderation'

const PUBLIC_SITE = 'https://pothole-shelter.vercel.app'

const page: CSSProperties = {fontFamily: 'system-ui, sans-serif', lineHeight: 1.5, maxWidth: 1100, margin: '0 auto', padding: '24px 16px'}
const card: CSSProperties = {border: '1px solid #ddd', borderRadius: 8, padding: '12px 16px', margin: '8px 0'}
const grid: CSSProperties = {display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))'}

export function Office() {
  const user = useCurrentUser()
  return (
    <main style={page}>
      <h1 style={{marginBottom: 4}}>Shelter Office</h1>
      <p style={{marginTop: 0, color: '#555'}}>
        Signed in as {user?.name ?? 'staff'}. Everything here is live. A read-only public mirror is at{' '}
        <a href={`${PUBLIC_SITE}/office`} target="_blank" rel="noreferrer">
          /office
        </a>
        .
      </p>
      <AdoptionQueue />
      <div style={grid}>
        <ClusterQueue />
        <UnmappedQueue />
      </div>
      <div style={grid}>
        <SyncHealth />
        <LifecycleBoard />
      </div>
    </main>
  )
}

function AdoptionQueue() {
  const client = useClient({apiVersion: '2025-02-19'})
  const {data, isPending} = useQuery<string>({
    query: `*[_type == "adoption" && _id in path("pending.**") && moderation == "submitted"] | order(createdAt asc)[0...50]{
      _id, displayName, message, createdAt, moderation, workflowInstance, workflowError, pothole,
      "petName": pothole->name, "petSlug": pothole->slug.current}`,
    perspective: 'raw',
  })
  const items = (data ?? []) as unknown as PendingAdoption[]
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()

  async function act(item: PendingAdoption, action: 'approve' | 'reject') {
    setBusy(item._id)
    setError(undefined)
    try {
      await decide(client, item, action)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <section aria-labelledby="adoptions">
      <h2 id="adoptions">Adoption notes awaiting moderation {isPending ? '' : `(${items.length})`}</h2>
      <p style={{color: '#555', marginTop: 0}}>Notes stay private until you approve them. Approving publishes the note on the pet&rsquo;s page.</p>
      {error && (
        <p role="alert" style={{color: '#b3261e', fontWeight: 600}}>
          {error}
        </p>
      )}
      {items.length === 0 && !isPending && <p>Nothing waiting.</p>}
      {items.map((a) => (
        <article key={a._id} style={card}>
          <p style={{margin: 0}}>
            <strong>{a.displayName}</strong> → {a.petSlug ? <a href={`${PUBLIC_SITE}/pothole/${a.petSlug}`}>{a.petName}</a> : 'a pet'}
            <span style={{color: '#666'}}> · {new Date(a.createdAt).toLocaleString()}</span>
          </p>
          <blockquote style={{margin: '8px 0', paddingLeft: 12, borderLeft: '3px solid #ddd'}}>{a.message}</blockquote>
          {a.workflowError && <p style={{color: '#b3261e'}}>Workflow did not start: {a.workflowError}</p>}
          <button onClick={() => act(a, 'approve')} disabled={busy === a._id}>
            Approve
          </button>{' '}
          <button onClick={() => act(a, 'reject')} disabled={busy === a._id}>
            Reject
          </button>
        </article>
      ))}
    </section>
  )
}

function ClusterQueue() {
  const client = useClient({apiVersion: '2025-02-19'})
  const {data} = useQuery<string>({
    query: `{"count": count(*[_type == "clusterDecision" && decision == "proposed"]),
      "items": *[_type == "clusterDecision" && decision == "proposed"] | order(count(complaints) desc, _id asc)[0...15]{_id, reason, distanceMetres, daysApart, workflowInstance}}`,
  })
  const d = (data ?? {count: 0, items: []}) as unknown as {count: number; items: ProposedCluster[]}
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()
  async function act(item: ProposedCluster, action: 'approve' | 'reject') {
    setBusy(item._id)
    setError(undefined)
    try {
      await decideCluster(client, item, action)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(undefined)
    }
  }
  return (
    <section aria-labelledby="clusters">
      <h2 id="clusters">Cluster review ({d.count})</h2>
      <p style={{color: '#555', marginTop: 0}}>
        Merges proposed by the rule (60 m, 30 days, same street; strays by same block). Nothing merges until you approve. Note:
        intersection complaints share one point, so &ldquo;0 m&rdquo; means the same corner, not proof of one pothole.
      </p>
      {error && (
        <p role="alert" style={{color: '#b3261e', fontWeight: 600}}>
          {error}
        </p>
      )}
      {d.items.map((c) => (
        <article key={c._id} style={card}>
          <p style={{marginTop: 0}}>{c.reason}</p>
          <button onClick={() => act(c, 'approve')} disabled={busy === c._id}>
            Approve merge
          </button>{' '}
          <button onClick={() => act(c, 'reject')} disabled={busy === c._id}>
            Reject
          </button>
        </article>
      ))}
      {d.count === 0 && <p>No proposals waiting.</p>}
    </section>
  )
}

function UnmappedQueue() {
  const {data} = useQuery<string>({
    query: `*[_type == "pothole" && outcome == "unmapped"]{name, "phrases": complaints[]->raw.resolution_description}`,
  })
  const rows = (data ?? []) as unknown as {name: string; phrases: string[]}[]
  const phrases = new Map<string, number>()
  for (const r of rows) for (const p of new Set(r.phrases)) phrases.set(p, (phrases.get(p) ?? 0) + 1)
  return (
    <section aria-labelledby="unmapped">
      <h2 id="unmapped">Unmapped phrases ({phrases.size})</h2>
      <p style={{color: '#555', marginTop: 0}}>Add a resolution mapping in the Studio to give these pets an outcome.</p>
      {[...phrases].map(([p, n]) => (
        <p key={p} style={card}>
          <strong>{n} pets:</strong> {p}
        </p>
      ))}
    </section>
  )
}

function SyncHealth() {
  const {data} = useQuery<string>({
    query: `*[_type == "syncRun"] | order(startedAt desc)[0...8]{_id, startedAt, state, mode, fetched, created, updated, statusEvents, error}`,
  })
  const runs = (data ?? []) as unknown as {_id: string; startedAt: string; state: string; mode?: string; fetched?: number; created?: number; updated?: number; statusEvents?: number; error?: string}[]
  return (
    <section aria-labelledby="health">
      <h2 id="health">Sync health</h2>
      <table style={{width: '100%', borderCollapse: 'collapse', fontSize: 14}}>
        <thead>
          <tr>
            {['Started', 'Result', 'Fetched', 'New', 'Changed', 'Events'].map((h) => (
              <th key={h} style={{textAlign: 'left', borderBottom: '1px solid #ddd'}} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r._id}>
              <td>{new Date(r.startedAt).toLocaleString()}</td>
              <td title={r.error}>{r.state}</td>
              <td>{r.fetched ?? '—'}</td>
              <td>{r.created ?? '—'}</td>
              <td>{r.updated ?? '—'}</td>
              <td>{r.statusEvents ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function LifecycleBoard() {
  const {data} = useQuery<string>({
    query: `{${OUTCOMES.map((o) => `"${o.value}": count(*[_type == "pothole" && outcome == "${o.value}"])`).join(', ')}}`,
  })
  const counts = (data ?? {}) as unknown as Record<string, number>
  return (
    <section aria-labelledby="board">
      <h2 id="board">Lifecycle board (live)</h2>
      <ul style={{listStyle: 'none', padding: 0}}>
        {OUTCOMES.map((o) => (
          <li key={o.value} style={{...card, display: 'flex', justifyContent: 'space-between'}}>
            <span>{o.title}</span>
            <strong>{(counts[o.value] ?? 0).toLocaleString()}</strong>
          </li>
        ))}
      </ul>
    </section>
  )
}

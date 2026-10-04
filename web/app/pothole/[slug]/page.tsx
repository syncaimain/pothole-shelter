import Link from 'next/link'
import {notFound} from 'next/navigation'
import {Suspense} from 'react'
import {getApprovedNotes, getPet} from '@/lib/data'
import {day, floating, outcomeDescription, street} from '@/lib/format'
import {OutcomeBadge, SnapshotNotice, StrayBadge, Timeline} from '../../components'
import {ShelterMap} from '../../map/ShelterMap'

export default function PetPage({params}: {params: Promise<{slug: string}>}) {
  return (
    <Suspense fallback={<p className="muted">Fetching this pet&rsquo;s record…</p>}>
      <Pet params={params} />
    </Suspense>
  )
}

async function Pet({params}: {params: Promise<{slug: string}>}) {
  const {slug} = await params
  const loaded = await getPet(slug)
  const pet = loaded.data
  if (!pet) notFound()
  const place = [street(pet.street), pet.crossStreet && `near ${street(pet.crossStreet)}`].filter(Boolean).join(' ')
  const canAdopt = !pet.mergedInto && (pet.outcome === 'shelter' || pet.outcome === 'feral')

  return (
    <article>
      <SnapshotNotice loaded={loaded} />
      {pet.mergedInto && (
        <p className="notice" role="status">
          A person at the shelter confirmed this complaint is about the same pothole as another one, so the two pets were merged.{' '}
          {pet.mergedIntoSlug && <Link href={`/pothole/${pet.mergedIntoSlug}`}>Meet the merged pet →</Link>}
        </p>
      )}
      <h1>{pet.name}</h1>
      <p className="badges">
        <OutcomeBadge outcome={pet.outcome} />
        {!pet.hasCoordinates && <StrayBadge />}
        <span className="badge">{pet.temperament}</span>
      </p>
      <p className="muted">{outcomeDescription(pet.outcome)}</p>

      {pet.bio && <p className="lede">{pet.bio}</p>}

      <dl>
        <dt>Where</dt>
        <dd>
          {place || 'Street not recorded'}
          {pet.communityBoard && `, Community Board ${pet.communityBoard.replace(/\s+QUEENS$/, '')}, Queens`}
        </dd>
        <dt>First reported</dt>
        <dd>{day(pet.firstReportedAt)}</dd>
        <dt>Map</dt>
        <dd>
          {pet.location ? (
            <>
              Around {pet.location.lat.toFixed(3)}, {pet.location.lng.toFixed(3)} (rounded to about 100 m, no house numbers).{' '}
              <a href={`https://www.openstreetmap.org/?mlat=${pet.location.lat.toFixed(3)}&mlon=${pet.location.lng.toFixed(3)}#map=17/${pet.location.lat.toFixed(3)}/${pet.location.lng.toFixed(3)}`}>
                Open in OpenStreetMap
              </a>
            </>
          ) : (
            <>
              No coordinates in the city record, so this pet is a <Link href="/strays">lost stray</Link>: listed by street, not on a map.
            </>
          )}
        </dd>
      </dl>

      {pet.location && (
        <ShelterMap points={[{lat: pet.location.lat, lng: pet.location.lng, name: pet.name, slug: pet.slug, outcome: pet.outcome}]} height={260} zoom={15} />
      )}

      {canAdopt && (
        <p>
          <Link href={`/adopt/${pet.slug}`}>Leave {pet.name} an adoption note →</Link>
        </p>
      )}

      <Suspense fallback={null}>
        <Notes petId={pet.id} name={pet.name} />
      </Suspense>

      <h2>Status timeline</h2>
      <Timeline events={pet.events} />

      <h2>Complaint history</h2>
      <p className="muted small">The city&rsquo;s own record, exactly as published. Times are New York local time.</p>
      <ol>
        {pet.complaints.map((c) => (
          <li key={c.key}>
            <p>
              <strong>311 complaint #{c.key}</strong>, filed {floating(c.created)} · status <strong>{c.status ?? 'unknown'}</strong>
              {c.closed && `, closed ${floating(c.closed)}`}
            </p>
            {c.resolution && <blockquote>{c.resolution}</blockquote>}
            <p className="small">
              <a href={c.sourceUrl}>View the real 311 record (NYC Open Data)</a>
            </p>
          </li>
        ))}
      </ol>
    </article>
  )
}

async function Notes({petId, name}: {petId: string; name: string}) {
  const notes = petId ? await getApprovedNotes(petId) : []
  if (!notes.length) return null
  return (
    <section aria-labelledby="notes">
      <h2 id="notes">Adoption notes for {name}</h2>
      {notes.map((n, i) => (
        <blockquote key={i} className="note">
          <p style={{margin: 0}}>{n.message}</p>
          <footer className="small muted">{n.displayName}</footer>
        </blockquote>
      ))}
    </section>
  )
}

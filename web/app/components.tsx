import Link from 'next/link'
import type {Loaded} from '@/lib/data'
import {dateTime, day, outcomeTitle, street} from '@/lib/format'
import type {EventRow, PetCard as Card} from '@/lib/queries'

export function OutcomeBadge({outcome}: {outcome: string}) {
  return <span className={`badge badge-${outcome}`}>{outcomeTitle(outcome)}</span>
}

export function StrayBadge() {
  return (
    <span className="badge badge-stray" title="No coordinates in the city record: listed by street, not on the map">
      Lost stray
    </span>
  )
}

export function PetCard({pet}: {pet: Card}) {
  const place = [street(pet.street), pet.crossStreet && `near ${street(pet.crossStreet)}`].filter(Boolean).join(' ')
  return (
    <li className="card">
      <h3>
        <Link href={`/pothole/${pet.slug}`}>{pet.name}</Link>
      </h3>
      <p className="badges">
        <OutcomeBadge outcome={pet.outcome} />
        {!pet.hasCoordinates && <StrayBadge />}
      </p>
      <p className="muted">{place || 'Street not recorded'}</p>
      <p className="muted small">
        {pet.temperament} · reported {day(pet.firstReportedAt)}
        {pet.complaintCount > 1 && ` · ${pet.complaintCount} complaints`}
      </p>
    </li>
  )
}

export function PetGrid({pets}: {pets: Card[]}) {
  return (
    <ul className="grid" role="list">
      {pets.map((p) => (
        <PetCard key={p.slug} pet={p} />
      ))}
    </ul>
  )
}

const causeText = (e: EventRow) => {
  const c = e.cause
  if (c.kind === 'timeRule') return 'Still open 60 days after it was filed'
  if (c.kind === 'mappingChange') return 'A person mapped the city’s resolution wording'
  if (c.field === 'created_date') return 'Complaint filed with NYC 311'
  if (c.field) return `City record changed: ${c.field}${c.oldValue ? ` "${c.oldValue}" →` : ''}${c.newValue ? ` "${c.newValue}"` : ''}`
  return 'City record changed'
}

export function Timeline({events}: {events: EventRow[]}) {
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at))
  return (
    <ol className="timeline">
      {sorted.map((e) => (
        <li key={e._key}>
          <time dateTime={e.at}>{dateTime(e.at)}</time>
          <p>
            <OutcomeBadge outcome={e.from} /> → <OutcomeBadge outcome={e.to} />
          </p>
          <p className="muted small">{causeText(e)}</p>
        </li>
      ))}
    </ol>
  )
}

/** Shown on any page that answered from the saved snapshot. Never a silent fallback. */
export function SnapshotNotice({loaded}: {loaded: Loaded<unknown>}) {
  if (loaded.source === 'live') return null
  return (
    <p className="notice" role="status">
      Live data is unavailable right now ({loaded.liveError}). Showing the saved snapshot from {dateTime(loaded.snapshotAt)}.
    </p>
  )
}

import Link from 'next/link'
import {Suspense} from 'react'
import {getStrays} from '@/lib/data'
import {day, plural, street} from '@/lib/format'
import type {PetCard} from '@/lib/queries'
import {OutcomeBadge, SnapshotNotice} from '../components'

export const metadata = {title: 'Lost strays'}

type SP = Promise<Record<string, string | string[] | undefined>>

export default function StraysPage({searchParams}: {searchParams: SP}) {
  return (
    <>
      <h1>Lost strays</h1>
      <p className="lede">
        These complaints have no coordinates in the city record. Most describe a stretch of street between two cross streets rather
        than a point, so they can&rsquo;t go on a map. We list them by street instead, exactly as the city recorded them, and
        don&rsquo;t guess a location.
      </p>
      <Suspense fallback={<p className="muted">Rounding up the strays…</p>}>
        <Strays searchParams={searchParams} />
      </Suspense>
    </>
  )
}

const UNNAMED = 'Street not recorded'

async function Strays({searchParams}: {searchParams: SP}) {
  const sp = await searchParams
  const chosen = typeof sp.street === 'string' ? sp.street : undefined
  const loaded = await getStrays()
  const byStreet = new Map<string, PetCard[]>()
  for (const p of loaded.data) {
    const s = street(p.street) ?? UNNAMED
    byStreet.set(s, [...(byStreet.get(s) ?? []), p])
  }
  const pets = chosen ? byStreet.get(chosen) : undefined

  return (
    <>
      <SnapshotNotice loaded={loaded} />
      <p>
        {plural(loaded.data.length, 'stray')} on {plural(byStreet.size, 'street')} in Community Board 13, Queens.
      </p>
      {chosen && (
        <section aria-labelledby="street-heading">
          <h2 id="street-heading">{chosen}</h2>
          {pets ? (
            <ul>
              {pets.map((p) => (
                <li key={p.slug}>
                  <Link href={`/pothole/${p.slug}`}>{p.name}</Link> <OutcomeBadge outcome={p.outcome} />{' '}
                  <span className="muted small">
                    {p.crossStreet ? `near ${street(p.crossStreet)} · ` : ''}reported {day(p.firstReportedAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No strays on that street.</p>
          )}
          <p>
            <Link href="/strays">All streets</Link>
          </p>
        </section>
      )}
      <h2>Streets, most strays first</h2>
      <ul className="streets">
        {[...byStreet]
          .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
          .map(([name, list]) => (
            <li key={name}>
              <Link href={`/strays?street=${encodeURIComponent(name)}`} aria-current={name === chosen ? 'page' : undefined}>
                {name}
              </Link>{' '}
              <span className="muted small">({list.length})</span>
            </li>
          ))}
      </ul>
    </>
  )
}

import Link from 'next/link'
import {Suspense} from 'react'
import {OUTCOMES} from '@pothole/sync/domain'
import {AGE_BUCKETS, getFeralOfTheWeek, getGallery, getStats, PAGE_SIZE, parseGallery, type GalleryQuery} from '@/lib/data'
import {day, outcomeTitle, plural, street} from '@/lib/format'
import {PetGrid, SnapshotNotice} from './components'

type SP = Promise<Record<string, string | string[] | undefined>>

export default function Gallery({searchParams}: {searchParams: SP}) {
  return (
    <>
      <h1>Every pothole deserves a forever pavement</h1>
      <p className="lede">
        Each pet here is a real pothole complaint filed with NYC 311 in Queens Community Board 13. Its fate follows the city&rsquo;s
        record: repaired, not found, transferred, or still waiting.
      </p>
      <Suspense fallback={<p className="muted">Counting the shelter…</p>}>
        <Stats />
      </Suspense>
      <Suspense fallback={<p className="muted">Finding this week&rsquo;s feral…</p>}>
        <FeralOfTheWeek />
      </Suspense>
      <Suspense fallback={<p className="muted">Loading the gallery…</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Stats() {
  const {data} = await getStats()
  return (
    <ul className="stats" role="list" aria-label="Shelter totals">
      <li>
        <strong>{data.total.toLocaleString('en-US')}</strong> pets
      </li>
      {OUTCOMES.map((o) => (
        <li key={o.value}>
          <strong>{data.byOutcome[o.value].toLocaleString('en-US')}</strong> {o.title.toLowerCase()}
        </li>
      ))}
      <li>
        <strong>{data.strays.toLocaleString('en-US')}</strong> <Link href="/strays">lost strays</Link>
      </li>
    </ul>
  )
}

async function FeralOfTheWeek() {
  const {data: pet} = await getFeralOfTheWeek()
  if (!pet) return null
  const days = pet.daysWaiting
  return (
    <section className="feature" aria-labelledby="feral-week">
      <h2 id="feral-week" style={{marginTop: 0}}>
        Feral of the week
      </h2>
      <p>
        <Link href={`/pothole/${pet.slug}`}>
          <strong>{pet.name}</strong>
        </Link>{' '}
        on {street(pet.street) ?? 'an unrecorded street'}
        {pet.crossStreet && ` near ${street(pet.crossStreet)}`} was first reported {day(pet.firstReportedAt)}
        {days !== undefined && `, ${plural(days, 'day')} ago`}, and the city record is still open.
      </p>
      <p className="muted small">Chosen by the calendar week from every feral pet, not by merit.</p>
    </section>
  )
}

function href(q: GalleryQuery, page: number) {
  const p = new URLSearchParams()
  if (q.outcome) p.set('outcome', q.outcome)
  if (q.age) p.set('age', q.age)
  if (page > 1) p.set('page', String(page))
  const s = p.toString()
  return s ? `/?${s}` : '/'
}

async function Results({searchParams}: {searchParams: SP}) {
  const q = parseGallery(await searchParams)
  const loaded = await getGallery(q)
  const {pets, total} = loaded.data
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  return (
    <section aria-labelledby="gallery-heading">
      <h2 id="gallery-heading">Meet the pets</h2>
      <SnapshotNotice loaded={loaded} />
      {/* A plain GET form: filters work without JavaScript and every state has a URL. */}
      <form className="filters" method="get" action="/">
        <label>
          Outcome
          <select name="outcome" defaultValue={q.outcome ?? ''}>
            <option value="">All outcomes</option>
            {OUTCOMES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Age since first report
          <select name="age" defaultValue={q.age ?? ''}>
            <option value="">Any age</option>
            {Object.entries(AGE_BUCKETS).map(([k, b]) => (
              <option key={k} value={k}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <p className="small muted" style={{margin: 0}}>
          Community board: 13 Queens (the whole shelter)
        </p>
        <button type="submit">Show pets</button>
      </form>
      <p aria-live="polite">
        {plural(total, 'pet')}
        {q.outcome && ` · ${outcomeTitle(q.outcome)}`}
        {q.age && ` · ${AGE_BUCKETS[q.age].label.toLowerCase()}`}
        {pages > 1 && ` · page ${q.page} of ${pages}`}
      </p>
      {pets.length ? <PetGrid pets={pets} /> : <p>No pets match those filters.</p>}
      {pages > 1 && (
        <nav className="pager" aria-label="Gallery pages">
          {q.page > 1 && <Link href={href(q, q.page - 1)}>← Previous</Link>}
          {q.page < pages && <Link href={href(q, q.page + 1)}>Next →</Link>}
        </nav>
      )}
    </section>
  )
}

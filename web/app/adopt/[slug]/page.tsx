import Link from 'next/link'
import {notFound} from 'next/navigation'
import {Suspense} from 'react'
import {getPet} from '@/lib/data'
import {AdoptForm} from './AdoptForm'

export const metadata = {title: 'Adopt'}

export default function AdoptPage({params}: {params: Promise<{slug: string}>}) {
  return (
    <Suspense fallback={<p className="muted">Finding the pet…</p>}>
      <Adopt params={params} />
    </Suspense>
  )
}

async function Adopt({params}: {params: Promise<{slug: string}>}) {
  const {slug} = await params
  const {data: pet} = await getPet(slug)
  if (!pet) notFound()
  const open = pet.outcome === 'shelter' || pet.outcome === 'feral'
  return (
    <>
      <h1>Adopt {pet.name}</h1>
      <p className="lede">
        Adopting is symbolic: leave {pet.name} a note of encouragement while it waits for its forever pavement. It won&rsquo;t change
        the city&rsquo;s record. Only the Department of Transportation can fix the street, and only the city record decides a pet&rsquo;s fate.
      </p>
      {open ? (
        <AdoptForm slug={pet.slug} petName={pet.name} />
      ) : (
        <p>
          {pet.name} has already left the shelter, so it isn&rsquo;t taking notes. <Link href="/">Meet the pets still waiting</Link>.
        </p>
      )}
      <p>
        <Link href={`/pothole/${pet.slug}`}>← Back to {pet.name}</Link>
      </p>
    </>
  )
}

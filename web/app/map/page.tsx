import Link from 'next/link'
import {Suspense} from 'react'
import {getMapPoints} from '@/lib/data'
import {plural} from '@/lib/format'
import {SnapshotNotice} from '../components'
import {ShelterMap} from './ShelterMap'

export const metadata = {title: 'Map'}

export default function MapPage() {
  return (
    <>
      <h1>The shelter on a map</h1>
      <p className="lede">
        Every pet with coordinates in the city record, at about 100 m precision. Click a dot to meet the pet. Prefer a list? The{' '}
        <Link href="/">gallery</Link> has every pet, and <Link href="/strays">lost strays</Link> lists the ones the city recorded
        without coordinates, which can&rsquo;t go on a map.
      </p>
      <Suspense fallback={<p className="muted">Unfolding the map…</p>}>
        <MapData />
      </Suspense>
    </>
  )
}

async function MapData() {
  const loaded = await getMapPoints()
  return (
    <>
      <SnapshotNotice loaded={loaded} />
      <p>{plural(loaded.data.length, 'pet')} on the map. Colours follow the outcome.</p>
      <ShelterMap points={loaded.data} height={560} />
    </>
  )
}

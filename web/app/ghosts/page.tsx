import {Suspense} from 'react'
import {getGhosts} from '@/lib/data'
import {plural} from '@/lib/format'
import {PetGrid, SnapshotNotice} from '../components'

export const metadata = {title: 'Ghost hall'}

export default function GhostsPage() {
  return (
    <>
      <h1>The ghost hall</h1>
      <p className="lede">
        Someone reported a pothole, and when the Department of Transportation came to inspect, it did not find the reported problem.
        That doesn&rsquo;t mean anyone got it wrong: potholes get patched, described differently, or move on. These are the pets the
        city looked for and didn&rsquo;t see.
      </p>
      <Suspense fallback={<p className="muted">Summoning the ghosts…</p>}>
        <Ghosts />
      </Suspense>
    </>
  )
}

async function Ghosts() {
  const loaded = await getGhosts()
  return (
    <>
      <SnapshotNotice loaded={loaded} />
      <p>{plural(loaded.data.length, 'ghost')}, most recently confirmed first.</p>
      <PetGrid pets={loaded.data} />
    </>
  )
}

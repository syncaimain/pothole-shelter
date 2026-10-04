import Link from 'next/link'

export default function PetNotFound() {
  return (
    <>
      <h1>No pet by that name</h1>
      <p>
        This pothole isn&rsquo;t in the shelter. Pets only exist for real 311 complaints in Queens Community Board 13.{' '}
        <Link href="/">Back to the gallery</Link>
      </p>
    </>
  )
}

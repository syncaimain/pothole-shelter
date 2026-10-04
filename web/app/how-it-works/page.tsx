import Link from 'next/link'
import {FERAL_AFTER_DAYS, OUTCOMES} from '@pothole/sync/domain'

export const metadata = {title: 'How it works'}

export default function HowItWorks() {
  return (
    <article>
      <h1>How it works</h1>
      <p className="lede">
        Real civic data, a shelter conceit, and one rule above all: the city&rsquo;s record decides every pet&rsquo;s fate. Code maps
        311 records to outcomes. A model may only restyle a bio built from those records, and only people approve merges and
        adoption notes.
      </p>

      <h2>Where the pets come from</h2>
      <p>
        Every pet is a complaint from{' '}
        <a href="https://data.cityofnewyork.us/Social-Services/311-Service-Requests-from-2020-to-Present/erm2-nwe9">
          NYC 311 Service Requests from 2020 to Present
        </a>{' '}
        (NYC Open Data, dataset erm2-nwe9) with complaint type &ldquo;Street Condition&rdquo; and descriptor &ldquo;Pothole&rdquo;, in
        Queens Community Board 13. The shelter holds every such complaint filed in the last 180 days, plus every one still open,
        however old. Nothing is sampled. The sync fetches only records changed since the last run, and saves every raw page it
        receives with its retrieval time and SHA-256 checksum.
      </p>

      <h2>Outcomes</h2>
      <ul>
        {OUTCOMES.map((o) => (
          <li key={o.value}>
            <strong>{o.title}</strong>: {o.description}.
          </li>
        ))}
        <li>
          <strong>Lost stray</strong>: any of the above, but with no coordinates in the record. Listed by street, not on a map.
        </li>
      </ul>
      <p>
        Open complaints are in the shelter until they have been open {FERAL_AFTER_DAYS} days, then they go feral. Closed complaints
        get their outcome from <Link href="/sync#mappings">resolution mappings</Link>: documents a person wrote, one per exact phrase
        the city uses. Phrases nobody has mapped go to a public <Link href="/sync#unmapped">Unmapped</Link> bucket instead of being
        guessed.
      </p>

      <h2>The schema</h2>
      <ul>
        <li>
          <strong>complaint311</strong>: the city record exactly as published, never edited, rewritten only when its content hash
          changes.
        </li>
        <li>
          <strong>pothole</strong>: the pet. Name, temperament, bio, rounded location and outcome are all derived; the outcome is
          written only by the sync. Its status history is an append-only list inside the pet, and every entry cites the complaint
          field that changed.
        </li>
        <li>
          <strong>resolutionMapping</strong>, <strong>clusterDecision</strong>, <strong>adoption</strong>, <strong>syncRun</strong>:
          the decisions people make, and the sync&rsquo;s own log.
        </li>
      </ul>
      <p>
        Raw records and pet fields are kept apart so the city&rsquo;s data is never mixed with ours. You can check any pet against the
        311 record it came from.
      </p>

      <h2>Workflows</h2>
      <p>
        Three processes are defined with the Sanity Workflows engine (0.36.0, early access): the pothole lifecycle (Reported → In the
        shelter → Adopted, Ghost, Transferred, Feral or Unmapped), cluster review (Proposed → Approved or Rejected) and adoption
        moderation (Submitted → Approved or Rejected). All three pass the engine&rsquo;s validation and its test bench.
      </p>
      <p>
        <strong>Status:</strong> all three definitions are deployed to the dataset (version 1, 4 October 2026). Their documents use
        dotted IDs, which Sanity never serves to anonymous readers, so public pages read workflow state through a read-only server
        proxy. The sync applies the lifecycle rules in code and is the only writer of outcomes; only a robot token may fire the
        lifecycle&rsquo;s &ldquo;record outcome&rdquo; action, and only a person may approve a merge or an adoption note. Engine gates
        are advisory by design, so server checks do the real enforcement.
      </p>

      <h2>Data terms</h2>
      <p>
        The City of New York does not vouch for the accuracy or completeness of data provided by this site, or for the usefulness or
        integrity of the site. This site uses data that has been modified for use from its original source, NYC.gov, the official
        website of the City of New York.
      </p>
      <p className="small muted">
        Locations are rounded to about 100 m and house numbers are never shown. Everyone who reports a pothole and everyone who fixes
        one is doing the city a favour; the jokes here are about the potholes.
      </p>
    </article>
  )
}

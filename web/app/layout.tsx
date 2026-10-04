import Link from 'next/link'
import {Suspense, type ReactNode} from 'react'
import {getSyncStatus} from '@/lib/data'
import {dateTime} from '@/lib/format'
import './globals.css'

export const metadata = {
  title: {default: 'Pothole Adoption Agency', template: '%s · Pothole Adoption Agency'},
  description: 'Real NYC 311 pothole complaints from Queens Community Board 13, waiting for their forever pavement.',
}

const NAV = [
  ['/', 'Gallery'],
  ['/strays', 'Lost strays'],
  ['/ghosts', 'Ghost hall'],
  ['/sync', 'Sync log'],
  ['/office', 'Shelter Office'],
  ['/how-it-works', 'How it works'],
] as const

/** "Data from [time]; last sync failed: [reason]" whenever the latest recorded run failed. */
async function StaleBanner() {
  const {data} = await getSyncStatus()
  if (data.latest?.state !== 'failed') return null
  return (
    <div className="banner" role="alert">
      Data from {dateTime(data.lastGood?.finishedAt)}; last sync failed: {data.latest.error ?? 'unknown reason'}
    </div>
  )
}

async function LastSynced() {
  const {data} = await getSyncStatus()
  return (
    <>
      Last synced{' '}
      <Link href="/sync">
        <time dateTime={data.lastGood?.finishedAt}>{dateTime(data.lastGood?.finishedAt)}</time>
      </Link>
    </>
  )
}

export default function RootLayout({children}: {children: ReactNode}) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="site">
          <div className="wrap">
            <p className="brand">
              <Link href="/">Pothole Adoption Agency</Link>
              <span className="muted small"> · Queens Community Board 13</span>
            </p>
            <nav aria-label="Main">
              <ul role="list">
                {NAV.map(([href, label]) => (
                  <li key={href}>
                    <Link href={href}>{label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
            <p className="small muted synced">
              <Suspense fallback="Checking the sync…">
                <LastSynced />
              </Suspense>
            </p>
          </div>
        </header>
        <Suspense fallback={null}>
          <StaleBanner />
        </Suspense>
        <main id="main" className="wrap">
          {children}
        </main>
        <footer className="site wrap small muted">
          <p>
            Every pet is a real complaint from{' '}
            <a href="https://data.cityofnewyork.us/Social-Services/311-Service-Requests-from-2020-to-Present/erm2-nwe9">
              NYC 311 Service Requests from 2020 to Present
            </a>{' '}
            (NYC Open Data, dataset erm2-nwe9). Outcomes follow the city&rsquo;s own record. Thank you to everyone who reports a
            pothole and everyone who fixes one.
          </p>
          <p>
            The City of New York does not vouch for the accuracy or completeness of this site or the data it uses, which has been
            modified for use from its original source. See <Link href="/how-it-works">How it works</Link>.
          </p>
        </footer>
      </body>
    </html>
  )
}

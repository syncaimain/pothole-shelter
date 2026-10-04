// Screenshots and a silent, narration-paced walkthrough video of the live site, for the DEV post.
//
//   node scripts/capture-media.mjs screens   → docs/media/screens/*.png
//   node scripts/capture-media.mjs video     → docs/media/video/walkthrough.webm + cues.json
//
// The video run submits ONE real adoption note (labelled as the demo's) so the judge path's
// "awaiting moderation" step is shown honestly; it stays private until a person decides it.
import {mkdirSync, readdirSync, renameSync, rmSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium} from '@playwright/test'

const BASE = process.env.BASE_URL ?? 'https://pothole-shelter.vercel.app'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'media')
const mode = process.argv[2] ?? 'screens'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** Scroll in small steps so the recording reads as a person scrolling, not a jump. */
async function glide(page, to, ms = 1800) {
  await page.evaluate(
    async ({to, ms}) => {
      const from = window.scrollY
      const steps = Math.max(1, Math.round(ms / 16))
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        window.scrollTo(0, from + (to - from) * (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2))
        await new Promise((r) => setTimeout(r, 16))
      }
    },
    {to, ms},
  )
}
const glideTo = async (page, selector, ms, offset = 80) => {
  const y = await page.locator(selector).first().evaluate((el, offset) => el.getBoundingClientRect().top + window.scrollY - offset, offset)
  await glide(page, Math.max(0, y), ms)
}

/** A long-waiting feral pet that has coordinates, so its page shows the rounded map pin. */
async function locatedFeral(page) {
  await page.goto(BASE + '/?outcome=feral&age=years', {waitUntil: 'networkidle'})
  const link = page.locator('.grid .card:not(:has(.badge-stray)) h3 a').first()
  return {href: await link.getAttribute('href'), name: (await link.textContent()).trim()}
}

async function feralOfTheWeek(page) {
  await page.goto(BASE + '/', {waitUntil: 'networkidle'})
  const link = page.locator('.feature a').first()
  return {href: await link.getAttribute('href'), name: (await link.textContent()).trim()}
}

async function screens() {
  const out = join(ROOT, 'screens')
  rmSync(out, {recursive: true, force: true})
  mkdirSync(out, {recursive: true})
  const browser = await chromium.launch()
  const desk = await browser.newPage({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1.5})
  const shot = async (page, name, opts = {}) => {
    await page.screenshot({path: join(out, `${name}.png`), ...opts})
    console.log('  ', name)
  }

  await desk.goto(BASE + '/', {waitUntil: 'networkidle'})
  await shot(desk, '01-gallery')
  await desk.locator('.feature').screenshot({path: join(out, '02-feral-of-the-week.png')})
  console.log('   02-feral-of-the-week')
  await desk.goto(BASE + '/?outcome=feral&age=years', {waitUntil: 'networkidle'})
  await glideTo(desk, 'form.filters', 0, 20)
  await shot(desk, '03-filter-feral-over-a-year')

  const {href, name} = await locatedFeral(desk)
  await desk.goto(BASE + href, {waitUntil: 'networkidle'})
  await wait(2500) // map tiles
  await shot(desk, '04-pet-page-top')
  await shot(desk, '05-pet-page-full', {fullPage: true})
  await glideTo(desk, 'h2:has-text("Status timeline")', 0)
  await shot(desk, '06-pet-timeline-and-history')
  const record = await desk.getByRole('link', {name: /View the real 311 record/}).first().getAttribute('href')
  await desk.goto(record, {waitUntil: 'networkidle'})
  await shot(desk, '07-real-311-record')

  await desk.goto(BASE + '/map', {waitUntil: 'networkidle'})
  await wait(3500)
  await glideTo(desk, '.map', 0, 120)
  await shot(desk, '08-map')
  await desk.goto(BASE + '/strays', {waitUntil: 'networkidle'})
  await shot(desk, '09-strays-index')
  await desk.locator('.streets a').first().click()
  await desk.waitForLoadState('networkidle')
  await glideTo(desk, '#street-heading', 0)
  await shot(desk, '10-strays-one-street')
  await desk.goto(BASE + '/ghosts', {waitUntil: 'networkidle'})
  await shot(desk, '11-ghost-hall')
  await desk.goto(BASE + href.replace('/pothole/', '/adopt/'), {waitUntil: 'networkidle'})
  await shot(desk, '12-adoption-form')
  await desk.goto(BASE + '/sync', {waitUntil: 'networkidle'})
  await shot(desk, '13-sync-log')
  await glideTo(desk, '#unmapped', 0)
  await shot(desk, '14-unmapped-and-mappings')
  await desk.goto(BASE + '/office', {waitUntil: 'networkidle'})
  await shot(desk, '15-office-mirror', {fullPage: true})
  await desk.goto(BASE + '/how-it-works', {waitUntil: 'networkidle'})
  await shot(desk, '16-how-it-works', {fullPage: true})

  const phone = await browser.newPage({viewport: {width: 390, height: 844}, deviceScaleFactor: 3, isMobile: true, hasTouch: true})
  await phone.goto(BASE + '/', {waitUntil: 'networkidle'})
  await shot(phone, '17-mobile-gallery')
  await phone.goto(BASE + href, {waitUntil: 'networkidle'})
  await wait(2500)
  await shot(phone, '18-mobile-pet-page')
  await browser.close()
  console.log(`screenshots → ${out} (feral of the week: ${name})`)
}

async function video() {
  const out = join(ROOT, 'video')
  rmSync(out, {recursive: true, force: true})
  mkdirSync(out, {recursive: true})
  const browser = await chromium.launch()
  const size = {width: 1280, height: 720}
  const context = await browser.newContext({viewport: size, recordVideo: {dir: out, size}})
  const page = await context.newPage()
  const t0 = Date.now()
  const cues = []
  const cue = (scene, say) => {
    cues.push({at: Math.round((Date.now() - t0) / 100) / 10, scene, say})
    console.log(`  ${cues.at(-1).at.toFixed(1).padStart(6)}s  ${scene}`)
  }

  // 1. Gallery
  await page.goto(BASE + '/', {waitUntil: 'networkidle'})
  cue('Gallery', 'Every pet here is a real pothole complaint filed with NYC 311 in Queens Community Board 13 — 2,512 of them.')
  await wait(4000)
  cue('Totals', 'Their fates follow the city record: adopted when DOT repairs them, ghosts when nobody finds them, feral when they wait more than 60 days.')
  await glideTo(page, '.stats', 1500, 100)
  await wait(3500)
  cue('Feral of the week', 'Feral of the week is picked by the calendar, not by merit. This one has been waiting since the date on its record.')
  await glideTo(page, '.feature', 1500, 100)
  await wait(4500)

  // 2. Filter + feral pet
  cue('Filters', 'Filter by outcome and age. Hundreds of complaints have been open for over a year: that is the real backlog.')
  await page.goto(BASE + '/?outcome=feral&age=years', {waitUntil: 'networkidle'})
  await glideTo(page, 'form.filters', 1200, 20)
  await wait(3500)
  const {href} = await locatedFeral(page)
  await page.goto(BASE + href, {waitUntil: 'networkidle'})
  cue('Feral pet', 'A pet page: name, temperament and a bio. The bio may only restate facts from the record; Gemini restyles it and a fact guard rejects any changed date, number or street.')
  await wait(5000)
  cue('Rounded map pin', 'Location is rounded to about 100 metres. No house numbers, ever.')
  await glideTo(page, '.map', 1500, 120)
  await wait(4000)
  cue('Timeline', 'The status timeline: every change cites the complaint field that caused it. The sync is the only thing that can change an outcome.')
  await glideTo(page, 'h2:has-text("Status timeline")', 1500)
  await wait(5000)
  cue('Complaint history', "The complaint history is the city's record, exactly as published.")
  await glideTo(page, 'h2:has-text("Complaint history")', 1200)
  await wait(4000)

  // 3. The real record
  const record = await page.getByRole('link', {name: /View the real 311 record/}).first().getAttribute('href')
  cue('Real 311 record', 'And here is that complaint on NYC Open Data. Nothing is invented.')
  await page.goto(record, {waitUntil: 'networkidle'})
  await wait(5000)

  // 4. Map, strays, ghosts
  await page.goto(BASE + '/map', {waitUntil: 'networkidle'})
  cue('Map', 'Only 38 percent of complaints have coordinates, so the map holds fewer than half the shelter.')
  await glideTo(page, '.map', 1200, 120)
  await wait(5000)
  await page.goto(BASE + '/strays', {waitUntil: 'networkidle'})
  cue('Lost strays', 'The rest are lost strays: complaints about a stretch of street between two cross streets. We list them by street instead of guessing a point.')
  await wait(5000)
  await page.locator('.streets a').first().click()
  await page.waitForLoadState('networkidle')
  await glideTo(page, '#street-heading', 1200)
  await wait(4000)
  await page.goto(BASE + '/ghosts', {waitUntil: 'networkidle'})
  cue('Ghost hall', "The ghost hall: the city inspected and didn't find the reported problem. Not anyone's fault — potholes get patched, or move on.")
  await wait(4500)
  await glide(page, 700, 2000)
  await wait(2000)

  // 5. Adoption → moderation
  await page.goto(BASE + href.replace('/pothole/', '/adopt/'), {waitUntil: 'networkidle'})
  cue('Adopt', 'Anyone can leave a pet an adoption note. It is filtered, rate-limited, and stored privately.')
  await wait(3000)
  await page.getByLabel('Your name, as it should appear').pressSequentially('Shelter demo video', {delay: 60})
  await page.locator('textarea[name="message"]').pressSequentially('Rooting for you! Written for the demo walkthrough.', {delay: 45})
  await wait(1200)
  await page.getByRole('button', {name: 'Send adoption note'}).click()
  await page.getByText('awaiting moderation').waitFor({timeout: 60_000})
  cue('Awaiting moderation', 'It starts an adoption-moderation workflow and waits. Nothing a visitor types is public until a person approves it in the Shelter Office.')
  await wait(5000)

  // 6. Sync, office, how it works
  await page.goto(BASE + '/sync', {waitUntil: 'networkidle'})
  cue('Sync log', 'The sync log: last sync time, every run, and the unmapped phrases we refuse to guess.')
  await wait(4000)
  await glideTo(page, '#unmapped', 1500)
  await wait(4000)
  await page.goto(BASE + '/office', {waitUntil: 'networkidle'})
  cue('Office mirror', 'The public mirror of the Shelter Office, with live workflow state: a lifecycle instance for every open pet, and the review queues.')
  await wait(4000)
  await glideTo(page, '#workflows', 1500)
  await wait(5000)
  cue('Shelter Office (insert your Dashboard clip here)', 'Insert the recorded Shelter Office clip: approve the note, then show it on the pet page.')
  await wait(2500)
  await page.goto(BASE + '/how-it-works', {waitUntil: 'networkidle'})
  cue('How it works', 'Raw records stay untouched, pet fields live separately, and every fate is the city’s own. Celebrate the repairs.')
  await wait(5000)
  cue('End', '')

  await context.close()
  await browser.close()
  const file = readdirSync(out).find((f) => f.endsWith('.webm'))
  renameSync(join(out, file), join(out, 'walkthrough.webm'))
  writeFileSync(join(out, 'cues.json'), JSON.stringify({durationSeconds: cues.at(-1).at, cues}, null, 2) + '\n')
  console.log(`video → ${join(out, 'walkthrough.webm')} (${cues.at(-1).at}s)`)
}

await (mode === 'video' ? video() : screens())

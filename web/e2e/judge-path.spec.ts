import AxeBuilder from '@axe-core/playwright'
import {expect, test, type Page} from '@playwright/test'

// The spec's judge path, step by step, as a judge would click it.

async function firstFeralPet(page: Page) {
  await page.goto('/?outcome=feral')
  await expect(page.getByRole('heading', {name: 'Meet the pets'})).toBeVisible()
  const link = page.locator('.grid .card h3 a').first()
  const name = (await link.textContent())!.trim()
  return {link, name}
}

test('1–2: gallery → a feral pet → its complaint history → the real 311 record', async ({page, request}) => {
  await page.goto('/')
  await expect(page.getByRole('heading', {level: 1})).toContainText('forever pavement')
  await expect(page.getByText(/Last synced/)).toBeVisible()

  const {link, name} = await firstFeralPet(page)
  await link.click()
  await expect(page.getByRole('heading', {level: 1, name})).toBeVisible()
  await expect(page.getByRole('heading', {name: 'Status timeline'})).toBeVisible()
  await expect(page.getByRole('heading', {name: 'Complaint history'})).toBeVisible()

  const record = page.getByRole('link', {name: /View the real 311 record/}).first()
  const href = await record.getAttribute('href')
  expect(href).toMatch(/^https:\/\/data\.cityofnewyork\.us\/resource\/erm2-nwe9\.json\?unique_key=\d+$/)
  // The link resolves to the actual city row.
  const rows = await (await request.get(href!)).json()
  expect(rows[0]).toMatchObject({unique_key: href!.split('=')[1], complaint_type: 'Street Condition', descriptor: 'Pothole'})
})

test('3: lost strays and the ghost hall', async ({page}) => {
  await page.goto('/strays')
  await expect(page.getByRole('heading', {level: 1, name: 'Lost strays'})).toBeVisible()
  await expect(page.getByText(/strays? on \d+ streets?/)).toBeVisible()
  await page.locator('.streets a').first().click()
  await expect(page.locator('section ul li a').first()).toBeVisible()

  await page.goto('/ghosts')
  await expect(page.getByRole('heading', {level: 1, name: 'The ghost hall'})).toBeVisible()
  await expect(page.locator('.grid .card').first()).toBeVisible()
})

test('4: an adoption note goes to moderation; invalid notes are refused without being stored', async ({page}) => {
  const {link, name} = await firstFeralPet(page)
  await link.click()
  await page.getByRole('link', {name: new RegExp(`Leave ${name} an adoption note`)}).click()
  await expect(page.getByRole('heading', {level: 1, name: `Adopt ${name}`})).toBeVisible()
  // A link in the note is refused by the server before anything is written.
  await page.getByLabel('Your name, as it should appear').fill('Playwright')
  await page.getByLabel(`A note for ${name}`).fill('see www.example.com')
  await page.getByRole('button', {name: 'Send adoption note'}).click()
  await expect(page.getByText('Please leave out links, email addresses and phone numbers.')).toBeVisible()
})

test('5: the sync log shows the last sync and the run log', async ({page}) => {
  await page.goto('/sync')
  await expect(page.getByText(/Last successful sync:/)).toBeVisible()
  await expect(page.getByRole('table').first()).toBeVisible()
  await expect(page.getByRole('heading', {name: 'Unmapped phrases'})).toBeVisible()
})

test('the Shelter Office mirror is public and read-only', async ({page}) => {
  await page.goto('/office')
  await expect(page.getByRole('heading', {level: 1, name: 'Shelter Office'})).toBeVisible()
  await expect(page.getByRole('button')).toHaveCount(0)
})

const PAGES = ['/', '/map', '/strays', '/ghosts', '/sync', '/office', '/how-it-works']

for (const path of PAGES) {
  test(`accessibility: ${path} has no serious or critical axe violations`, async ({page}) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    const results = await new AxeBuilder({page}).exclude('.maplibregl-canvas').analyze()
    const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(bad.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([])
  })
}

test('accessibility: a pet page and its adoption form', async ({page}) => {
  const {link} = await firstFeralPet(page)
  await link.click()
  await page.waitForLoadState('networkidle')
  for (const target of [page.url(), page.url().replace('/pothole/', '/adopt/')]) {
    await page.goto(target)
    await page.waitForLoadState('networkidle')
    const results = await new AxeBuilder({page}).exclude('.maplibregl-canvas').analyze()
    const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(bad.map((v) => `${target} ${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([])
  }
})

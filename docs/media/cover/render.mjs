// Renders cover.html to PNG at 2x for crisp text: the DEV cover (1000×420) and the video
// thumbnail (1280×720). Uses the Playwright Chromium the web package's e2e tests install.
// Usage (from the repo root): node docs/media/cover/render.mjs
import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(here, '..', '..', '..', 'web', 'package.json'))
const {chromium} = require('@playwright/test')

const page = await (await chromium.launch()).newPage({deviceScaleFactor: 2})
for (const [size, width, height, out] of [
  ['dev', 1000, 420, 'cover-dev-1000x420.png'],
  ['yt', 1280, 720, 'thumbnail-1280x720.png'],
]) {
  await page.setViewportSize({width, height})
  await page.goto(`${pathToFileURL(join(here, 'cover.html')).href}?size=${size}`)
  await page.waitForLoadState('networkidle')
  await page.locator('#card').screenshot({path: join(here, out)})
  console.log(`${out} (${width * 2}×${height * 2})`)
}
await page.context().browser().close()

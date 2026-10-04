import {defineConfig, devices} from '@playwright/test'

// Runs against BASE_URL when given (e.g. the production site), otherwise builds nothing and
// starts the already-built app on the project's assigned port 3004.
const baseURL = process.env.BASE_URL ?? 'http://localhost:3004'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: {timeout: 15_000},
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {baseURL, trace: 'retain-on-failure'},
  projects: [
    {name: 'desktop', use: {...devices['Desktop Chrome']}},
    {name: 'mobile', use: {...devices['Pixel 7']}},
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {command: 'pnpm start', url: baseURL, reuseExistingServer: true, timeout: 120_000},
})

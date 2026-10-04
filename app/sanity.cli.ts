import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  app: {
    organizationId: 'ojpmneh29',
    entry: './src/App.tsx',
    title: 'Shelter Office',
  },
  // From the first `sanity deploy` (2026-10-04).
  deployment: {appId: 's1uy9cp36h3zd8guo7doufha'},
  // 3337 is this project's assigned Sanity port (CLAUDE.md); the App SDK default 3333 may
  // collide with the other builds on this machine. Never run alongside `pnpm dev:studio`.
  server: {port: 3337},
})

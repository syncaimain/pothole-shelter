import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {projectId: 'fixjy07h', dataset: 'production'},
  server: {port: 3337},
  studioHost: 'pothole-shelter',
  // From the first `sanity deploy` (2026-10-04): https://pothole-shelter.sanity.studio
  deployment: {appId: 'q4ew1pnbb01009gm4y9au4x3'},
})

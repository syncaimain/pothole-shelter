import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {projectId: 'fixjy07h', dataset: 'production'},
  server: {port: 3337},
})

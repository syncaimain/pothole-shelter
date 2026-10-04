import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {schemaTypes} from './schemaTypes'
import {structure} from './structure'

// Types only the sync writes. Hiding "create" keeps people from hand-making records
// that should come from the city data. (Write tokens can still bypass the Studio;
// the server-side checks are what actually enforce this.)
const SYNC_OWNED = new Set(['complaint311', 'pothole', 'syncRun', 'clusterDecision', 'adoption'])

export default defineConfig({
  name: 'pothole-shelter',
  title: 'Pothole Adoption Agency',
  // Public by design: the post publishes the project ID and the dataset is public-read.
  projectId: 'fixjy07h',
  dataset: 'production',
  plugins: [structureTool({structure})],
  schema: {
    types: schemaTypes,
    templates: (prev) => prev.filter((t) => !SYNC_OWNED.has(t.schemaType)),
  },
  document: {
    actions: (prev, {schemaType}) =>
      SYNC_OWNED.has(schemaType) && schemaType !== 'clusterDecision' && schemaType !== 'adoption'
        ? prev.filter((a) => a.action !== 'delete' && a.action !== 'duplicate')
        : prev,
  },
})

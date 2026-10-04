import {defineWorkflowConfig} from '@sanity/workflow-engine/define'
import {potholeLifecycle} from './src/potholeLifecycle.ts'
import {adoptionModeration, clusterReview} from './src/review.ts'

export default defineWorkflowConfig({
  deployments: [
    {
      name: 'production',
      tag: 'prod',
      expectedMinReaderModel: 10,
      workflowResource: {type: 'dataset', id: 'fixjy07h.production'},
      definitions: [potholeLifecycle, clusterReview, adoptionModeration],
    },
  ],
})

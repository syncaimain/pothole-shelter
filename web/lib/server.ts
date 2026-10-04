// Server-only Sanity access. The token never reaches the browser: this module is imported
// only from server actions and server components, and `server-only` makes a client import
// fail the build.
import 'server-only'
import {createClient} from '@sanity/client'
import {createEngine} from '@sanity/workflow-engine'
import {DATASET, PROJECT_ID} from './data'

export const WORKFLOW_RESOURCE = {type: 'dataset' as const, id: `${PROJECT_ID}.${DATASET}`}
export const WORKFLOW_TAG = 'prod'

export function serverClient() {
  const token = process.env.SANITY_API_WRITE_TOKEN
  if (!token) throw new Error('SANITY_API_WRITE_TOKEN is not configured on the server')
  return createClient({projectId: PROJECT_ID, dataset: DATASET, apiVersion: '2025-02-19', token, useCdn: false, perspective: 'raw'})
}

export function serverEngine() {
  return createEngine({client: serverClient(), tag: WORKFLOW_TAG, workflowResource: WORKFLOW_RESOURCE})
}

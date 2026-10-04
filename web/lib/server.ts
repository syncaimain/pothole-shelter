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

export interface WorkflowState {
  /** definition → stage → number of live (not completed or aborted) instances. */
  live: Record<string, Record<string, number>>
  /** definition → number of instances that finished (reached a terminal stage). */
  completed: Record<string, number>
  aborted: number
  pendingNotes: number
}

/**
 * The public, read-only proxy for workflow state. Instances and pending notes have dotted
 * ids that the public dataset never serves, so this reads them server-side with the token
 * and returns aggregates only: no ids, no note text, no field values.
 */
export async function readWorkflowState(): Promise<WorkflowState> {
  const rows = await serverClient().fetch<{definition: string; stage: string; done: boolean; aborted: boolean}[]>(
    `*[_type == "sanity.workflow.instance" && tag == "prod"]{definition, "stage": currentStage, "done": defined(completedAt), "aborted": defined(abortedAt)}`,
  )
  const pendingNotes = await serverClient().fetch<number>(`count(*[_type == "adoption" && _id in path("pending.**") && moderation == "submitted"])`)
  const state: WorkflowState = {live: {}, completed: {}, aborted: 0, pendingNotes}
  for (const r of rows) {
    if (r.aborted) state.aborted++
    else if (r.done) state.completed[r.definition] = (state.completed[r.definition] ?? 0) + 1
    else {
      const stages = (state.live[r.definition] ??= {})
      stages[r.stage] = (stages[r.stage] ?? 0) + 1
    }
  }
  return state
}

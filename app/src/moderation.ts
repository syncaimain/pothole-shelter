// Moderation actions for the Shelter Office. They run with the signed-in person's own
// token (the App SDK client), so the workflow engine records that person as the decider.
import type {SanityClient} from '@sanity/client'
import {createEngine} from '@sanity/workflow-engine'

export const WORKFLOW_RESOURCE = {type: 'dataset' as const, id: 'fixjy07h.production'}
export const WORKFLOW_TAG = 'prod'

export interface PendingAdoption {
  _id: string
  displayName: string
  message: string
  createdAt: string
  moderation: 'submitted' | 'approved' | 'rejected'
  workflowInstance?: string
  workflowError?: string
  pothole?: {_ref: string}
  petName?: string
  petSlug?: string
}

/** Account-global user ids start with "g"; robot tokens start with "p-". Mirrors web/lib/adopt.ts. */
export const isPersonId = (id: unknown): id is string => typeof id === 'string' && /^g[A-Za-z0-9-]+$/.test(id)

const publicIdFor = (pendingId: string) => pendingId.replace(/^pending\./, '')

/** The decider the engine stamped on the instance, from the caller's token, not from anything typed. */
async function decidedBy(client: SanityClient, instanceId: string): Promise<string | undefined> {
  return client.fetch<string | null>(`*[_id == $id][0].fields[name == "decidedBy"][0].value.id`, {id: instanceId}).then((v) => v ?? undefined)
}

export async function decide(client: SanityClient, item: PendingAdoption, action: 'approve' | 'reject'): Promise<void> {
  if (!item.workflowInstance) throw new Error('This note has no moderation workflow instance, so it cannot be decided here.')
  const engine = createEngine({client, tag: WORKFLOW_TAG, workflowResource: WORKFLOW_RESOURCE})
  await engine.fireAction({instanceId: item.workflowInstance, activity: 'review', action, params: {note: ''}})

  const by = await decidedBy(client, item.workflowInstance)
  if (!isPersonId(by)) {
    // The engine gate is advisory; this check and the public site's filter are the real ones.
    throw new Error('Only a person can moderate notes. This session is not signed in as a person.')
  }
  const at = new Date().toISOString()
  const tx = client.transaction()
  tx.patch(client.patch(item._id).set({moderation: action === 'approve' ? 'approved' : 'rejected', moderatedBy: by, moderatedAt: at}))
  if (action === 'approve') {
    // The public copy: same words, no visitor hash. Only this document is ever public.
    tx.createOrReplace({
      _id: publicIdFor(item._id),
      _type: 'adoption',
      pothole: item.pothole && {_type: 'reference', _ref: item.pothole._ref, _weak: true},
      displayName: item.displayName,
      message: item.message,
      createdAt: item.createdAt,
      moderation: 'approved',
      moderatedBy: by,
      moderatedAt: at,
      workflowInstance: item.workflowInstance,
    })
  }
  await tx.commit()
}

'use server'

import {createHash, randomUUID} from 'node:crypto'
import {headers} from 'next/headers'
import {gdrRef} from '@sanity/workflow-engine'
import {pendingId, PER_VISITOR_PER_HOUR, SITE_PER_HOUR, validateAdoption, type FieldErrors} from '@/lib/adopt'
import {serverClient, serverEngine, WORKFLOW_RESOURCE} from '@/lib/server'

export interface AdoptState {
  status: 'idle' | 'error' | 'submitted'
  errors?: FieldErrors
  values?: {displayName: string; message: string}
}

/** The visitor's IP, hashed with a server secret: enough to rate-limit, never stored raw. */
async function visitorHash() {
  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown'
  return createHash('sha256').update(`${process.env.ADOPTION_SALT ?? 'local-dev'}:${ip}`).digest('hex').slice(0, 32)
}

export async function submitAdoption(_prev: AdoptState, form: FormData): Promise<AdoptState> {
  const slug = String(form.get('slug') ?? '')
  const raw = {displayName: String(form.get('displayName') ?? ''), message: String(form.get('message') ?? ''), website: String(form.get('website') ?? '')}
  const values = {displayName: raw.displayName, message: raw.message}
  const checked = validateAdoption(raw)
  if (!checked.ok) return {status: 'error', errors: checked.errors, values}

  try {
    const client = serverClient()
    const pet = await client.fetch<{_id: string; outcome: string} | null>(`*[_type == "pothole" && slug.current == $slug][0]{_id, outcome}`, {slug})
    if (!pet) return {status: 'error', errors: {form: 'That pet is not in the shelter.'}, values}
    if (pet.outcome !== 'shelter' && pet.outcome !== 'feral') {
      return {status: 'error', errors: {form: 'This pet has already left the shelter, so it is not taking adoption notes.'}, values}
    }

    const ipHash = await visitorHash()
    const since = new Date(Date.now() - 3_600_000).toISOString()
    const recent = await client.fetch<{mine: number; all: number}>(
      `{"mine": count(*[_type == "adoption" && ipHash == $ipHash && createdAt > $since]), "all": count(*[_type == "adoption" && createdAt > $since])}`,
      {ipHash, since},
    )
    if (recent.mine >= PER_VISITOR_PER_HOUR || recent.all >= SITE_PER_HOUR) {
      return {status: 'error', errors: {form: 'The shelter is getting a lot of notes right now. Please try again in an hour.'}, values}
    }

    // Stored under a dotted id, which the public dataset never serves: nothing a visitor
    // types is public until a person approves it.
    const uuid = randomUUID()
    const id = pendingId(uuid)
    await client.create({
      _id: id,
      _type: 'adoption',
      pothole: {_type: 'reference', _ref: pet._id, _weak: true},
      displayName: checked.value.displayName,
      message: checked.value.message,
      createdAt: new Date().toISOString(),
      moderation: 'submitted',
      ipHash,
    })

    // The adoption-moderation workflow: Submitted → Approved | Rejected, decided by a person.
    try {
      const {instance} = await serverEngine().startInstance({
        definition: 'adoption-moderation',
        initialFields: [{type: 'subject', name: 'subject', value: gdrRef({res: WORKFLOW_RESOURCE, documentId: id, type: 'adoption'})}],
      })
      await client.patch(id).set({workflowInstance: instance._id}).commit()
    } catch (err) {
      // The note is safe and hidden either way; record why the workflow did not start.
      await client.patch(id).set({workflowError: err instanceof Error ? err.message.slice(0, 300) : String(err)}).commit()
    }
    return {status: 'submitted'}
  } catch (err) {
    console.error('adoption submit failed', err)
    return {status: 'error', errors: {form: 'The shelter could not take your note right now. Please try again later.'}, values}
  }
}

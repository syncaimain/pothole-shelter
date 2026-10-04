import {createClient, type SanityClient} from '@sanity/client'
import type {ResolutionMapping} from './mapping.ts'
import type {ComplaintDoc, Plan, StoredPet} from './plan.ts'
import type {SyncRunDoc, SyncStore} from './store.ts'

export const SANITY_PROJECT_ID = 'fixjy07h'
export const SANITY_DATASET = 'production'
export const SANITY_API_VERSION = '2025-02-19'

export const APPROVED_CLUSTERS = `*[_type == "clusterDecision" && decision == "approved" && string::startsWith(decidedBy, "g")]{_id, "complaintIds": complaints[]._ref}`

/** Mutations per transaction; keeps each request well under the 4 MB body limit. */
const BATCH = 200

export function sanityWriteClient(token: string): SanityClient {
  return createClient({
    projectId: SANITY_PROJECT_ID,
    dataset: SANITY_DATASET,
    apiVersion: SANITY_API_VERSION,
    token,
    useCdn: false,
    perspective: 'published',
  })
}

export class SanityStore implements SyncStore {
  private client: SanityClient
  constructor(client: SanityClient) {
    this.client = client
  }

  async loadState() {
    const [complaints, pets, mappings, lastGood, approvedClusters] = await Promise.all([
      this.client.fetch<ComplaintDoc[]>(`*[_type == "complaint311"]{_id, _type, raw, rawHash, sourceUrl, sourceUpdatedAt, firstSyncedAt, syncedAt}`),
      this.client.fetch<StoredPet[]>(
        `*[_type == "pothole"]{_id, name, slug, temperament, outcome, complaints[]{_type, _key, _ref}, complaintCount, firstReportedAt, lastEventAt, street, crossStreet, communityBoard, location, hasCoordinates, bio, bioMeta, mergedInto, "events": events[]{_key}}`,
      ),
      this.client.fetch<ResolutionMapping[]>(`*[_type == "resolutionMapping"]{_id, pattern, matchType, outcome}`),
      this.client.fetch<Pick<SyncRunDoc, 'watermark'> | null>(`*[_type == "syncRun" && state == "succeeded"] | order(startedAt desc)[0]{watermark}`),
      // Only merges a person approved: decidedBy must be an account-global user id, never a robot token.
      this.client.fetch<{_id: string; complaintIds: string[]}[]>(APPROVED_CLUSTERS),
    ])
    return {
      complaints: new Map(complaints.map((c) => [c._id, stripNulls(c)])),
      pets: new Map(pets.map((p) => [p._id, stripNulls(p)])),
      mappings,
      watermark: lastGood?.watermark ?? undefined,
      approvedClusters,
    }
  }

  async saveRun(run: SyncRunDoc) {
    await this.client.createOrReplace(run)
  }

  /** Raw records first, then pets (which reference them). Events ride inside pet writes. */
  async apply(plan: Plan) {
    await this.inBatches(plan.complaints, (tx, c) => tx.createOrReplace(c))
    await this.inBatches(plan.petCreates, (tx, p) => tx.createIfNotExists(p))
    await this.inBatches(plan.petPatches, (tx, {id, set, unset, append}) => {
      let patch = this.client.patch(id)
      if (Object.keys(set).length) patch = patch.set(set)
      if (unset.length) patch = patch.unset(unset)
      if (append.length) patch = patch.setIfMissing({events: []}).append('events', append)
      return tx.patch(patch)
    })
  }

  private async inBatches<T>(items: readonly T[], add: (tx: ReturnType<SanityClient['transaction']>, item: T) => unknown) {
    for (let i = 0; i < items.length; i += BATCH) {
      const tx = this.client.transaction()
      for (const item of items.slice(i, i + BATCH)) add(tx, item)
      await tx.commit({visibility: 'async'})
    }
  }
}

/** GROQ projections return null for missing fields; the planner treats missing as undefined. */
function stripNulls<T>(doc: T): T {
  return JSON.parse(JSON.stringify(doc, (_k, v) => (v === null ? undefined : v)))
}

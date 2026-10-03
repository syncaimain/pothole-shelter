import {createClient, type SanityClient} from '@sanity/client'
import type {StatusEventDoc} from './events.ts'
import type {ResolutionMapping} from './mapping.ts'
import type {ComplaintDoc, Plan, StoredPet} from './plan.ts'
import type {SyncRunDoc, SyncStore} from './store.ts'

export const SANITY_PROJECT_ID = 'fixjy07h'
export const SANITY_DATASET = 'production'
export const SANITY_API_VERSION = '2025-02-19'

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
    const [complaints, pets, mappings, eventIds, lastGood] = await Promise.all([
      this.client.fetch<ComplaintDoc[]>(`*[_type == "complaint311"]{_id, _type, raw, rawHash, sourceUrl, sourceUpdatedAt, firstSyncedAt, syncedAt}`),
      this.client.fetch<StoredPet[]>(
        `*[_type == "pothole"]{_id, name, slug, temperament, outcome, complaints[]{_type, _key, _ref}, complaintCount, firstReportedAt, lastEventAt, street, crossStreet, communityBoard, location, hasCoordinates, bio, bioMeta}`,
      ),
      this.client.fetch<ResolutionMapping[]>(`*[_type == "resolutionMapping"]{_id, pattern, matchType, outcome}`),
      this.client.fetch<string[]>(`*[_type == "statusEvent"]._id`),
      this.client.fetch<Pick<SyncRunDoc, 'watermark'> | null>(`*[_type == "syncRun" && state == "succeeded"] | order(startedAt desc)[0]{watermark}`),
    ])
    return {
      complaints: new Map(complaints.map((c) => [c._id, stripNulls(c)])),
      pets: new Map(pets.map((p) => [p._id, stripNulls(p)])),
      mappings,
      eventIds: new Set(eventIds),
      watermark: lastGood?.watermark ?? undefined,
    }
  }

  async saveRun(run: SyncRunDoc) {
    await this.client.createOrReplace(run)
  }

  /** Raw records first, then pets (which reference them), then events (which reference pets). */
  async apply(plan: Plan) {
    await this.inBatches(plan.complaints, (tx, c) => tx.createOrReplace(c))
    await this.inBatches(plan.petCreates, (tx, p) => tx.createIfNotExists(p))
    await this.inBatches(plan.petPatches, (tx, {id, set, unset}) => {
      let patch = this.client.patch(id)
      if (Object.keys(set).length) patch = patch.set(set)
      if (unset.length) patch = patch.unset(unset)
      return tx.patch(patch)
    })
    await this.inBatches(plan.events, (tx, e: StatusEventDoc) => tx.createIfNotExists(e))
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

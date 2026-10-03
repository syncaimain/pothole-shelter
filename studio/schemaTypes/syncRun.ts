import {defineField, defineType} from 'sanity'

const count = (name: string) => defineField({name, type: 'number'})

/** One execution of the 311 sync, with counts and the snapshot pages it saved. */
export const syncRun = defineType({
  name: 'syncRun',
  title: 'Sync run',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({name: 'startedAt', type: 'datetime'}),
    defineField({name: 'finishedAt', type: 'datetime'}),
    defineField({name: 'state', type: 'string', options: {list: ['running', 'succeeded', 'failed']}}),
    defineField({name: 'mode', type: 'string', options: {list: ['full', 'incremental']}}),
    defineField({name: 'watermark', title: 'Socrata :updated_at high-water mark', type: 'datetime'}),
    count('fetched'),
    count('created'),
    count('updated'),
    count('unchanged'),
    count('unmapped'),
    count('failed'),
    count('statusEvents'),
    defineField({name: 'error', type: 'text', rows: 3}),
    defineField({
      name: 'snapshots',
      type: 'array',
      of: [
        {
          type: 'object',
          name: 'snapshotPage',
          fields: [
            defineField({name: 'file', type: 'string'}),
            defineField({name: 'sha256', type: 'string'}),
            defineField({name: 'rows', type: 'number'}),
            defineField({name: 'retrievedAt', type: 'datetime'}),
          ],
        },
      ],
    }),
  ],
  preview: {
    select: {state: 'state', at: 'startedAt', fetched: 'fetched', updated: 'updated', created: 'created'},
    prepare: ({state, at, fetched, updated, created}) => ({
      title: `${state} · ${at?.replace('T', ' ').slice(0, 16) ?? '?'}`,
      subtitle: `fetched ${fetched ?? 0} · created ${created ?? 0} · updated ${updated ?? 0}`,
    }),
  },
  orderings: [{title: 'Newest first', name: 'startedDesc', by: [{field: 'startedAt', direction: 'desc'}]}],
})

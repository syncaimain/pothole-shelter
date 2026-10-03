import {defineField, defineType} from 'sanity'
import {OUTCOMES} from '@pothole/sync/domain'

const outcomeList = [{value: 'reported', title: 'Reported'}, ...OUTCOMES.map(({value, title}) => ({value, title}))]

/** One change to a pet's outcome, citing the city-record change that caused it. Written only by the sync. */
export const statusEvent = defineType({
  name: 'statusEvent',
  title: 'Status event',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({name: 'pothole', type: 'reference', to: [{type: 'pothole'}]}),
    defineField({name: 'from', type: 'string', options: {list: outcomeList}}),
    defineField({name: 'to', type: 'string', options: {list: outcomeList}}),
    defineField({name: 'at', type: 'datetime', description: 'When the city record changed, or when the time rule fired.'}),
    defineField({
      name: 'cause',
      type: 'object',
      fields: [
        defineField({name: 'kind', type: 'string', options: {list: ['complaintChange', 'timeRule', 'mappingChange']}}),
        defineField({name: 'complaint', type: 'reference', to: [{type: 'complaint311'}]}),
        defineField({name: 'field', type: 'string', description: 'The raw field that changed, e.g. status.'}),
        defineField({name: 'oldValue', type: 'string'}),
        defineField({name: 'newValue', type: 'string'}),
        defineField({name: 'mapping', type: 'reference', to: [{type: 'resolutionMapping'}], weak: true}),
      ],
    }),
    defineField({name: 'syncRun', type: 'reference', to: [{type: 'syncRun'}], weak: true}),
  ],
  preview: {
    select: {name: 'pothole.name', from: 'from', to: 'to', at: 'at'},
    prepare: ({name, from, to, at}) => ({title: `${name ?? '?'}: ${from} → ${to}`, subtitle: at?.slice(0, 10)}),
  },
  orderings: [{title: 'Newest first', name: 'atDesc', by: [{field: 'at', direction: 'desc'}]}],
})

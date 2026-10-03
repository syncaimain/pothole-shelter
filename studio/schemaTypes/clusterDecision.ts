import {defineField, defineType} from 'sanity'

/** A proposal to treat two or more complaints as one pet. Proposed by rule or agent; decided by a person. */
export const clusterDecision = defineType({
  name: 'clusterDecision',
  title: 'Cluster decision',
  type: 'document',
  fields: [
    defineField({
      name: 'complaints',
      type: 'array',
      readOnly: true,
      of: [{type: 'reference', to: [{type: 'complaint311'}]}],
      validation: (r) => r.min(2),
    }),
    defineField({name: 'proposedBy', type: 'string', readOnly: true, options: {list: ['rule', 'agent']}}),
    defineField({name: 'proposedAt', type: 'datetime', readOnly: true}),
    defineField({name: 'distanceMetres', type: 'number', readOnly: true}),
    defineField({name: 'daysApart', type: 'number', readOnly: true}),
    defineField({name: 'reason', type: 'text', rows: 2, readOnly: true}),
    defineField({
      name: 'decision',
      type: 'string',
      initialValue: 'proposed',
      options: {list: ['proposed', 'approved', 'rejected'], layout: 'radio'},
    }),
    defineField({name: 'decidedBy', type: 'string', readOnly: true}),
    defineField({name: 'decidedAt', type: 'datetime', readOnly: true}),
  ],
  preview: {
    select: {decision: 'decision', reason: 'reason', by: 'proposedBy'},
    prepare: ({decision, reason, by}) => ({title: `${decision} · by ${by}`, subtitle: reason}),
  },
})

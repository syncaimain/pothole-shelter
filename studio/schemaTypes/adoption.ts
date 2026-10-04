import {defineField, defineType} from 'sanity'

/**
 * A visitor's adoption note. Submitted notes live under a private dotted id
 * (pending.adoption-<uuid>) that the public dataset never serves; a person approving one
 * creates the public adoption-<uuid> copy.
 */
export const adoption = defineType({
  name: 'adoption',
  title: 'Adoption',
  type: 'document',
  fields: [
    defineField({name: 'pothole', type: 'reference', to: [{type: 'pothole'}], weak: true, readOnly: true}),
    defineField({name: 'displayName', type: 'string', readOnly: true}),
    defineField({name: 'message', type: 'text', rows: 3, readOnly: true}),
    defineField({name: 'createdAt', type: 'datetime', readOnly: true}),
    defineField({
      name: 'moderation',
      type: 'string',
      initialValue: 'submitted',
      options: {list: ['submitted', 'approved', 'rejected'], layout: 'radio'},
    }),
    defineField({name: 'moderatedBy', type: 'string', readOnly: true}),
    defineField({name: 'moderatedAt', type: 'datetime', readOnly: true}),
    defineField({name: 'workflowInstance', title: 'Moderation workflow instance', type: 'string', readOnly: true}),
    defineField({name: 'workflowError', type: 'string', readOnly: true, hidden: ({value}) => !value}),
    defineField({
      name: 'ipHash',
      title: 'Visitor hash (rate limiting)',
      description: 'Salted SHA-256 of the submitter IP. Never the IP itself.',
      type: 'string',
      readOnly: true,
      hidden: true,
    }),
  ],
  preview: {
    select: {title: 'displayName', pet: 'pothole.name', moderation: 'moderation'},
    prepare: ({title, pet, moderation}) => ({title: `${title} → ${pet ?? '?'}`, subtitle: moderation}),
  },
})

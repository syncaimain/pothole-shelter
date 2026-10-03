import {defineField, defineType} from 'sanity'

/** A visitor's adoption message. Hidden from the public until a person approves it. */
export const adoption = defineType({
  name: 'adoption',
  title: 'Adoption',
  type: 'document',
  fields: [
    defineField({name: 'pothole', type: 'reference', to: [{type: 'pothole'}], readOnly: true}),
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
  ],
  preview: {
    select: {title: 'displayName', pet: 'pothole.name', moderation: 'moderation'},
    prepare: ({title, pet, moderation}) => ({title: `${title} → ${pet ?? '?'}`, subtitle: moderation}),
  },
})

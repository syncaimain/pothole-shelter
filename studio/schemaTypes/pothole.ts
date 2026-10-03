import {defineField, defineType} from 'sanity'
import {OUTCOMES} from '@pothole/sync/domain'

/**
 * The adoptable pet. Everything here is derived from complaint311 records by the
 * sync; nothing is copied back onto them. `outcome` is written only by the sync.
 */
export const pothole = defineType({
  name: 'pothole',
  title: 'Pothole (pet)',
  type: 'document',
  groups: [
    {name: 'pet', title: 'Pet', default: true},
    {name: 'place', title: 'Place'},
    {name: 'record', title: 'City record'},
  ],
  fields: [
    defineField({
      name: 'name',
      type: 'string',
      group: 'pet',
      readOnly: true,
      description: 'Generated deterministically from the first complaint key.',
    }),
    defineField({name: 'slug', type: 'slug', group: 'pet', readOnly: true}),
    defineField({
      name: 'temperament',
      type: 'string',
      group: 'pet',
      readOnly: true,
      description: 'Derived from age and complaint count.',
    }),
    defineField({
      name: 'outcome',
      type: 'string',
      group: 'pet',
      readOnly: true,
      description:
        'Written only by the sync, from resolutionMapping documents and the 60-day rule. Every change has a statusEvent.',
      options: {list: OUTCOMES.map(({value, title}) => ({value, title}))},
    }),
    defineField({
      name: 'bio',
      type: 'text',
      group: 'pet',
      rows: 4,
      readOnly: true,
      description: 'Built from a fact template; may be restyled by a model, then checked by the fact guard.',
    }),
    defineField({
      name: 'bioMeta',
      title: 'Bio provenance',
      type: 'object',
      group: 'pet',
      readOnly: true,
      fields: [
        defineField({name: 'source', type: 'string', options: {list: ['template', 'model']}}),
        defineField({name: 'model', type: 'string', description: 'Exact model ID and the modelVersion the API returned.'}),
        defineField({name: 'guardPassed', type: 'boolean'}),
        defineField({
          name: 'factsHash',
          type: 'string',
          description: 'Fingerprint of the facts the bio was built from. When the facts change, the sync restores the template bio.',
        }),
        defineField({name: 'generatedAt', type: 'datetime'}),
      ],
    }),
    defineField({
      name: 'complaints',
      type: 'array',
      group: 'record',
      readOnly: true,
      of: [{type: 'reference', to: [{type: 'complaint311'}]}],
    }),
    defineField({name: 'complaintCount', type: 'number', group: 'record', readOnly: true}),
    defineField({name: 'firstReportedAt', type: 'datetime', group: 'record', readOnly: true}),
    defineField({name: 'lastEventAt', type: 'datetime', group: 'record', readOnly: true}),
    defineField({name: 'street', type: 'string', group: 'place', readOnly: true}),
    defineField({name: 'crossStreet', type: 'string', group: 'place', readOnly: true}),
    defineField({name: 'communityBoard', type: 'string', group: 'place', readOnly: true}),
    defineField({
      name: 'location',
      type: 'geopoint',
      group: 'place',
      readOnly: true,
      description: 'Rounded to 3 decimals (~100 m) for display. Exact points stay on the raw record.',
    }),
    defineField({
      name: 'hasCoordinates',
      type: 'boolean',
      group: 'place',
      readOnly: true,
      description: 'False makes this pet a lost stray: listed by street and community board, not on the map.',
    }),
  ],
  preview: {
    select: {title: 'name', outcome: 'outcome', street: 'street', hasCoordinates: 'hasCoordinates'},
    prepare: ({title, outcome, street, hasCoordinates}) => ({
      title,
      subtitle: [OUTCOMES.find((o) => o.value === outcome)?.title ?? outcome, street, hasCoordinates === false ? 'stray' : null]
        .filter(Boolean)
        .join(' · '),
    }),
  },
})

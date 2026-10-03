import {defineField, defineType} from 'sanity'
import {MAPPABLE_OUTCOMES, OUTCOMES} from '@pothole/sync/domain'

const mappable: readonly string[] = MAPPABLE_OUTCOMES

/**
 * A person's decision about what one family of 311 resolution texts means.
 * The sync applies these; code never guesses an outcome from wording.
 */
export const resolutionMapping = defineType({
  name: 'resolutionMapping',
  title: 'Resolution mapping',
  type: 'document',
  fields: [
    defineField({
      name: 'pattern',
      title: 'Phrase pattern',
      type: 'string',
      validation: (r) => r.required(),
      description: 'Matched case-insensitively against resolution_description after collapsing whitespace.',
    }),
    defineField({
      name: 'matchType',
      type: 'string',
      initialValue: 'exact',
      options: {list: ['exact', 'contains'], layout: 'radio'},
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'outcome',
      type: 'string',
      options: {
        list: OUTCOMES.filter((o) => mappable.includes(o.value)).map(({value, title}) => ({value, title})),
      },
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'examplePhrases',
      type: 'array',
      of: [{type: 'string'}],
      description: 'Real texts from the discover_resolutions output.',
    }),
    defineField({name: 'rationale', type: 'text', rows: 3, validation: (r) => r.required()}),
  ],
  preview: {select: {title: 'pattern', subtitle: 'outcome'}},
})

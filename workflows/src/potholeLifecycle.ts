import {
  defineAction,
  defineActivity,
  defineField,
  defineStage,
  defineTransition,
  defineWorkflow,
} from '@sanity/workflow-engine/define'

/**
 * Only the sync, which runs on a robot token, may record outcomes. People are refused.
 *
 * Gated on the actor's id namespace (robot tokens start "p-", people "g"), not on a role:
 * the deploy rejects role names the project doesn't have ("unknown role pothole-sync"),
 * and `$actor.kind` can't be used because the engine stamps every actor "person".
 * Advisory like every engine gate; the server enforces it for real by accepting outcome
 * writes only from the sync token.
 */
export const SYNC_ONLY = 'string::startsWith($actor.id, "p-")'

const OUTCOME_CHOICES = [
  {title: 'Adopted into forever pavement', value: 'adopted'},
  {title: 'Ghost', value: 'ghost'},
  {title: 'Transferred', value: 'transferred'},
  {title: 'Unmapped', value: 'unmapped'},
]

/**
 * The sync records what the city record now says. It carries the cause, the same
 * facts a statusEvent cites, so the workflow history and the events agree.
 */
const recordOutcome = defineAction({
  name: 'record-outcome',
  title: 'Record the city outcome',
  description: 'Fired by the sync when the 311 record closes, citing the complaint field that changed.',
  filter: SYNC_ONLY,
  params: [
    {type: 'string', name: 'outcome', required: true},
    {type: 'string', name: 'complaint', required: true},
    {type: 'string', name: 'field', required: true},
  ],
  ops: [
    {type: 'field.set', target: {field: 'outcome'}, value: {type: 'param', param: 'outcome'}},
    {type: 'field.set', target: {field: 'causeComplaint'}, value: {type: 'param', param: 'complaint'}},
    {type: 'field.set', target: {field: 'causeField'}, value: {type: 'param', param: 'field'}},
  ],
  status: 'done',
})

const cityRecord = () =>
  defineActivity({
    name: 'city-record',
    title: 'Wait for the city record to close',
    actions: [recordOutcome],
  })

/** Closed outcomes, reachable from the shelter, from feral, and (once mapped) from unmapped. */
const closedRoutes = [
  defineTransition({name: 'to-adopted', title: 'Repaired', to: 'adopted', when: '$fields.outcome == "adopted"'}),
  defineTransition({name: 'to-ghost', title: 'No defect found', to: 'ghost', when: '$fields.outcome == "ghost"'}),
  defineTransition({name: 'to-transferred', title: 'Referred or duplicate', to: 'transferred', when: '$fields.outcome == "transferred"'}),
]

export const potholeLifecycle = defineWorkflow({
  name: 'pothole-lifecycle',
  title: 'Pothole lifecycle',
  description:
    'One pet from report to outcome. Moved only by the sync runtime, from resolutionMapping documents; Feral by the 60-day time rule.',
  initialStage: 'reported',
  fields: [
    defineField({type: 'subject', name: 'subject', title: 'Pet', required: true, initialValue: {type: 'input'}}),
    defineField({type: 'datetime', name: 'feralAt', title: 'Turns feral at', required: true, initialValue: {type: 'input'}}),
    defineField({type: 'string', name: 'outcome', title: 'City outcome', options: {list: OUTCOME_CHOICES}}),
    defineField({type: 'string', name: 'causeComplaint', title: 'Complaint that changed'}),
    defineField({type: 'string', name: 'causeField', title: 'Field that changed'}),
  ],
  stages: [
    defineStage({
      name: 'reported',
      title: 'Reported',
      description: 'A 311 complaint exists; the pet is being admitted.',
      transitions: [defineTransition({name: 'admit', title: 'Admit to the shelter', to: 'shelter', when: 'true'})],
    }),
    defineStage({
      name: 'shelter',
      title: 'In the shelter',
      description: 'Open for less than 60 days.',
      activities: [cityRecord()],
      transitions: [
        ...closedRoutes,
        defineTransition({name: 'to-unmapped', title: 'Closed, wording not mapped', to: 'unmapped', when: '$fields.outcome == "unmapped"'}),
        defineTransition({name: 'go-feral', title: '60 days open', to: 'feral', when: '!defined($fields.outcome) && dateTime($now) >= dateTime($fields.feralAt)'}),
      ],
    }),
    defineStage({
      name: 'feral',
      title: 'Feral',
      description: 'Still open after 60 days.',
      activities: [cityRecord()],
      transitions: [
        ...closedRoutes,
        defineTransition({name: 'to-unmapped', title: 'Closed, wording not mapped', to: 'unmapped', when: '$fields.outcome == "unmapped"'}),
      ],
    }),
    defineStage({
      name: 'unmapped',
      title: 'Unmapped',
      description: 'Closed by the city with wording no resolutionMapping covers yet. Leaves when a person adds a mapping and the sync re-records the outcome.',
      activities: [cityRecord()],
      transitions: closedRoutes,
    }),
    defineStage({name: 'adopted', title: 'Adopted into forever pavement', description: 'Closed: the city repaired it.'}),
    defineStage({name: 'ghost', title: 'Ghost', description: 'Closed: no defect was found.'}),
    defineStage({name: 'transferred', title: 'Transferred', description: 'Closed: referred elsewhere or a duplicate.'}),
  ],
})

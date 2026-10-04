import {
  defineAction,
  defineActivity,
  defineField,
  defineStage,
  defineTransition,
  defineWorkflow,
} from '@sanity/workflow-engine/define'

/**
 * Decisions only a person may make: the caller must not be a robot token.
 *
 * Why not `$actor.kind == "person"`: probed on the bench (0.36.0), the engine stamps
 * every resolved actor as kind "person", robots included, so that gate admits everyone.
 * The id namespace is what discriminates: account-global user ids start `g`, robot
 * tokens start `p-`. The sync and the agent both run on robot tokens, so this refuses
 * them. Advisory like every engine gate (an agent driving a human's session would pass);
 * the server's approve/reject routes enforce it for real.
 */
export const PERSON_ONLY = '!string::startsWith($actor.id, "p-")'

interface ReviewSpec {
  name: string
  title: string
  description: string
  subjectTitle: string
  /** Stage name while waiting: `proposed` for clusters, `submitted` for adoptions. */
  waiting: {name: string; title: string; description: string}
}

/** Waiting → approved | rejected, where only a person can decide. */
function reviewWorkflow(spec: ReviewSpec) {
  const decide = (name: 'approve' | 'reject', outcome: 'approved' | 'rejected', title: string) =>
    defineAction({
      name,
      title,
      filter: PERSON_ONLY,
      params: [{type: 'string', name: 'note'}],
      ops: [
        {type: 'field.set', target: {field: 'decision'}, value: {type: 'literal', value: outcome}},
        {type: 'field.set', target: {field: 'decidedBy'}, value: {type: 'actor'}},
        {type: 'field.set', target: {field: 'decidedAt'}, value: {type: 'now'}},
      ],
      status: 'done',
    })

  return defineWorkflow({
    name: spec.name,
    title: spec.title,
    description: spec.description,
    initialStage: spec.waiting.name,
    fields: [
      defineField({type: 'subject', name: 'subject', title: spec.subjectTitle, required: true, initialValue: {type: 'input'}}),
      defineField({type: 'string', name: 'decision', title: 'Decision'}),
      defineField({type: 'actor', name: 'decidedBy', title: 'Decided by'}),
      defineField({type: 'datetime', name: 'decidedAt', title: 'Decided at'}),
    ],
    stages: [
      defineStage({
        name: spec.waiting.name,
        title: spec.waiting.title,
        description: spec.waiting.description,
        activities: [
          defineActivity({
            name: 'review',
            title: 'A person reviews it',
            actions: [decide('approve', 'approved', 'Approve'), decide('reject', 'rejected', 'Reject')],
          }),
        ],
        transitions: [
          defineTransition({name: 'to-approved', title: 'Approved', to: 'approved', when: '$fields.decision == "approved"'}),
          defineTransition({name: 'to-rejected', title: 'Rejected', to: 'rejected', when: '$fields.decision == "rejected"'}),
        ],
      }),
      defineStage({name: 'approved', title: 'Approved', description: 'A person approved it.'}),
      defineStage({name: 'rejected', title: 'Rejected', description: 'A person rejected it.'}),
    ],
  })
}

export const clusterReview = reviewWorkflow({
  name: 'cluster-review',
  title: 'Cluster review',
  description: 'A proposed merge of complaints into one pet, proposed by the rule or the agent and decided by a person.',
  subjectTitle: 'Cluster decision',
  waiting: {name: 'proposed', title: 'Proposed', description: 'Waiting for a person to approve or reject the merge.'},
})

export const adoptionModeration = reviewWorkflow({
  name: 'adoption-moderation',
  title: 'Adoption moderation',
  description: 'A visitor adoption message, hidden from the public until a person approves it.',
  subjectTitle: 'Adoption',
  waiting: {name: 'submitted', title: 'Submitted', description: 'Hidden from the public until a person decides.'},
})

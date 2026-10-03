import type {StructureResolver} from 'sanity/structure'
import {OUTCOMES} from '@pothole/sync/domain'

export const structure: StructureResolver = (S) =>
  S.list()
    .title('Pothole Adoption Agency')
    .items([
      S.listItem()
        .title('Pets by outcome')
        .child(
          S.list()
            .title('Pets by outcome')
            .items([
              ...OUTCOMES.map(({value, title}) =>
                S.listItem()
                  .id(`outcome-${value}`)
                  .title(title)
                  .child(S.documentList().title(title).schemaType('pothole').filter('_type == "pothole" && outcome == $outcome').params({outcome: value})),
              ),
              S.divider(),
              S.listItem()
                .id('strays')
                .title('Lost strays (no coordinates)')
                .child(S.documentList().title('Lost strays').schemaType('pothole').filter('_type == "pothole" && hasCoordinates == false')),
              S.documentTypeListItem('pothole').title('All pets'),
            ]),
        ),
      S.divider(),
      S.listItem()
        .title('Staff queues')
        .child(
          S.list()
            .title('Staff queues')
            .items([
              S.listItem()
                .id('cluster-proposed')
                .title('Clusters awaiting review')
                .child(S.documentList().title('Proposed clusters').schemaType('clusterDecision').filter('_type == "clusterDecision" && decision == "proposed"')),
              S.listItem()
                .id('adoption-submitted')
                .title('Adoptions awaiting moderation')
                .child(S.documentList().title('Submitted adoptions').schemaType('adoption').filter('_type == "adoption" && moderation == "submitted"')),
              S.documentTypeListItem('resolutionMapping').title('Resolution mappings'),
            ]),
        ),
      S.divider(),
      S.documentTypeListItem('complaint311').title('311 complaints (raw, read-only)'),
      S.documentTypeListItem('statusEvent').title('Status events'),
      S.documentTypeListItem('syncRun').title('Sync runs'),
      S.divider(),
      S.documentTypeListItem('clusterDecision').title('All cluster decisions'),
      S.documentTypeListItem('adoption').title('All adoptions'),
    ])

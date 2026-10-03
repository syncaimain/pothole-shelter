import {defineField, defineType} from 'sanity'

// The 311 columns verified live on 2026-10-03 (docs/BUILD_LOG.md §2).
// Socrata returns every value as a string except `location`, and omits empty ones.
const RAW_STRING_FIELDS = [
  'unique_key', 'created_date', 'closed_date', 'agency', 'agency_name', 'complaint_type',
  'descriptor', 'descriptor_2', 'location_type', 'incident_zip', 'incident_address',
  'street_name', 'cross_street_1', 'cross_street_2', 'intersection_street_1',
  'intersection_street_2', 'address_type', 'city', 'landmark', 'facility_type', 'status',
  'due_date', 'resolution_description', 'resolution_action_updated_date', 'community_board',
  'council_district', 'police_precinct', 'bbl', 'borough', 'x_coordinate_state_plane',
  'y_coordinate_state_plane', 'open_data_channel_type', 'park_facility_name', 'park_borough',
  'vehicle_type', 'taxi_company_borough', 'taxi_pick_up_location', 'bridge_highway_name',
  'bridge_highway_direction', 'road_ramp', 'bridge_highway_segment', 'latitude', 'longitude',
]

/**
 * One NYC 311 service request, stored exactly as Socrata returned it.
 * `raw` is never edited by hand or by any code path except the sync, and the
 * sync only rewrites it when `rawHash` changes. Pet fields live on `pothole`.
 */
export const complaint311 = defineType({
  name: 'complaint311',
  title: '311 complaint (raw)',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({
      name: 'raw',
      title: 'Raw 311 record',
      description: 'Verbatim row from the NYC Open Data SODA API (dataset erm2-nwe9). Never edited.',
      type: 'object',
      fields: [
        ...RAW_STRING_FIELDS.map((name) => defineField({name, type: 'string'})),
        defineField({
          name: 'location',
          type: 'object',
          fields: [
            defineField({name: 'type', type: 'string'}),
            defineField({name: 'coordinates', type: 'array', of: [{type: 'number'}]}),
          ],
        }),
      ],
    }),
    defineField({name: 'rawHash', title: 'SHA-256 of the raw record', type: 'string'}),
    defineField({name: 'sourceUrl', title: 'Source row URL', type: 'url'}),
    defineField({
      name: 'sourceUpdatedAt',
      title: 'Socrata :updated_at',
      description: 'Socrata system field, kept outside `raw` because it is not part of the record.',
      type: 'datetime',
    }),
    defineField({name: 'firstSyncedAt', type: 'datetime'}),
    defineField({name: 'syncedAt', title: 'Last synced (raw changed)', type: 'datetime'}),
  ],
  preview: {
    select: {key: 'raw.unique_key', street: 'raw.street_name', status: 'raw.status', created: 'raw.created_date'},
    prepare: ({key, street, status, created}) => ({
      title: `#${key} · ${street ?? 'no street'}`,
      subtitle: `${status ?? '?'} · filed ${created?.slice(0, 10) ?? '?'}`,
    }),
  },
  orderings: [{title: 'Filed, newest first', name: 'createdDesc', by: [{field: 'raw.created_date', direction: 'desc'}]}],
})

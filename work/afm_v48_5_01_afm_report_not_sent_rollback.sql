-- Rollback for work/afm_v48_5_01_afm_report_not_sent.sql.
-- Restores the v48.2 view definitions (open = regex on generate-final-report, samples-date from 30 days ago).
-- NOT APPLIED. Does not drop the views and does not touch any table rows or Podio.

create or replace view public.v_field_afm_events with (security_invoker = false, security_barrier = true) as
select pi.item_id, pi.title, pi.last_edit_on, pi.synced_at,
       jsonb_build_object(
         'project', pi.fields->'project', 'reference-3', pi.fields->'reference-3', 'job-number', pi.fields->'job-number',
         'afm-title', pi.fields->'afm-title', 'samples-date', pi.fields->'samples-date',
         'company', pi.fields->'company', 'first-name', pi.fields->'first-name', 'last-name', pi.fields->'last-name',
         'job-role', pi.fields->'job-role', 'contact-number', pi.fields->'contact-number', 'email', pi.fields->'email',
         'site-contact-namephone', pi.fields->'site-contact-namephone', 'job-location', pi.fields->'job-location',
         'task-description', pi.fields->'task-description', 'selection', pi.fields->'selection',
         'calculation', pi.fields->'calculation', 'monitoring-type', pi.fields->'monitoring-type',
         'rotameter', pi.fields->'rotameter', 'samples-collected-by', pi.fields->'samples-collected-by',
         'generate-report', pi.fields->'generate-report', 'send-report', pi.fields->'send-report',
         'generate-final-report', pi.fields->'generate-final-report', 'editable-site-plan-link', pi.fields->'editable-site-plan-link'
       ) as fields
from public.podio_items pi
where pi.app_id = 21120412
  and not coalesce(pi.is_deleted_in_source, false)
  and coalesce(pi.fields->>'generate-final-report', '') !~* '(report generated|report sent|invoiced|cancel|lab results loaded)'
  and coalesce(pi.fields->>'generate-report', '') !~* 'cancel'
  and coalesce(left(pi.fields->'samples-date'->>'start', 10), '9999-12-31') >= to_char(((now() at time zone 'Australia/Perth')::date - 30), 'YYYY-MM-DD')
  and public.is_envss_staff();

create or replace view public.v_field_afm_samples with (security_invoker = false, security_barrier = true) as
select s.item_id, (s.fields->'job-site'->>'item_id') as event_item_id, s.title, s.last_edit_on, s.synced_at,
       jsonb_build_object(
         'job-site', s.fields->'job-site', 'sample-number', s.fields->'sample-number', 'default', s.fields->'default',
         'cowl', s.fields->'cowl', 'cowl-number', s.fields->'cowl-number',
         'equipment', s.fields->'equipment', 'pump-number-2', s.fields->'pump-number-2', 'pump-number', s.fields->'pump-number',
         'rotameter', s.fields->'rotameter', 'location-3', s.fields->'location-3', 'monitoring-type', s.fields->'monitoring-type',
         'start-flow-rate', s.fields->'start-flow-rate', 'end-flow-rate', s.fields->'end-flow-rate',
         'sample-start-2', s.fields->'sample-start-2', 'sample-end-2', s.fields->'sample-end-2',
         'sample-by', s.fields->'sample-by', 'pump-failed', s.fields->'pump-failed', 'referenece', s.fields->'referenece'
       ) as fields
from public.podio_items s
where s.app_id = 21120488
  and not coalesce(s.is_deleted_in_source, false)
  and (s.fields->'job-site'->>'item_id') in (select e.item_id::text from public.v_field_afm_events e)
  and public.is_envss_staff();

comment on view public.v_field_afm_events is 'ENVSS Field v49: read-only open AFM Events (Podio app 21120412) from the podio_items mirror. Staff only. Never written back to Podio.';
comment on view public.v_field_afm_samples is 'ENVSS Field v49: read-only AFM Samples (Podio app 21120488) linked to open AFM Events, from the podio_items mirror. Staff only. Never written back to Podio.';

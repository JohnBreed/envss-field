-- Applied 11 Nov 2026 00:50 AWST to luyprcmjyruznluboyms (ENVSS Field v46, E18). Additive only.
-- Read-only view of HYG Assessment Events (Podio app 24280319) from the Dashboard Bot mirror. Staff only; anon gets nothing.
create or replace view public.v_field_hyg_events with (security_invoker = false) as
select pi.item_id, pi.title, pi.last_edit_on, pi.synced_at,
       jsonb_build_object(
         'project', pi.fields->'project', 'reference-3', pi.fields->'reference-3', 'job-number', pi.fields->'job-number',
         'site-works-start-date', pi.fields->'site-works-start-date', 'site-works-start-date-status', pi.fields->'site-works-start-date-status',
         'site-contact-namephone', pi.fields->'site-contact-namephone', 'company', pi.fields->'company',
         'first-name', pi.fields->'first-name', 'last-name', pi.fields->'last-name', 'job-role', pi.fields->'job-role',
         'contact-number', pi.fields->'contact-number', 'email', pi.fields->'email', 'task-description', pi.fields->'task-description',
         'selection', pi.fields->'selection', 'which-laboratory-is-processing-samples', pi.fields->'which-laboratory-is-processing-samples',
         'report-submitted-by', pi.fields->'report-submitted-by', 'generate-report', pi.fields->'generate-report',
         'generate-final-report', pi.fields->'generate-final-report', 'equipment-details', pi.fields->'equipment-details',
         'google-drive-job-folder-link', pi.fields->'google-drive-job-folder-link', 'field-sheet-link', pi.fields->'field-sheet-link'
       ) as fields
from public.podio_items pi
where pi.app_id = 24280319 and not coalesce(pi.is_deleted_in_source, false) and public.is_envss_staff();
revoke all on public.v_field_hyg_events from public, anon;
grant select on public.v_field_hyg_events to authenticated;
comment on view public.v_field_hyg_events is 'ENVSS Field v46 E18: read-only HYG Assessment Events (Podio app 24280319) from the podio_items mirror. Staff only via is_envss_staff(). Never written back to Podio.';

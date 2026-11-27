-- APPLIED 26 Nov 2026 6:31 pm AWST to Supabase luyprcmjyruznluboyms (migration hyg_v48_14_01_podio_events_view), with v48.14 going live. ENVSS Field v48.14: auto-create field events from the NEW Podio event apps John is creating in
-- "1.6 ENVSS Project Events" (26 Nov 2026 AWST): Occ Noise Event (30888380), Vent Survey Event (30888385), Onsite RFT Event (30888384).
-- Read only, staff only, additive (one new view; v_field_hyg_events is unchanged). Rollback: hyg_v48_14_01_podio_events_view_rollback.sql
-- (Checked before applying; kept for the record) the Podio sync must copy the new apps into podio_items (check: select app_id, app_name, count(*)
--   from podio_items where app_id in (30888380,30888384,30888385) group by 1,2). App ids resolved read-only 26 Nov 2026 3:30 pm AWST;
--   the same ids are in PODIO_EVENT_APPS in field.html. Until this view exists the field app gets 404 and ignores the new apps.
create or replace view public.v_field_podio_events with (security_invoker = false) as
select pi.app_id, pi.item_id, pi.title, pi.last_edit_on, pi.synced_at, pi.fields
from public.podio_items pi
where pi.app_id = any (array[
        30888380,  -- Occ Noise Event
        30888385,  -- Vent Survey Event
        30888384   -- Onsite RFT Event
      ]::bigint[])
  and not coalesce(pi.is_deleted_in_source, false)
  and public.is_envss_staff();
revoke all on public.v_field_podio_events from public, anon;
grant select on public.v_field_podio_events to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_field_podio_events from authenticated, anon, public;
alter view public.v_field_podio_events set (security_barrier = true);
comment on view public.v_field_podio_events is 'ENVSS Field v48.14: live items of the extra Podio event apps (Occ Noise, Ventilation Survey, Onsite Respirator Fit Test) from the podio_items mirror. Staff only, read only. Used by auto-create.';

-- DRAFT, NOT APPLIED. ENVSS Field v48.7 (open item 11, auto-create field events from Podio). 23 Nov 2026 AWST.
-- OPTIONAL. The app works without it: when a linked Podio HYG event disappears from v_field_hyg_events the app says
-- "no longer in Podio (deleted, or the Podio copy no longer lists it)". With this view it can say "deleted in Podio".
-- Read only, staff only, additive (one new view; nothing else changes). Rollback: hyg_v48_7_01_deleted_view_rollback.sql
create or replace view public.v_field_hyg_deleted with (security_invoker = false) as
select pi.item_id, pi.last_edit_on, pi.synced_at
from public.podio_items pi
where pi.app_id = 24280319 and coalesce(pi.is_deleted_in_source, false) and public.is_envss_staff();
revoke all on public.v_field_hyg_deleted from public, anon;
grant select on public.v_field_hyg_deleted to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_field_hyg_deleted from authenticated, anon, public;
alter view public.v_field_hyg_deleted set (security_barrier = true);
comment on view public.v_field_hyg_deleted is 'ENVSS Field v48.7: Podio HYG Assessment Events (app 24280319) deleted in Podio, from the podio_items mirror. Staff only, read only. Used only to word the review flag.';

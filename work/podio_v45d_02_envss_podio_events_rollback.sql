-- podio_v45d_02_envss_podio_events_rollback.sql
-- DRAFT ONLY. Drops the read model. Does not touch Podio or podio_items.

begin;

drop policy if exists envss_podio_events_staff_select on public.envss_podio_events;
drop table if exists public.envss_podio_events;

commit;

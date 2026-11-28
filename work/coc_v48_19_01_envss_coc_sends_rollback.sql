-- coc_v48_19_01_envss_coc_sends_rollback.sql
-- DRAFT ONLY. Drops the CoC send queue / log. Emails already sent are not recalled. Files in field-exports are left alone.
begin;
drop trigger if exists envss_coc_sends_before_insert on public.envss_coc_sends;
drop function if exists public.envss_coc_sends_before_insert();
drop policy if exists envss_coc_sends_staff_select on public.envss_coc_sends;
drop policy if exists envss_coc_sends_staff_insert on public.envss_coc_sends;
drop table if exists public.envss_coc_sends;
commit;

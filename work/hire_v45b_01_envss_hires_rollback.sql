-- hire_v45b_01_envss_hires_rollback.sql
-- DRAFT ONLY. DO NOT APPLY until John approves a rollback.
-- Drops the envss_hires table and its staff policies. Data is lost.
begin;
drop policy if exists envss_hires_staff_select on public.envss_hires;
drop policy if exists envss_hires_staff_insert on public.envss_hires;
drop policy if exists envss_hires_staff_update on public.envss_hires;
drop table if exists public.envss_hires;
commit;

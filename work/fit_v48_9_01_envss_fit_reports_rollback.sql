-- Rollback for fit_v48_9_01_envss_fit_reports.sql
-- Only drop the table created by that migration. Do not apply unless rolling v48.9 back.
begin;
drop policy if exists envss_fit_reports_staff_select on public.envss_fit_reports;
drop policy if exists envss_fit_reports_staff_insert on public.envss_fit_reports;
drop policy if exists envss_fit_reports_staff_update on public.envss_fit_reports;
drop table if exists public.envss_fit_reports;
commit;

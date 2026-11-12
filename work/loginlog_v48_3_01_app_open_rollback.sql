-- loginlog_v48_3_01_app_open_rollback.sql
-- Undo work/loginlog_v48_3_01_app_open.sql. DRAFT ONLY. Run only if John asks.
-- Note: the v45e event check cannot come back while app_open / app_resume rows exist, so step 2 deletes ONLY those rows
-- (sign_in / daily_open / sign_out rows are kept). Export them first if they are wanted:
--   select * from public.envss_login_log where event in ('app_open','app_resume');
begin;
drop function if exists public.envss_log_app_open(jsonb);
delete from public.envss_login_log where event in ('app_open', 'app_resume');
alter table public.envss_login_log drop constraint if exists envss_login_log_event_check;
alter table public.envss_login_log add constraint envss_login_log_event_check
  check (event in ('sign_in', 'daily_open', 'sign_out'));
drop index if exists public.envss_login_log_email_occurred;
alter table public.envss_login_log
  drop column if exists device_type,
  drop column if exists os,
  drop column if exists os_version,
  drop column if exists browser_version,
  drop column if exists display_mode,
  drop column if exists extra;
commit;

-- loginlog_v45e_01_rollback.sql
-- Rollback for loginlog_v45e_01_table.sql. Safe to run only if that migration was applied.
-- Written 2026-11-09 (Australia/Perth / AWST). Project luyprcmjyruznluboyms.
-- Drops the login log table and its policies. Does not touch envss_admins, is_envss_staff,
-- or any other envss_* table. Login rows (if any) are permanently removed.

begin;

drop policy if exists envss_login_log_staff_insert on public.envss_login_log;
drop policy if exists envss_login_log_admin_select on public.envss_login_log;
drop table if exists public.envss_login_log;

commit;

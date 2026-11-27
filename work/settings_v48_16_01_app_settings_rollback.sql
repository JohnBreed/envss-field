-- Rollback for settings_v48_16_01_app_settings.sql. The field app treats a missing table as "no minimum" (fails open),
-- so this can be run at any time. It only drops the new settings table; no other table or row is touched.
drop policy if exists app_settings_staff_read on public.app_settings;
drop table if exists public.app_settings;

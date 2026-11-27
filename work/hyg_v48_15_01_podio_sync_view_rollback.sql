-- Rollback for hyg_v48_15_01_podio_sync_view.sql. The field app treats a missing view as "no check time" (shows Last Podio change only).
drop view if exists public.v_field_podio_sync;

-- Rollback for hyg_v48_14_01_podio_events_view.sql (DRAFT, NOT APPLIED). The field app treats a missing view as "no extra apps".
drop view if exists public.v_field_podio_events;

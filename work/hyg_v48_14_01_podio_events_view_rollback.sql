-- Rollback for hyg_v48_14_01_podio_events_view.sql (the view was applied 26 Nov 2026 AWST; run this only to roll it back). The field app treats a missing view as "no extra apps".
drop view if exists public.v_field_podio_events;

-- Rollback for work/afm_v49_01_afm_podio_views.sql (drops only the two v49 views; no data is touched).
drop view if exists public.v_field_afm_samples;
drop view if exists public.v_field_afm_events;

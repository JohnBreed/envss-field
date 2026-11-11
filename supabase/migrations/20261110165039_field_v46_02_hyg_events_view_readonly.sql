-- Applied 11 Nov 2026 00:50 AWST. Default privileges had granted write on the new view; make it strictly read-only.
revoke insert, update, delete, truncate, references, trigger on public.v_field_hyg_events from authenticated, anon, public;
alter view public.v_field_hyg_events set (security_barrier = true);

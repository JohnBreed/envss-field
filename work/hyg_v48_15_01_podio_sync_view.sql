-- DRAFT, NOT APPLIED. ENVSS Field v48.15: lets the field app say "Checked Podio 9:02 am" (when the Podio sync last read the
-- Podio event apps). Staff cannot read podio_sync_state / podio_sync_log (RLS on, no grants to authenticated), so this
-- exposes only the per-app last-check time of the four event apps. Read only, staff only, additive.
-- Rollback: hyg_v48_15_01_podio_sync_view_rollback.sql. Until it exists the app shows "Last Podio change …" only (404 is cached 6 h).
create or replace view public.v_field_podio_sync with (security_invoker = false) as
select s.app_id, s.last_incremental_at as checked_at
from public.podio_sync_state s
where s.app_id = any (array[
        24280319,  -- HYG Assessment Events
        30888380,  -- Occ Noise Event
        30888385,  -- Vent Survey Event
        30888384   -- Onsite RFT Event
      ]::bigint[])
  and public.is_envss_staff();
revoke all on public.v_field_podio_sync from public, anon;
grant select on public.v_field_podio_sync to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.v_field_podio_sync from authenticated, anon, public;
alter view public.v_field_podio_sync set (security_barrier = true);
comment on view public.v_field_podio_sync is 'ENVSS Field v48.15: when the Podio sync last read each Podio event app (HYG, Occ Noise, Vent Survey, Onsite RFT). Staff only, read only.';

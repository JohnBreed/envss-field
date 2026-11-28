-- DRAFT, NOT APPLIED. ENVSS Field v48.19: close the signed-out access gap (John t699u, 28 Nov 2026 AWST: "yep, lets do that").
-- Rollback: lockdown_v48_19_01_signed_in_staff_only_rollback.sql
--
-- Problem: these tables each carry an "anon, ALL, true" policy, so anyone holding the app's public key (it is in config.js) can
-- READ, INSERT, UPDATE and DELETE rows with no sign-in:  envss_projects, envss_events, envss_trains, envss_deletions, envss_state.
-- (Plus storage: anon may INSERT photos into the field-photos bucket under a strict path pattern.)
-- The signed-in staff rules already exist and stay exactly as they are (is_envss_staff(): authenticated, not anonymous,
-- email ends @envss.com.au). Nothing is created, so the signed-in app path does not change at all:
--   envss_projects   staff select / insert (non-podio rows only) / update (non-podio rows only)
--   envss_events, envss_trains, envss_deletions   staff select / insert / update
--   envss_login_log  staff insert own row, admin-only select (untouched)
--   envss_state      empty (0 rows), not used by the app: after this only the service role can touch it.
-- No staff delete policy exists today and none is added (the app tombstones via envss_deletions, it never deletes rows).
-- Data: no table dropped, no row touched. Policies and anon grants only.
--
-- Lock note: DROP POLICY / REVOKE take a very short exclusive lock on each table. Apply when no one is mid-save, it is milliseconds.

-- 1. Remove the signed-out "ALL / true" rules.
drop policy if exists envss_projects_all  on public.envss_projects;
drop policy if exists envss_events_all    on public.envss_events;
drop policy if exists envss_trains_all    on public.envss_trains;
drop policy if exists envss_deletions_all on public.envss_deletions;
drop policy if exists envss_state_read    on public.envss_state;
drop policy if exists envss_state_write   on public.envss_state;

-- 2. Belt and braces: the signed-out role gets no table privileges at all on those tables (RLS alone is enough, this
--    means a future mistaken policy cannot reopen them). Signed-in grants are not touched.
revoke all on table public.envss_projects, public.envss_events, public.envss_trains, public.envss_deletions, public.envss_state from anon;

-- 3. Signed-out photo uploads: the app uploads with the staff session (sbFetch), the staff insert policy stays.
drop policy if exists field_photos_anon_insert on storage.objects;

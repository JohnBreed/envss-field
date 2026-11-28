-- Rollback for lockdown_v48_19_01_signed_in_staff_only.sql. Puts the signed-out rules and grants back exactly as they were on 28 Nov 2026.
-- Safe at any time; touches no row.
create policy envss_projects_all  on public.envss_projects  as permissive for all to anon using (true) with check (true);
create policy envss_events_all    on public.envss_events    as permissive for all to anon using (true) with check (true);
create policy envss_trains_all    on public.envss_trains    as permissive for all to anon using (true) with check (true);
create policy envss_deletions_all on public.envss_deletions as permissive for all to anon using (true) with check (true);
create policy envss_state_read    on public.envss_state     as permissive for select to anon using (true);
create policy envss_state_write   on public.envss_state     as permissive for all to anon using (true) with check (true);
grant delete, insert, references, select, trigger, truncate, update
  on table public.envss_projects, public.envss_events, public.envss_trains, public.envss_deletions, public.envss_state to anon;
create policy field_photos_anon_insert on storage.objects as permissive for insert to anon
  with check ((bucket_id = 'field-photos'::text) AND (name ~ '^(_test/)?p/[A-Za-z0-9_-]{1,64}/e/[A-Za-z0-9_-]{1,64}/t/[A-Za-z0-9_-]{1,64}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'::text));

-- TEST HARNESS for lockdown_v48_19_*. Runs entirely inside BEGIN ... ROLLBACK: nothing persists. Run with a role that can SET ROLE (postgres).
-- Stages: before -> apply part A -> after_A -> apply part B -> after_AB -> apply both rollbacks -> after_rollback (must equal before).
begin;
create temp table res(n serial, stage text, who text, test text, result text);
grant all on res to public; grant all on res_n_seq to public;
create or replace function pg_temp.t(p_stage text, p_who text, p_test text, p_sql text, p_mode text default 'count') returns void language plpgsql as $f$
declare v bigint; r text; claims text; email text; rl text := 'authenticated';
begin
  email := case p_who when 'staff' then 'staff.test@envss.com.au' when 'nonenvss' then 'someone@example.com' when 'anonsignin' then 'staff.test@envss.com.au' else null end;
  if p_who = 'admin' then select a.email into email from public.envss_admins a limit 1; end if;
  if p_who = 'anon' then rl := 'anon'; claims := json_build_object('role','anon')::text;
  else claims := json_build_object('role','authenticated','email',email,'sub','00000000-0000-0000-0000-0000000000aa','is_anonymous', p_who = 'anonsignin')::text; end if;
  perform set_config('request.jwt.claims', claims, true);
  perform set_config('role', rl, true);
  begin
    if p_mode = 'count' then execute 'select count(*) from ' || p_sql into v; r := v::text;
    else execute p_sql; get diagnostics v = row_count; r := 'ok rows=' || v; end if;
  exception when others then r := 'DENIED/ERR ' || sqlstate || ' ' || left(sqlerrm, 60); end;
  reset role;
  insert into res(stage, who, test, result) values (p_stage, p_who, p_test, r);
end $f$;
create or replace function pg_temp.suite(p_stage text) returns void language plpgsql as $f$
declare w text; tb text;
begin
  foreach w in array array['anon','staff','nonenvss','anonsignin','admin'] loop
    foreach tb in array array['envss_projects','envss_events','envss_trains','envss_deletions','envss_state','envss_hires','envss_fit_reports','envss_drive_copies','app_settings','envss_login_log','envss_admins','v_field_pumps','v_field_hyg_events','v_field_podio_events','v_field_podio_sync','v_field_afm_events','v_field_afm_samples','v_dash_projects','v_dash_invoices','v_dash_leads','v_dash_fit_tests','v_dash_apps'] loop
      perform pg_temp.t(p_stage, w, 'SELECT count ' || tb, 'public.' || tb);
    end loop;
  end loop;
  -- signed-out writes (use ids that do not exist, so a success changes nothing real even before rollback)
  perform pg_temp.t(p_stage,'anon','W events insert',$q$insert into public.envss_events(id,project_id,payload,updated_at,updated_by) values('zz-lock-ev','zz','{}',now(),'t')$q$,'dml');
  perform pg_temp.t(p_stage,'anon','W events update',$q$update public.envss_events set updated_by='t' where id='zz-none'$q$,'dml');
  perform pg_temp.t(p_stage,'anon','W events delete',$q$delete from public.envss_events where id='zz-none'$q$,'dml');
  perform pg_temp.t(p_stage,'anon','W trains insert',$q$insert into public.envss_trains(id,event_id,payload,updated_at,updated_by) values('zz-lock-tr','zz','{}',now(),'t')$q$,'dml');
  perform pg_temp.t(p_stage,'anon','W trains delete',$q$delete from public.envss_trains where id='zz-none'$q$,'dml');
  perform pg_temp.t(p_stage,'anon','W projects insert',$q$insert into public.envss_projects(id,payload,updated_at,updated_by) values('zz-lock-pr','{}',now(),'t')$q$,'dml');
  perform pg_temp.t(p_stage,'anon','W projects delete',$q$delete from public.envss_projects where id='zz-none'$q$,'dml');
  perform pg_temp.t(p_stage,'anon','W deletions insert',$q$insert into public.envss_deletions(id,event_id,payload,updated_at,updated_by) values('zz-lock-de','zz','{}',now(),'t')$q$,'dml');
  perform pg_temp.t(p_stage,'anon','W state insert',$q$insert into public.envss_state(id,payload,updated_at,updated_by) values('zz-lock-st','{}',now(),'t')$q$,'dml');
  perform pg_temp.t(p_stage,'anon','W login_log insert',$q$insert into public.envss_login_log(user_id,email,event,occurred_at,local_date,client_event_id) values('00000000-0000-0000-0000-0000000000aa','staff.test@envss.com.au','sign_in',now(),current_date,gen_random_uuid()::text)$q$,'dml');
  perform pg_temp.t(p_stage,'anon','W photo upload (storage insert)',$q$insert into storage.objects(bucket_id,name) values('field-photos','_test/p/a/e/b/t/c/' || gen_random_uuid() || '.jpg')$q$,'dml');
  -- signed-in staff writes: exactly what the app does
  perform pg_temp.t(p_stage,'staff','W events upsert (insert path)',$q$insert into public.envss_events(id,project_id,payload,updated_at,updated_by) values('zz-lock-ev2','zz','{"a":1}',now(),'t') on conflict (id) do update set payload=excluded.payload, updated_at=excluded.updated_at$q$,'dml');
  perform pg_temp.t(p_stage,'staff','W events upsert (update path)',$q$insert into public.envss_events(id,project_id,payload,updated_at,updated_by) values('zz-lock-ev2','zz','{"a":2}',now(),'t') on conflict (id) do update set payload=excluded.payload, updated_at=excluded.updated_at$q$,'dml');
  perform pg_temp.t(p_stage,'staff','W events update',$q$update public.envss_events set updated_by='t2' where id='zz-lock-ev2'$q$,'dml');
  perform pg_temp.t(p_stage,'staff','W trains upsert (insert path)',$q$insert into public.envss_trains(id,event_id,payload,updated_at,updated_by) values('zz-lock-tr2','zz','{"a":1}',now(),'t') on conflict (id) do update set payload=excluded.payload$q$,'dml');
  perform pg_temp.t(p_stage,'staff','W trains upsert (update path)',$q$insert into public.envss_trains(id,event_id,payload,updated_at,updated_by) values('zz-lock-tr2','zz','{"a":2}',now(),'t') on conflict (id) do update set payload=excluded.payload$q$,'dml');
  perform pg_temp.t(p_stage,'staff','W deletions insert (tombstone)',$q$insert into public.envss_deletions(id,event_id,payload,updated_at,updated_by) values('zz-lock-de2','zz','{}',now(),'t') on conflict (id) do update set payload=excluded.payload$q$,'dml');
  perform pg_temp.t(p_stage,'staff','W field-project insert',$q$insert into public.envss_projects(id,payload,updated_at,updated_by) values('zz-lock-pr2','{"source":"field"}',now(),'t') on conflict (id) do update set payload=excluded.payload$q$,'dml');
  perform pg_temp.t(p_stage,'staff','W field-project update',$q$update public.envss_projects set updated_by='t2' where id='zz-lock-pr2'$q$,'dml');
  perform pg_temp.t(p_stage,'staff','W podio-project insert (must stay blocked)',$q$insert into public.envss_projects(id,payload,updated_at,updated_by) values('podio-zz','{"source":"podio"}',now(),'t')$q$,'dml');
  perform pg_temp.t(p_stage,'staff','W podio-project update (must stay 0 rows)',$q$update public.envss_projects set updated_by='t2' where id=(select id from public.envss_projects where id like 'podio-%' limit 1)$q$,'dml');
  perform pg_temp.t(p_stage,'staff','W login_log insert own row',$q$insert into public.envss_login_log(user_id,email,event,occurred_at,local_date,client_event_id) values('00000000-0000-0000-0000-0000000000aa','staff.test@envss.com.au','sign_in',now(),current_date,gen_random_uuid()::text)$q$,'dml');
  perform pg_temp.t(p_stage,'staff','W login_log insert as someone else (must stay blocked)',$q$insert into public.envss_login_log(user_id,email,event,occurred_at,local_date,client_event_id) values('00000000-0000-0000-0000-0000000000bb','other@envss.com.au','sign_in',now(),current_date,gen_random_uuid()::text)$q$,'dml');
  perform pg_temp.t(p_stage,'staff','W photo upload (storage insert)',$q$insert into storage.objects(bucket_id,name) values('field-photos','_test/p/a/e/b/t/c/' || gen_random_uuid() || '.jpg')$q$,'dml');
  perform pg_temp.t(p_stage,'nonenvss','W events insert (must be blocked)',$q$insert into public.envss_events(id,project_id,payload,updated_at,updated_by) values('zz-lock-ev3','zz','{}',now(),'t')$q$,'dml');
  perform pg_temp.t(p_stage,'nonenvss','W login_log insert (must be blocked)',$q$insert into public.envss_login_log(user_id,email,event,occurred_at,local_date,client_event_id) values('00000000-0000-0000-0000-0000000000aa','someone@example.com','sign_in',now(),current_date,gen_random_uuid()::text)$q$,'dml');
  perform pg_temp.t(p_stage,'staff','RPC envss_log_app_open',$q$select public.envss_log_app_open('{"event":"app_open","app_version":"48.19"}'::jsonb)$q$,'dml');
  perform pg_temp.t(p_stage,'anon','RPC envss_log_app_open (must be blocked)',$q$select public.envss_log_app_open('{"event":"app_open","app_version":"48.19"}'::jsonb)$q$,'dml');
end $f$;
create or replace function pg_temp.clean() returns void language plpgsql as $f$ begin
  delete from public.envss_events where id like 'zz-lock%'; delete from public.envss_trains where id like 'zz-lock%'; delete from public.envss_deletions where id like 'zz-lock%';
  delete from public.envss_projects where id like 'zz-lock%'; delete from public.envss_state where id like 'zz-lock%';
  delete from public.envss_login_log where email in ('staff.test@envss.com.au','someone@example.com','other@envss.com.au');
end $f$;
select pg_temp.suite('before');
select pg_temp.clean();

-- ===== apply part A =====
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

select pg_temp.suite('after_A');
select pg_temp.clean();
-- ===== apply part B =====
-- DRAFT, NOT APPLIED. ENVSS Field v48.19, PART B (apply separately from part A): the Dashboard Bot's mirror views.
-- These views run with the owner's rights (no RLS) and anon has SELECT, so with only the public key anyone can read:
--   v_dash_invoices (9,035 rows: invoice amounts, due/paid dates), v_dash_leads (15,654: client, job value, lead controller),
--   v_dash_projects (7,558: job value, organisation, controller), v_dash_fit_tests (7,588), v_dash_apps (196), v_field_pumps (107).
-- The field app does not read v_dash_* at all (authenticated has no grant on them). v_field_pumps IS read by the app, after sign-in,
-- and authenticated keeps its grant.
-- *** DO NOT APPLY until we know what else reads v_dash_*. If the Dashboard Bot or a finance/CFO bot reads these with the
-- public key instead of a service/secret key, this revoke breaks it. Check first (see report). ***
-- Rollback: lockdown_v48_19_02_dash_views_staff_only_rollback.sql
revoke select on public.v_dash_apps, public.v_dash_fit_tests, public.v_dash_invoices, public.v_dash_leads, public.v_dash_projects, public.v_field_pumps from anon;

select pg_temp.suite('after_AB');
select pg_temp.clean();
-- ===== rollbacks (B then A) =====
-- Rollback for lockdown_v48_19_02_dash_views_staff_only.sql.
grant select on public.v_dash_apps, public.v_dash_fit_tests, public.v_dash_invoices, public.v_dash_leads, public.v_dash_projects, public.v_field_pumps to anon;
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

select pg_temp.suite('after_rollback');

select who, test,
  max(case when stage='before' then result end) as before,
  max(case when stage='after_A' then result end) as after_a,
  max(case when stage='after_AB' then result end) as after_ab,
  max(case when stage='after_rollback' then result end) as rolled_back,
  (max(case when stage='before' then result end) = max(case when stage='after_rollback' then result end)) as rollback_restores
from res group by who, test order by (who='anon') desc, who, test;
rollback;

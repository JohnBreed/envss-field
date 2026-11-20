-- field_projects_from_podio_01.sql
-- DRAFT, NOT EXECUTED. Project luyprcmjyruznluboyms. Written 2026-11-20 (AWST).
-- Apply only after John approves. This file only CREATES a function; it does not
-- insert or update any rows. After the file is applied, run a dry-run with:
--   select * from public.sync_envss_projects_from_podio(true);
-- and only then, after a second OK from John:
--   select * from public.sync_envss_projects_from_podio(false);
--
-- Why this exists
-- The field app's Refresh projects reads public.envss_projects only. Until 1 Nov 2026
-- 3:27 pm AWST those Podio-sourced rows were written by the old grok.com / Google Cloud
-- "podio-sync" pulls. John paused those pulls on 1 Nov, and trigger
-- public.block_podio_sync_writer() still blocks any write signed updated_by = 'podio-sync'.
-- The Dashboard Bot keeps refreshing public.podio_items, but nothing copies new or changed
-- Occ Hygiene projects into envss_projects. This function is that missing copy step.
--
-- Safety
--   * Occ Hygiene app 21851342 only, and only rows not deleted in Podio.
--   * Inserts missing ACTIVE projects (status is not Closed / Cancelled / On Hold).
--   * Updates existing source = 'podio' and id like 'podio-%' rows when name, site,
--     client, number, status, job type, controller or active flag differ.
--   * Never deletes a row.
--   * Never touches source = 'field' rows, any other id, or envss_deletions tombstones.
--   * Does not set updated_by to 'podio-sync' (that signature stays blocked).
--   * On update, keeps an existing controller email; on insert, uses the most common
--     email already stored for that controller name, or '' if none.
--   * Staff cannot run this: execute is revoked from anon and authenticated.
--   * pg_cron is not installed; no schedule is created. Call it later by hand or from
--     a trusted server job once John approves a schedule.
-- Rollback: work/field_projects_from_podio_01_rollback.sql (drops the function only).

begin;

create or replace function public.sync_envss_projects_from_podio(p_dry_run boolean default true)
returns table(
  action text,
  id text,
  job_number text,
  status text,
  name text
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  writer constant text := 'field-projects-from-podio';
begin
  if lower(btrim(writer)) = 'podio-sync' then
    raise exception 'refusing to write as podio-sync';
  end if;

  drop table if exists pg_temp._sync_envss_projects_plan;
  create temporary table pg_temp._sync_envss_projects_plan on commit drop as
  with emails as (
    select p.payload->>'controller' as controller,
           p.payload->>'controllerEmail' as email,
           count(*) as n
    from public.envss_projects p
    where p.payload->>'source' = 'podio'
      and coalesce(p.payload->>'controllerEmail', '') <> ''
    group by 1, 2
  ),
  best_email as (
    select distinct on (controller) controller, email
    from emails
    order by controller, n desc, email
  ),
  src as (
    select i.item_id,
           i.title as proj_name,
           coalesce(nullif(i.fields->>'project-high-level-status', ''), i.status_label, '') as proj_status,
           coalesce(i.fields->>'job-type', '') as job_type,
           coalesce(i.fields->'envss-project-controller'->>'name', '') as controller,
           coalesce(i.fields->'organization'->>'title', '') as client,
           coalesce(nullif(btrim(regexp_replace(
             replace(replace(coalesce(i.fields->>'project-addresslocation', ''), '&nbsp;', ' '), '&amp;', '&'),
             '<[^>]+>', '', 'g'
           )), ''), '') as site,
           case
             when split_part(coalesce(i.title, ''), '-', 1) ~ '^[0-9A-Za-z]+$'
               then split_part(i.title, '-', 1)
             when coalesce(i.fields->>'job-number', '') ~ '^[0-9A-Za-z]+$'
               then i.fields->>'job-number'
             when coalesce(i.fields->>'job-number', '') ~ '^\d+(\.0)?$'
              and (i.fields->>'job-number')::numeric < 10000000
               then lpad(round((i.fields->>'job-number')::numeric)::text, 7, '0')
             else null
           end as job_number
    from public.podio_items i
    where i.app_id = 21851342
      and not coalesce(i.is_deleted_in_source, false)
  ),
  mapped as (
    select s.item_id,
           ('podio-' || s.item_id::text) as row_id,
           s.job_number,
           s.proj_name,
           s.proj_status,
           s.job_type,
           s.controller,
           s.client,
           s.site,
           (lower(s.proj_status) not in ('closed', 'cancelled', 'on hold')) as is_active
    from src s
    where coalesce(s.job_number, '') <> ''
  )
  select
    m.row_id,
    m.job_number,
    m.proj_status,
    m.proj_name,
    jsonb_build_object(
      'name', m.proj_name,
      'site', m.site,
      'active', m.is_active,
      'client', m.client,
      'number', m.job_number,
      'source', 'podio',
      'status', m.proj_status,
      'jobType', m.job_type,
      'controller', m.controller,
      'podioItemId', m.item_id,
      'controllerEmail', case
        when e.id is not null and coalesce(e.payload->>'controllerEmail', '') <> ''
             and coalesce(e.payload->>'controller', '') is not distinct from m.controller
          then e.payload->>'controllerEmail'
        else coalesce(be.email, '')
      end
    ) as new_payload,
    case
      when e.id is null and m.is_active then 'insert'
      when e.id is null and not m.is_active then 'skip_inactive_insert'
      when e.id like 'podio-%' and e.payload->>'source' = 'podio' then
        case when (
          coalesce(e.payload->>'name', '') is not distinct from m.proj_name
          and replace(coalesce(e.payload->>'site', ''), '&amp;', '&')
              is not distinct from replace(m.site, '&amp;', '&')
          and coalesce(e.payload->>'client', '') is not distinct from m.client
          and coalesce(e.payload->>'number', '') is not distinct from m.job_number
          and coalesce(e.payload->>'status', '') is not distinct from m.proj_status
          and coalesce(e.payload->>'jobType', '') is not distinct from m.job_type
          and coalesce(e.payload->>'controller', '') is not distinct from m.controller
          and (e.payload->>'active')::boolean is not distinct from m.is_active
        ) then 'unchanged' else 'update' end
      else 'skip_non_podio'
    end as planned_action
  from mapped m
  left join public.envss_projects e on e.id = m.row_id
  left join best_email be on be.controller = m.controller;

  return query
  select p.planned_action, p.row_id, p.job_number, p.proj_status, p.proj_name
  from pg_temp._sync_envss_projects_plan p
  where p.planned_action in ('insert', 'update', 'skip_non_podio')
  order by p.planned_action, p.job_number, p.row_id;

  if p_dry_run then
    return;
  end if;

  insert into public.envss_projects (id, payload, updated_at, updated_by)
  select p.row_id, p.new_payload, now(), writer
  from pg_temp._sync_envss_projects_plan p
  where p.planned_action in ('insert', 'update')
  on conflict (id) do update
    set payload = excluded.payload,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    where envss_projects.id like 'podio-%'
      and coalesce(envss_projects.payload->>'source', '') = 'podio'
      and envss_projects.payload is distinct from excluded.payload;
end;
$fn$;

comment on function public.sync_envss_projects_from_podio(boolean) is
  'Copies active Occ Hygiene projects from podio_items into envss_projects. p_dry_run true (default) only lists insert/update/skip rows. Never deletes, never touches source=field rows, never signs writes as podio-sync. Apply/run only with John''s approval.';

revoke all on function public.sync_envss_projects_from_podio(boolean) from public, anon, authenticated;
grant execute on function public.sync_envss_projects_from_podio(boolean) to postgres, service_role;

commit;

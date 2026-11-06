-- hire_v45b_01_envss_hires.sql
-- DRAFT ONLY. DO NOT APPLY until John approves.
-- Written 2026-11-06 (Australia/Perth / AWST). Project luyprcmjyruznluboyms.
-- Purpose: store versioned equipment hire requests from the ENVSS field app.
-- Depends on: public.is_envss_staff() from signin_v45_01_staff_access.sql (apply that first if not already live).
-- Access: signed-in @envss.com.au staff only (JWT email domain). Never authorize via user_metadata.
-- Client roles: select / insert / update. No delete (app keeps history via versions).
-- Sync shape matches envss_events / envss_trains: id + payload + updated_at + updated_by, with denormalised columns for the invoicing bot.
-- The field app stays read-only on Podio-sourced project rows; this table never writes to Podio.
-- v1 does not email Air-Met / NVMS and does not create Google Sheet rows.

begin;

create table if not exists public.envss_hires (
  id               text primary key,
  payload          jsonb not null,
  updated_at       timestamptz not null default now(),
  updated_by       text,
  request_group_id text not null,
  version          integer not null default 1 check (version >= 1),
  is_latest        boolean not null default true,
  supplier         text not null,
  ref_type         text not null check (ref_type in ('job', 'lead')),
  job_number       text,
  lead_number      text,
  project_id       text,                         -- optional link to envss_projects.id when ref_type = job
  on_hire_date     date,
  off_hire_date    date,
  logistics        text check (logistics is null or logistics in ('delivery', 'pickup', 'already_holding')),
  delivery_site    text,                         -- INTERNAL ONLY. Never put on hire-company emails or Xero PO text.
  requested_by     text,
  lines            jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  constraint envss_hires_ref_chk check (
    (ref_type = 'job'  and coalesce(job_number, '')  <> '' and coalesce(lead_number, '') = '')
    or
    (ref_type = 'lead' and coalesce(lead_number, '') <> '' )
  )
);

create index if not exists envss_hires_group_latest
  on public.envss_hires (request_group_id, version desc);
create index if not exists envss_hires_latest
  on public.envss_hires (updated_at desc) where is_latest;
create index if not exists envss_hires_job
  on public.envss_hires (job_number) where job_number is not null;
create index if not exists envss_hires_lead
  on public.envss_hires (lead_number) where lead_number is not null;
create index if not exists envss_hires_project
  on public.envss_hires (project_id) where project_id is not null;

alter table public.envss_hires enable row level security;

revoke all on public.envss_hires from anon;
revoke delete, truncate, references, trigger on public.envss_hires from authenticated;

-- Staff policies mirror envss_events (is_envss_staff). No anon access.
drop policy if exists envss_hires_staff_select on public.envss_hires;
drop policy if exists envss_hires_staff_insert on public.envss_hires;
drop policy if exists envss_hires_staff_update on public.envss_hires;

create policy envss_hires_staff_select on public.envss_hires
  for select to authenticated using (public.is_envss_staff());
create policy envss_hires_staff_insert on public.envss_hires
  for insert to authenticated with check (public.is_envss_staff());
create policy envss_hires_staff_update on public.envss_hires
  for update to authenticated using (public.is_envss_staff()) with check (public.is_envss_staff());

grant select, insert, update on public.envss_hires to authenticated;

commit;

-- Rollback sketch (also not applied):
-- drop policy if exists envss_hires_staff_select on public.envss_hires;
-- drop policy if exists envss_hires_staff_insert on public.envss_hires;
-- drop policy if exists envss_hires_staff_update on public.envss_hires;
-- drop table if exists public.envss_hires;

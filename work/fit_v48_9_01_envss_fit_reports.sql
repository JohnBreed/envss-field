-- fit_v48_9_01_envss_fit_reports.sql
-- Additive only. Does not alter or delete existing tables or rows.
-- Project luyprcmjyruznluboyms. Written 2026-11-25 (Australia/Perth / AWST).
-- Purpose: store respirator fit-test reports captured in the ENVSS Field app (v48.9).
-- Sync shape matches envss_events: id + payload + updated_at + updated_by, with
-- denormalised event_id and project_id for filters. Never written to Podio.
-- Access: signed-in staff via public.is_envss_staff(). No anon access. No client deletes.
-- Photos stay in the existing private bucket field-photos. Generated PDFs/zips go to
-- the existing private bucket field-exports (no new storage policy required).

begin;

create table if not exists public.envss_fit_reports (
  id          text primary key,
  event_id    text,
  project_id  text,
  payload     jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

create index if not exists envss_fit_reports_event
  on public.envss_fit_reports (event_id);
create index if not exists envss_fit_reports_project
  on public.envss_fit_reports (project_id);
create index if not exists envss_fit_reports_updated
  on public.envss_fit_reports (updated_at desc);

alter table public.envss_fit_reports enable row level security;

revoke all on public.envss_fit_reports from anon;
revoke all on public.envss_fit_reports from authenticated;
revoke delete, truncate, references, trigger on public.envss_fit_reports from authenticated;
grant select, insert, update on public.envss_fit_reports to authenticated;

drop policy if exists envss_fit_reports_staff_select on public.envss_fit_reports;
drop policy if exists envss_fit_reports_staff_insert on public.envss_fit_reports;
drop policy if exists envss_fit_reports_staff_update on public.envss_fit_reports;

create policy envss_fit_reports_staff_select on public.envss_fit_reports
  for select to authenticated using (public.is_envss_staff());
create policy envss_fit_reports_staff_insert on public.envss_fit_reports
  for insert to authenticated with check (public.is_envss_staff());
create policy envss_fit_reports_staff_update on public.envss_fit_reports
  for update to authenticated using (public.is_envss_staff()) with check (public.is_envss_staff());

comment on table public.envss_fit_reports is
  'ENVSS Field v48.9: respirator fit-test reports (photo, OCR fields, signatures, PDF metadata). Staff read/insert/update. Service role may also write. Never written to Podio.';

commit;

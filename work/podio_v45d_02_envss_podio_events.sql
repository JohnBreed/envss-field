-- podio_v45d_02_envss_podio_events.sql
-- DRAFT ONLY. DO NOT APPLY until John approves. Apply after drive_v45d_01 (order is independent; this is step 2 of 3).
-- Depends on public.is_envss_staff().
-- Read model of planned HYG Assessment Events (Podio app 24280319). The Edge Function pull-hyg-events
-- is the only writer (service role). Staff can select. The field app never writes Podio.
-- Cron is a separate file (podio_v45d_03) so this table can be applied before pg_cron / secrets exist.

begin;

create table if not exists public.envss_podio_events (
  id               text primary key,                 -- podio-event-<item_id>
  item_id          bigint not null unique,
  event_reference  text,
  job_number       text not null check (job_number ~ '^\d{7}$'),
  project_item_id  bigint,
  project_title    text,
  payload          jsonb not null,
  planned          boolean not null default true,
  updated_at       timestamptz not null default now()
);

create index if not exists envss_podio_events_job
  on public.envss_podio_events (job_number) where planned;

alter table public.envss_podio_events enable row level security;

revoke all on public.envss_podio_events from anon;
revoke all on public.envss_podio_events from authenticated;
grant select on public.envss_podio_events to authenticated;

drop policy if exists envss_podio_events_staff_select on public.envss_podio_events;
create policy envss_podio_events_staff_select on public.envss_podio_events
  for select to authenticated
  using (public.is_envss_staff());

comment on table public.envss_podio_events is
  'Read-only planned HYG Assessment Events pulled from Podio app 24280319. Service role writes. Staff read.';

commit;

-- coc_v48_19_01_envss_coc_sends.sql
-- DRAFT ONLY. DO NOT APPLY until John approves. Apply before merge, after is_envss_staff() exists and after drive_v45d_01 (bucket field-exports).
-- Project luyprcmjyruznluboyms. Written 2026-11-28 (Australia/Perth).
-- Purpose: the queue + log for "send the chain of custody to the lab" (and "CoC error report to John").
-- The field app only INSERTS a queued row (and uploads the CoC files to field-exports/g/<job>/<event>/coc-send/<id>/).
-- The email itself is sent by the Apps Script worker work/coc-send-worker (developer@envss.com.au, Gmail "Send as" lab@envss.com.au),
-- which updates the row with a dedicated secret API key named coc-worker. Staff cannot update or delete: the log is append-only for them.
-- Security: the table, not the app, decides who can be emailed. kind='send' may only go to the lab address, kind='alert' only to John,
-- and only From lab@. Change an address = new migration (deliberate: a stolen session cannot mail arbitrary people through lab@).

begin;

create table if not exists public.envss_coc_sends (
  id              text primary key,                  -- client-generated (cs_<uuid> / al_<uuid>): a retry of the same tap is idempotent
  kind            text not null check (kind in ('send', 'alert')),
  status          text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'cancelled')),
  resend_of       text references public.envss_coc_sends (id),   -- amended / repeat sends point at the one they follow
  job_number      text not null check (job_number ~ '^\d{7}$'),
  event_code      text not null,
  event_id        text,
  project_id      text,
  from_addr       text not null check (from_addr = 'lab@envss.com.au'),
  to_addr         text not null,
  cc_addr         text,
  reply_to        text,
  subject         text not null,
  body_text       text not null,
  body_html       text,
  attachments     jsonb not null default '[]'::jsonb,   -- [{name, mime, bucket, path, bytes}]
  content_hash    text,                                  -- sha-256 of the CoC content (kind='send'); duplicate guard
  collection      jsonb,                                 -- {date, from, to, location}: when / where the lab collects
  sample_count    integer,
  sample_ids      jsonb,
  checks          jsonb,                                 -- warnings shown to the tech, or the failing checks for an alert
  tech_flag       jsonb,                                 -- {raised, manual, comment, at}: "Something looks wrong" + the tech's comment
  note            text,                                  -- reason typed for an amended / repeat send
  requested_by    text not null,                         -- must equal the signed-in user's email (enforced by the trigger)
  requested_at    timestamptz not null default now(),
  app_version     text,
  device          text,
  claimed_at      timestamptz,
  sent_at         timestamptz,
  gmail_message_id text,
  gmail_thread_id  text,
  message         text,
  tries           integer not null default 0,
  next_at         timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint envss_coc_sends_to_ok check (
    (kind = 'send'  and to_addr = 'ohlwa@mpl.com.au')
    or (kind = 'alert' and to_addr = 'john@envss.com.au')
  ),
  constraint envss_coc_sends_alert_flag check (kind <> 'alert' or (tech_flag is not null and length(coalesce(tech_flag ->> 'comment', '')) >= 20)),
  constraint envss_coc_sends_send_hash check (kind <> 'send' or (content_hash is not null and collection is not null))
);

-- Server-side duplicate guard: one live send per CoC content per event. Amended sends differ in content_hash or carry resend_of.
create unique index if not exists envss_coc_sends_one_live_send
  on public.envss_coc_sends (event_code, content_hash)
  where kind = 'send' and resend_of is null and status in ('queued', 'sending', 'sent');
create unique index if not exists envss_coc_sends_one_live_resend
  on public.envss_coc_sends (resend_of, content_hash)
  where kind = 'send' and resend_of is not null and status in ('queued', 'sending', 'sent');

create index if not exists envss_coc_sends_due on public.envss_coc_sends (next_at) where status = 'queued';
create index if not exists envss_coc_sends_event on public.envss_coc_sends (event_code, requested_at);

alter table public.envss_coc_sends enable row level security;
revoke all on public.envss_coc_sends from anon;
revoke all on public.envss_coc_sends from authenticated;
grant select, insert on public.envss_coc_sends to authenticated;

drop policy if exists envss_coc_sends_staff_select on public.envss_coc_sends;
drop policy if exists envss_coc_sends_staff_insert on public.envss_coc_sends;
create policy envss_coc_sends_staff_select on public.envss_coc_sends
  for select to authenticated using (public.is_envss_staff());
create policy envss_coc_sends_staff_insert on public.envss_coc_sends
  for insert to authenticated with check (
    public.is_envss_staff()
    and status = 'queued' and sent_at is null and claimed_at is null and gmail_message_id is null and tries = 0
  );

-- who = the signed-in user, not whatever the client typed
create or replace function public.envss_coc_sends_before_insert()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) <> lower(new.requested_by) then
    raise exception 'requested_by must be the signed-in user';
  end if;
  new.requested_at := now();
  new.status := 'queued';
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists envss_coc_sends_before_insert on public.envss_coc_sends;
create trigger envss_coc_sends_before_insert before insert on public.envss_coc_sends
  for each row execute function public.envss_coc_sends_before_insert();

commit;

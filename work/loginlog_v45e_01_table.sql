-- loginlog_v45e_01_table.sql
-- PREVIEW / DRAFT ONLY. DO NOT APPLY until John approves.
-- Written 2026-11-09 (Australia/Perth / AWST). Project luyprcmjyruznluboyms.
-- Purpose: insert-only daily login audit for the ENVSS Field app (sign_in, daily_open, sign_out).
-- Depends on: public.is_envss_staff() and public.envss_admins from signin_v45_01_staff_access
--   (already live as of 2026-11-03).
-- Access:
--   - authenticated @envss.com.au staff may INSERT only their own rows (user_id = auth.uid()).
--   - no UPDATE / DELETE policies for anyone (client roles also revoked).
--   - SELECT only when the caller's email is in public.envss_admins (self-seed empty today).
--   - anon revoked.
-- Does not alter envss_events / envss_trains / audit arrays / updated_by.
-- Optional (run separately after John confirms): seed admins, e.g.
--   insert into public.envss_admins(email, name) values ('john@envss.com.au','John Breed') on conflict do nothing;

begin;

create table if not exists public.envss_login_log (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid(),
  email            text not null check (email = lower(email) and email like '%@envss.com.au'),
  full_name        text,
  event            text not null check (event in ('sign_in', 'daily_open', 'sign_out')),
  occurred_at      timestamptz not null,                 -- client clock (device time of the event)
  received_at      timestamptz not null default now(),   -- server arrival
  local_date       date not null,                       -- Perth calendar date of the event
  device           text,
  browser          text,
  user_agent       text,
  app_version      text,
  client_event_id  text not null,                       -- uuid from the device; offline dedupe
  constraint envss_login_log_client_event_id_uq unique (client_event_id)
);

create index if not exists envss_login_log_local_date
  on public.envss_login_log (local_date desc, occurred_at desc);
create index if not exists envss_login_log_email_date
  on public.envss_login_log (email, local_date desc);
create index if not exists envss_login_log_user_date
  on public.envss_login_log (user_id, local_date desc);

alter table public.envss_login_log enable row level security;

revoke all on public.envss_login_log from anon;
revoke update, delete, truncate, references, trigger on public.envss_login_log from authenticated;

-- Staff may insert only their own row, and only when they are ENVSS staff.
drop policy if exists envss_login_log_staff_insert on public.envss_login_log;
create policy envss_login_log_staff_insert on public.envss_login_log
  for insert to authenticated
  with check (
    public.is_envss_staff()
    and user_id = auth.uid()
    and email = lower(auth.jwt() ->> 'email')
  );

-- Admins (envss_admins) may select the whole log. Staff who are not admins see nothing.
drop policy if exists envss_login_log_admin_select on public.envss_login_log;
create policy envss_login_log_admin_select on public.envss_login_log
  for select to authenticated
  using (
    public.is_envss_staff()
    and exists (
      select 1 from public.envss_admins a
      where a.email = lower(auth.jwt() ->> 'email')
    )
  );

-- No update / delete policies on purpose (insert-only audit).

grant insert on public.envss_login_log to authenticated;
grant select on public.envss_login_log to authenticated;

commit;

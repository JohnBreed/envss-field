-- loginlog_v48_3_01_app_open.sql
-- APPLIED 12 Nov 2026 ~22:38 AWST on John's approval (voice call 10:35 pm) as migration loginlog_v48_3_01_app_open.
-- Before snapshot taken 22:37:31 AWST (3 rows, all John's). Written 2026-11-12 (AWST). Project luyprcmjyruznluboyms.
-- Rollback: work/loginlog_v48_3_01_app_open_rollback.sql
-- Why: envss_login_log only ever received John's rows (3 rows, 11-12 Nov). Staff have live sessions (auth.sessions
--   refreshed 12 Nov) and run v46+, but none of their rows arrived. A rolled-back test after applying showed the database
--   DOES accept a staff insert (plain and ON CONFLICT DO NOTHING), so the cause is on the device side (rows never sent or
--   stuck in the on-device queue; one refused row blocked the whole queue). v48.3 sends through the function below, logs
--   every open, no longer lets one bad row block the queue, and keeps a silent on-device diagnostic.
-- What it does (additive only):
--   1. adds device detail columns to envss_login_log (all nullable);
--   2. allows two new event values: app_open (every app start while signed in) and app_resume (back after 30+ min);
--   3. adds public.envss_log_app_open(p jsonb): SECURITY DEFINER insert for signed-in @envss.com.au staff only.
--      user_id and email come from the caller's JWT, never from the payload. Duplicate client_event_id is ignored.
-- Does not touch envss_events / envss_trains / envss_admins or any existing row. SELECT stays admin-only.

begin;

alter table public.envss_login_log
  add column if not exists device_type     text,   -- phone | tablet | chromebook | laptop
  add column if not exists os              text,   -- Android | iOS | ChromeOS | Windows | macOS | Linux | Other
  add column if not exists os_version      text,
  add column if not exists browser_version text,
  add column if not exists display_mode    text,   -- standalone (installed app) | browser_tab
  add column if not exists extra           jsonb;  -- screen size, model hint

alter table public.envss_login_log drop constraint if exists envss_login_log_event_check;
alter table public.envss_login_log add constraint envss_login_log_event_check
  check (event in ('sign_in', 'daily_open', 'sign_out', 'app_open', 'app_resume'));

create index if not exists envss_login_log_email_occurred
  on public.envss_login_log (email, occurred_at desc);

create or replace function public.envss_log_app_open(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(auth.jwt() ->> 'email');
  v_at    timestamptz;
begin
  if not public.is_envss_staff() or auth.uid() is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  begin
    v_at := coalesce((p ->> 'occurred_at')::timestamptz, now());
  exception when others then
    v_at := now();
  end;
  if v_at > now() + interval '1 day' or v_at < now() - interval '60 days' then v_at := now(); end if;
  insert into public.envss_login_log (
    user_id, email, full_name, event, occurred_at, local_date, device, browser, user_agent, app_version, client_event_id,
    device_type, os, os_version, browser_version, display_mode, extra)
  values (
    auth.uid(), v_email, left(p ->> 'full_name', 120), p ->> 'event', v_at, (v_at at time zone 'Australia/Perth')::date,
    left(p ->> 'device', 40), left(p ->> 'browser', 40), left(p ->> 'user_agent', 500), left(p ->> 'app_version', 20),
    left(coalesce(p ->> 'client_event_id', gen_random_uuid()::text), 64),
    left(p ->> 'device_type', 20), left(p ->> 'os', 20), left(p ->> 'os_version', 40), left(p ->> 'browser_version', 40),
    left(p ->> 'display_mode', 20), case when jsonb_typeof(p -> 'extra') = 'object' then p -> 'extra' else null end)
  on conflict (client_event_id) do nothing;
end;
$$;

revoke all on function public.envss_log_app_open(jsonb) from public, anon;
grant execute on function public.envss_log_app_open(jsonb) to authenticated;

commit;

-- Check after applying (read only):
--   select email, event, app_version, device_type, os, os_version, browser, browser_version, display_mode, occurred_at
--   from public.envss_login_log order by occurred_at desc limit 50;

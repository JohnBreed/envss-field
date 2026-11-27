-- DRAFT, NOT APPLIED. ENVSS Field v48.16: minimum field-app version (John t651u / t652u, 27 Nov 2026 AWST).
-- One small settings table the field app can READ when a staff member is signed in. Nobody can write it from the app:
-- no insert / update / delete grants for anon or authenticated; change it in the SQL editor (service role / owner).
-- Additive only: creates a new table, touches no existing table, row or policy.
-- Rollback: settings_v48_16_01_app_settings_rollback.sql.
--
-- How the app uses it: GET /rest/v1/app_settings?select=key,value&key=eq.min_field_app_version
--   * value is a version like 48.16. A device below it that is online, with that version (or newer) actually
--     published, updates itself as soon as it is safe and blocks NEW work with a banner until it has.
--   * '0', empty, missing row, missing table, not signed in, offline or anything unreadable: nothing happens (fails open).
-- Seeded at '0' (gate off). To require v48.16 after it is published:
--   update public.app_settings set value = '48.16', updated_at = now(), updated_by = 'John Breed' where key = 'min_field_app_version';

create table if not exists public.app_settings (
  key        text primary key check (key ~ '^[a-z0-9_]{1,64}$'),
  value      text not null default '',
  note       text not null default '',
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);
comment on table public.app_settings is 'ENVSS Field v48.16: small app settings (e.g. min_field_app_version). Staff read only; written only from the SQL editor.';

alter table public.app_settings enable row level security;

drop policy if exists app_settings_staff_read on public.app_settings;
create policy app_settings_staff_read on public.app_settings
  for select to authenticated
  using (public.is_envss_staff());

revoke all on public.app_settings from public, anon, authenticated;
grant select on public.app_settings to authenticated;

insert into public.app_settings (key, value, note, updated_by)
values ('min_field_app_version', '0',
        'Lowest ENVSS Field version allowed to add new work. 0 = off. A version (e.g. 48.16) only takes effect once that version is published.',
        'v48.16 migration')
on conflict (key) do nothing;

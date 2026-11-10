-- drive_v45d_01_drive_copy_queue.sql
-- DRAFT ONLY. DO NOT APPLY until John approves. Apply before merge, after is_envss_staff() exists.
-- Project luyprcmjyruznluboyms. Written 2026-11-08 (Australia/Perth).
-- Purpose: queue of NEW files for the Apps Script worker (developer@envss.com.au) to create
-- inside {job}_Field-App. The worker uses a dedicated Supabase secret API key named drive-worker
-- (Project Settings → API Keys), stored only in Apps Script Properties. Not the service-role key.
-- Staff may insert and read. Staff may not update or delete. That secret key bypasses RLS and is the only updater.
-- Photos stay in the existing private bucket field-photos. Generated files go to the new private bucket field-exports.

begin;

create table if not exists public.envss_drive_copies (
  id              text primary key,
  source_key      text not null unique,             -- photo:<pid> or file:<id>; one row, one copy
  kind            text not null check (kind in ('photo', 'file')),
  status          text not null default 'queued' check (status in ('queued', 'copied', 'stopped')),
  job_number      text not null check (job_number ~ '^\d{7}$'),
  event_code      text,
  project_id      text,
  sample_id       text,
  file_name       text not null,
  bucket          text not null,
  storage_path    text not null,
  mime            text,
  bytes           integer,
  drive_file_id   text,                             -- set once; the worker must not upload that item again
  drive_url       text,
  drive_folder_id text,
  message         text,
  tries           integer not null default 0,
  next_at         timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      text
);

create index if not exists envss_drive_copies_due
  on public.envss_drive_copies (next_at) where status = 'queued';
create index if not exists envss_drive_copies_event
  on public.envss_drive_copies (event_code);
create index if not exists envss_drive_copies_job
  on public.envss_drive_copies (job_number);

alter table public.envss_drive_copies enable row level security;

revoke all on public.envss_drive_copies from anon;
revoke all on public.envss_drive_copies from authenticated;
grant select, insert on public.envss_drive_copies to authenticated;

drop policy if exists envss_drive_copies_staff_select on public.envss_drive_copies;
drop policy if exists envss_drive_copies_staff_insert on public.envss_drive_copies;

create policy envss_drive_copies_staff_select on public.envss_drive_copies
  for select to authenticated using (public.is_envss_staff());
create policy envss_drive_copies_staff_insert on public.envss_drive_copies
  for insert to authenticated with check (
    public.is_envss_staff()
    and status = 'queued'
    and drive_file_id is null
  );

-- Staff inserts only. A later update (status, drive_file_id) is the worker's, via the drive-worker secret key.
create or replace function public.envss_drive_copies_staff_insert()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from 'queued' or new.drive_file_id is not null then
    raise exception 'drive copy rows are inserted as queued, with no drive file id';
  end if;
  return new;
end;
$$;

drop trigger if exists envss_drive_copies_staff_insert on public.envss_drive_copies;
create trigger envss_drive_copies_staff_insert
  before insert on public.envss_drive_copies
  for each row execute function public.envss_drive_copies_staff_insert();

insert into storage.buckets (id, name, public, file_size_limit)
values ('field-exports', 'field-exports', false, 52428800)
on conflict (id) do nothing;

drop policy if exists field_exports_staff_insert on storage.objects;
create policy field_exports_staff_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'field-exports'
    and public.is_envss_staff()
    and (storage.foldername(name))[1] = 'g'
  );

commit;

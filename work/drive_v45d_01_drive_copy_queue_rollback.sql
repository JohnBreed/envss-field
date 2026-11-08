-- drive_v45d_01_drive_copy_queue_rollback.sql
-- DRAFT ONLY. Drops the drive-copy queue, its policies, and the field-exports bucket.
-- Objects already in field-exports are removed with the bucket. Files already created in Google Drive are NOT touched.

begin;

drop policy if exists field_exports_staff_insert on storage.objects;
delete from storage.objects where bucket_id = 'field-exports';
delete from storage.buckets where id = 'field-exports';

drop trigger if exists envss_drive_copies_staff_insert on public.envss_drive_copies;
drop function if exists public.envss_drive_copies_staff_insert();
drop policy if exists envss_drive_copies_staff_select on public.envss_drive_copies;
drop policy if exists envss_drive_copies_staff_insert on public.envss_drive_copies;
drop table if exists public.envss_drive_copies;

commit;

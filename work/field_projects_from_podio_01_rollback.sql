-- field_projects_from_podio_01_rollback.sql
-- DRAFT, NOT EXECUTED. Project luyprcmjyruznluboyms. Written 2026-11-20 (AWST).
-- Apply only after John approves a rollback of work/field_projects_from_podio_01.sql.
--
-- This drops the sync function only. It does NOT delete or revert any envss_projects
-- rows. If the function was later run with p_dry_run => false, reversing those data
-- changes needs a separate, approved review of rows with
-- updated_by = 'field-projects-from-podio'. Never delete source = 'field' rows or
-- tombstones. A read-only list of rows the function wrote is:
--
--   select id, payload->>'number' as job_number, payload->>'status' as status,
--          payload->>'source' as source, updated_at, updated_by
--   from public.envss_projects
--   where updated_by = 'field-projects-from-podio'
--   order by updated_at, id;

begin;

drop function if exists public.sync_envss_projects_from_podio(boolean);

commit;

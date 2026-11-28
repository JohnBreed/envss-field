-- DRAFT, NOT APPLIED. ENVSS Field v48.19, PART B (apply separately from part A): the Dashboard Bot's mirror views.
-- These views run with the owner's rights (no RLS) and anon has SELECT, so with only the public key anyone can read:
--   v_dash_invoices (9,035 rows: invoice amounts, due/paid dates), v_dash_leads (15,654: client, job value, lead controller),
--   v_dash_projects (7,558: job value, organisation, controller), v_dash_fit_tests (7,588), v_dash_apps (196), v_field_pumps (107).
-- The field app does not read v_dash_* at all (authenticated has no grant on them). v_field_pumps IS read by the app, after sign-in,
-- and authenticated keeps its grant.
-- *** DO NOT APPLY until we know what else reads v_dash_*. If the Dashboard Bot or a finance/CFO bot reads these with the
-- public key instead of a service/secret key, this revoke breaks it. Check first (see report). ***
-- Rollback: lockdown_v48_19_02_dash_views_staff_only_rollback.sql
revoke select on public.v_dash_apps, public.v_dash_fit_tests, public.v_dash_invoices, public.v_dash_leads, public.v_dash_projects, public.v_field_pumps from anon;

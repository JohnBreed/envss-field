-- DRAFT ONLY. Not applied. John has not approved a SQL apply.
-- Adds Site Works Attended by (external_id report-submitted-by) to v_field_afm_events
-- so the field app can show the attendee on project cards. Today the view omits this
-- field (it already has samples-collected-by, which is a different Podio field).
-- The HYG view v_field_hyg_events already includes report-submitted-by.
--
-- Do not run this until John approves the apply.

-- Recreate the live v48.5 view with one extra key in the fields object.
-- Filter and grants are unchanged.

-- In the jsonb_build_object of public.v_field_afm_events, add:
--   'report-submitted-by', pi.fields->'report-submitted-by',
-- next to 'samples-collected-by'. Then recreate the view and re-apply the existing
-- revoke/grant statements from work/afm_v48_5_01_afm_report_not_sent.sql.
--
-- This file is a note, not a runnable apply script, until the view body is copied
-- in full at approval time.

-- Rollback for lockdown_v48_19_02_dash_views_staff_only.sql.
grant select on public.v_dash_apps, public.v_dash_fit_tests, public.v_dash_invoices, public.v_dash_leads, public.v_dash_projects, public.v_field_pumps to anon;

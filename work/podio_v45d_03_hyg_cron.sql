-- podio_v45d_03_hyg_cron.sql
-- DRAFT ONLY. Apply AFTER podio_v45d_02, AFTER the pull-hyg-events function is deployed,
-- and AFTER the vault secrets below exist. Does not call Podio by itself.
--
-- Dashboard (once): Database → Extensions → enable pg_cron and pg_net.
-- Vault secrets (SQL editor, as postgres — values never go in git):
--   select vault.create_secret('https://luyprcmjyruznluboyms.supabase.co', 'envss_project_url');
--   select vault.create_secret('<same random string as Edge secret HYG_CRON_SECRET>', 'envss_hyg_cron_secret');
-- Edge secrets (supabase secrets set, not in git):
--   PODIO_CLIENT_ID, PODIO_CLIENT_SECRET, PODIO_HYG_APP_TOKEN, HYG_CRON_SECRET
--
-- Schedule is hourly at the UTC hours that cover 07:00–17:00 Australia/Perth.
-- The function itself no-ops outside Mon–Fri of that window unless the caller passes force
-- (the app's Refresh button does). Sunday 23:00 UTC is Monday 07:00 AWST and is included;
-- Saturday hours in the same UTC list are skipped by the function.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  url text;
  secret text;
begin
  select decrypted_secret into url from vault.decrypted_secrets where name = 'envss_project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'envss_hyg_cron_secret';
  if coalesce(url, '') = '' or coalesce(secret, '') = '' then
    raise exception 'Set vault secrets envss_project_url and envss_hyg_cron_secret before scheduling the HYG pull';
  end if;
  begin
    perform cron.unschedule('envss-pull-hyg-events');
  exception when others then
    null;
  end;
  perform cron.schedule(
    'envss-pull-hyg-events',
    '0 23,0-9 * * *',
    format($cron$
      select net.http_post(
        url := %L || '/functions/v1/pull-hyg-events',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-envss-cron', %L
        ),
        body := '{"source":"cron"}'::jsonb
      );
    $cron$, url, secret)
  );
end $$;

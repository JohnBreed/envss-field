-- podio_v45d_03_hyg_cron_rollback.sql
-- DRAFT ONLY. Removes the hourly schedule. Does not drop pg_cron or pg_net, and does not drop the table.

do $$
begin
  perform cron.unschedule('envss-pull-hyg-events');
exception when others then
  raise notice 'envss-pull-hyg-events was not scheduled (%).', sqlerrm;
end $$;

# Planned HYG events — read-only pull

Podio app **HYG Assessment Events**, app id **24280319**, space **6088520**.

The field app does not talk to Podio. It reads `envss_podio_events`. An Edge Function reads Podio and upserts that table. There is no Podio write in this change.

`envss_projects` is already filled by the existing Podio mirror (`podio_items` / the dashboard sync). The field app only selects it, and `block_podio_sync_writer` refuses stray writes signed `podio-sync`. This pull follows that idea: a server job writes a read model, staff JWTs only select, and the service role is the writer.

## What John sets (nothing goes in git)

Edge Function secrets on project `luyprcmjyruznluboyms`:

| Secret | What it is |
| --- | --- |
| `PODIO_CLIENT_ID` | Podio API client id |
| `PODIO_CLIENT_SECRET` | Podio API client secret |
| `PODIO_HYG_APP_TOKEN` | App token for HYG Assessment Events (app authentication, not a user password) |
| `HYG_CRON_SECRET` | Long random string. The cron job sends it as `x-envss-cron`. |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already injected into Edge Functions. Do not copy the service role into the repo or the field app.

```text
supabase secrets set PODIO_CLIENT_ID=… PODIO_CLIENT_SECRET=… PODIO_HYG_APP_TOKEN=… HYG_CRON_SECRET=…
supabase functions deploy pull-hyg-events --project-ref luyprcmjyruznluboyms
```

The function source is `supabase/functions/pull-hyg-events/`.

## SQL (not applied in this PR)

Apply in this order, in the Supabase SQL editor:

1. `work/drive_v45d_01_drive_copy_queue.sql` (Drive queue — separate feature, same release)
2. `work/podio_v45d_02_envss_podio_events.sql`
3. Deploy the function and set the secrets above.
4. Create vault secrets `envss_project_url` (`https://luyprcmjyruznluboyms.supabase.co`) and `envss_hyg_cron_secret` (the same value as `HYG_CRON_SECRET`).
5. Enable extensions **pg_cron** and **pg_net** (they are not installed on the project today).
6. `work/podio_v45d_03_hyg_cron.sql`

Rollbacks: the matching `*_rollback.sql` files, cron first if you are undoing the schedule.

The cron fires on the UTC hours that cover **07:00–17:00 Australia/Perth**. The function returns without calling Podio outside **Monday–Friday** in that window. **Refresh from Podio** in the app sends `force: true` and runs immediately.

## What is pulled

Filter: Site Works Start Date Status is **Tentative** (option 1) or **Confirmed** (option 2). **Site Works Not Required** (option 3) is not requested.

A row is stored with `planned = false` when COC Status is **Lab Results Received** or Report Status is **Report Sent**, so it drops off the field list. Items that leave the Podio filter are marked `planned = false`. Rows are not deleted.

Job number comes from the leading 7 digits of `reference-3` or the project title, otherwise from the `job-number` calculation padded to 7 digits. `0019333` matches project `podio-3384715481` (`0019333-Programmed Facility Management-HYG-LPS-…`). The Podio Drive link is stored for display and for a later write-back. The Drive copier does **not** use it (Podio says HYG-LPS, the shared drive folder for this job is the one whose name starts with `0019333`).

On the 92 mirrored items (8 Nov 2026), `reference-3` is the long project title, not `0019333-001`. The mapper still accepts `0019333-001` when that is what Podio holds, and uses it as the field event code. A long reference keeps the next `0019333-00N` code and shows the Podio reference on the event.

`selection` (Laboratory Turnaround Time) is **deleted** in Podio and empty on every mirrored row. If a value is present it maps to the COC turnaround (`Normal Turnaround(3 Days)` → `3_day`, `Next Day 0700` → `1_day`, `Emergency` → `same_day`). Otherwise the event stays on Standard.

## App

On a job: planned rows, **Start fieldwork** (prefills reference, site contact, POC, task, turnaround, lab, start date), and **Start an event not in Podio**. That last path sets the banner **Not in Podio yet - office to create/link**.

**Refresh from Podio** is shown to signed-in staff. It POSTs the Edge Function for that job, then reloads the table. Offline, it keeps the last list saved on the device and does not pretend to refresh. If the function or the table is not deployed yet, the project page says so and fieldwork still works.

## Fixture

`work/v45d/fixtures/hyg-0019333.json` is the Podio item shape for job 0019333 (raw API item plus the decoded mirror shape). Tests map it locally. Nothing is written to Podio.

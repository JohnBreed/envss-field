# v48.2 — AFM field-app changes

AFM field-app update on v48.1, including live irregularity checks during the day.

Run checks (Supabase is mocked; no production writes):

```
ROOT=/workspace/afm-build node work/v49/test.mjs chromebook
ROOT=/workspace/afm-build node work/v49/test.mjs pixel7
```

Screenshots land in `work/v49/shots/`. The upgrade fixture is `work/v49/fixtures/afm-upgrade-v34.json`.

## Read-only AFM pull from Podio (added 12 Nov 2026, 10:10 pm AWST)

The app reads two new **views** over the existing Podio mirror (`public.podio_items`, filled by the Dashboard Bot sync). It never calls Podio and never writes to Podio.

| View | Podio app | What it returns |
| --- | --- | --- |
| `v_field_afm_events` | 21120412 **AFM Event** | Open AFM events (final report not generated/sent/invoiced/cancelled), start date from 30 days ago |
| `v_field_afm_samples` | 21120488 **AFM Samples** | Samples linked (`job-site`) to those events. No signatures or lab results |

SQL: `work/afm_v49_01_afm_podio_views.sql` (rollback `work/afm_v49_01_afm_podio_views_rollback.sql`). SQL is applied with the v48.2 publish (rollback file kept). Until the views exist the app says "AFM from Podio isn't switched on yet" and AFM fieldwork works as before.

On a project: **AFM planned in Podio** lists the open AFM events for the job with **Start AFM from Podio**. On a linked AFM event: **From Podio (AFM)** shows what came from Podio, what was kept, and **Fill blanks from Podio**.

Mapping (fill blanks only; a value already in the field app is kept and listed as "kept"):

- Event: code = `reference-3` (e.g. `ENVSS-HAZ-AFM-0017889-0011-20261113`, kept on edit), date = `samples-date`, task = `task-description`, turnaround = `selection` (Next Day 0700 → next_0700, Normal (3 days) → normal_3day, Emergency), site = `job-location`, POC = company/first/last/role/phone/email, monitoring type and rotameter from the samples when they all agree.
- Sample: number = `sample-number` (0 = field blank, then Pump 1, Pump 2…), cowl = `cowl` (bare 5 digits, ENVSS/ESS stripped; `cowl-number` padded as fallback), pump = `equipment` / `pump-number-2`, rotameter, location = `location-3` without the leading "N-", monitoring type, start flow.
- Podio's sample start time on a planned event is the office's planned time. It is shown on the sample, never used as START/STOP. End flow/time are not pulled.
- A sample number deleted in the field app is not re-added. A Podio cowl already used on another sample in the event is left blank and reported.

Checks: `ROOT=/workspace/afm-build node work/v49/afm-pull.test.mjs chromebook|pixel7` (fixture `work/v49/fixtures/podio-afm-20261113.json`: real mirror rows for 13 Nov 2026 jobs 0017889, 0018637, 0019299; client contact details replaced because the repo is public).

# v48.5 draft — AFM pull: every event at "Report not sent"

Draft only. Do not merge, publish, or apply SQL until John approves.

What to run (Chromebook 1366×768, Supabase mocked):

```
ROOT=/workspace/time-lock node work/v49/afm-pull.test.mjs chromebook
```

SQL (unapplied): `work/afm_v48_5_01_afm_report_not_sent.sql`
Rollback: `work/afm_v48_5_01_afm_report_not_sent_rollback.sql`

See `work/v49/README.md` for the stage definition, the 9-event list context, and the 0019438 project-list gap.

AFM timeout fix (20 Nov 2026): the index `podio_items_afm_sample_event_idx` and the per-event
`v_field_afm_samples` lookup were applied live on 20 Nov (John approved). Both SQL files above now
carry the same samples view so applying v48.5 (or its rollback) keeps the fix. Live check: same 71
samples, 8.9 s -> ~40 ms as a staff user.

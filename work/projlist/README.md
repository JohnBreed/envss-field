# v48.6 project list Layout A (23 Nov 2026 AWST)

Published with v48.6. Branch: `feat/project-list-review`. Rollback tag: `rollback-v48.5` on main `ef2874a`.

Layout A: grouped by when work is happening, one card per job number, no-date and test jobs collapsed.

Name on the card:

- Hygiene events: Podio **Site Works Attended by** (`report-submitted-by`) for the next/current event. If that is empty, **Controller: {name}**.
- AFM events: distinct **Sample Submitted by** names from that event's AFM samples (`sample-by` on app 21120488), already exposed by `v_field_afm_samples`. Do **not** use `report-submitted-by` on the AFM event. If every sample is empty, fall back to **Controller: {name}**. Expanded multi-event cards show each event's own name.

Live data comes from `db.projects` / `db.events`, the hygiene Podio cache (`envss-podio-events-v45d`), and the AFM cache (`envssAfmPodio.cache()`). Tests still inject `window.ENVSS_PROJLIST_FIXTURE`. No SQL was applied. No Podio writes.

Note: open drafts #14–#17 are still titled v48.6 / v48.7 and will be renumbered later.

## Tests

`ROOT=/workspace/envss-projlist node work/projlist/test.mjs`

Plus the v48 regression suite (version asserts updated to 48.6):

```
ROOT=/workspace/envss-projlist node work/v48-4/v48-regression.mjs
ROOT=/workspace/envss-projlist node work/v48-4/v48-3-suite.mjs
ROOT=/workspace/envss-projlist node work/v48-4/test.mjs
ROOT=/workspace/envss-projlist node work/v49/afm-pull.test.mjs chromebook
```

Supabase is mocked in memory; production is not written to.

## Screenshots

Mocked Layout A shots are under `work/projlist/shots/` (including AFM cards `*-9467-afm.png` and `*-7889-afm.png`). Live verification shots are taken after publish against https://field.envss.com.au/field.html.

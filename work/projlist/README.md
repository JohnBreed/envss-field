# Project list Layout A (23 Nov 2026 AWST)

Draft only. Not published. Branch: `feat/project-list-review` at `/workspace/envss-projlist` (from main `ef2874a` / v48.5).

Layout A: grouped by when work is happening, one card per job number, no-date and test jobs collapsed.

Name on the card:

- Hygiene events: Podio **Site Works Attended by** (`report-submitted-by`) for the next/current event. If that is empty, **Controller: {name}**.
- AFM events: distinct **Sample Submitted by** names from that event's AFM samples (`sample-by` on app 21120488). This already comes through `v_field_afm_samples` and the app's `sampledBy` mapping. Do **not** use `report-submitted-by` on the AFM event. If every sample is empty, fall back to **Controller: {name}**. Expanded multi-event cards show each event's own name.

The earlier draft `afm_view_add_attended_by.sql` (adding `report-submitted-by` to `v_field_afm_events`) was dropped. No SQL change is needed, and none was applied.

## Tests

`ROOT=/workspace/envss-projlist node work/projlist/test.mjs`

36 passed (Pixel 7 + Chromebook). Supabase is mocked in memory; production is not written to.

## Screenshots

All under `work/projlist/shots/`.

Current v48.5 list (for comparison): `current-pixel7.png`, `current-chromebook.png`, plus `-full`.

Layout A:

- `a-pixel7.png` / `a-chromebook.png` — On site today
- `a-pixel7-full.png` / `a-chromebook-full.png`
- `a-pixel7-9219.png` / `a-chromebook-9219.png` — 0019219 hygiene, both attendees, expanded
- `a-pixel7-expanded-8637.png` / `a-chromebook-expanded-8637.png` — 0018637 AFM, Marisabel on 0018 and Talis on 0020 from sample-by
- `a-pixel7-9467-afm.png` / `a-chromebook-9467-afm.png` — 0019467 single-event AFM card, sampler Daryle Van Geest
- `a-pixel7-7889-afm.png` / `a-chromebook-7889-afm.png` — 0017889 AFM card, next event sampler Talis Powdrill
- `a-pixel7-expanded-9321.png` / `a-chromebook-expanded-9321.png` — 0019321, 3 of 5 events done

Preview B shots are leftover from the earlier review and are not the proposed layout.

Re-take: `ROOT=/workspace/envss-projlist node work/projlist/shot.mjs` (Supabase mocked).

# Project list Layout A (23 Nov 2026 AWST)

Draft only. Not published. Branch: `feat/project-list-review` at `/workspace/envss-projlist` (from main `ef2874a` / v48.5).

Layout A: grouped by when work is happening, one card per job number, no-date and test jobs collapsed.
Name on the card is Podio **Site Works Attended by** (`report-submitted-by`) for the next/current event; if that is empty, **Controller: {name}**. Expanded multi-event cards show each event's attendee.

## Tests

`ROOT=/workspace/envss-projlist node work/projlist/test.mjs`

32 passed (Pixel 7 + Chromebook). Supabase is mocked in memory; production is not written to.

## Screenshots

All under `work/projlist/shots/`.

Current v48.5 list (for comparison): `current-pixel7.png`, `current-chromebook.png`, plus `-full` and `-mid`.

Layout A:
- `a-pixel7.png` / `a-chromebook.png` — On site today
- `a-pixel7-full.png` / `a-chromebook-full.png`
- `a-pixel7-9219.png` / `a-chromebook-9219.png` — 0019219 with both attendees, expanded
- `a-pixel7-expanded-8637.png` / `a-chromebook-expanded-8637.png` — 0018637, attendee vs labelled controller
- `a-pixel7-expanded-9321.png` / `a-chromebook-expanded-9321.png` — 0019321, 3 of 5 events done
- `a-pixel7-groups-lower.png` — Next 7 days / later
- `a-pixel7-nodate.png` — collapsed no-date / test groups

Preview B shots are leftover from the earlier review and are not the proposed layout.

Re-take: `ROOT=/workspace/envss-projlist node work/projlist/shot.mjs` (Supabase mocked).

## AFM view note

`afm_view_add_attended_by.sql` is a draft note only. Not applied. `v_field_afm_events` does not yet include `report-submitted-by`. The HYG view already does.

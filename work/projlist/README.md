# Project list review (23 Nov 2026 AWST)

Review and mockups only. Not published. Branch: `feat/project-list-review` at `/workspace/envss-projlist` (from main `ef2874a` / v48.5).

## Screenshots

All under `work/projlist/shots/`. Pixel 7 (412×915) and Chromebook (1366×768).

Current list (live v48.5 UI, stubbed with today's 55 active jobs):
- `current-pixel7.png` / `current-chromebook.png` — first screen
- `current-pixel7-full.png` / `current-chromebook-full.png` — full list
- `current-pixel7-mid.png` / `current-chromebook-mid.png` — mid-list crop

Preview A — grouped by when work is happening:
- `a-pixel7.png` / `a-chromebook.png`
- `a-pixel7-full.png` / `a-chromebook-full.png`
- `a-pixel7-expanded-9321.png` — 0019321, 3 of 5 events done, list expanded
- `a-pixel7-expanded-8637.png` / `a-chromebook-expanded-8637.png` — 0018637 multi-day AFM
- `a-pixel7-groups-lower.png` — Later + Awaiting lab / report
- `a-pixel7-nodate.png` — collapsed No date set / Test groups

Preview B — one list, sorted by next date:
- `b-pixel7.png` / `b-chromebook.png`
- `b-pixel7-full.png` / `b-chromebook-full.png`
- `b-pixel7-expanded-9321.png` / `b-chromebook-expanded-9321.png`

Re-take shots: `ROOT=/workspace/envss-projlist node work/projlist/shot.mjs` (Supabase mocked, no production writes).

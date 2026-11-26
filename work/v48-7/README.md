# v48.7 → v48.14 draft — field events created automatically from Podio (open item 11)

John: rules 20 Nov 2026 AWST, build approved 23 Nov 2026 AWST. **Draft only. Not published:** merging field.html to main publishes the live app.
Numbered 48.7 because 48.6 (linked samples, PR #14) is a separate draft. Rebased on main (v48.5 merged as ef2874a).

## v48.14 (26 Nov 2026 AWST) — on top of main v48.13 (fit events)
John 26 Nov 2026 2:56–2:57 pm AWST: "Podio events should show in the events list automatically … we will default to adding from Podio
rather than creating in the field app." Merged main v48.13 (merge commit, no force push) and renumbered to **v48.14**.
- **No date window any more:** every planned Podio HYG event (not finished, cancelled, not required, lab results received) is created,
  whatever its start date or last edit. (The 7-day / 60-day limits below are gone; `BACK_DAYS` / `NODATE_EDIT_DAYS` are `null`.)
- **Hygiene only.** Fit events (type `fit`, `{job}-FIT-nnn`) are never created, linked, offered or renumbered; FIT codes are never reused.
  A HYG item whose only work is fit testing (RFT and/or HPFT) is not made into a hygiene event; its card keeps **Start fieldwork**.
- **Podio scope** line on the event from the reference work types, e.g. 0019358: RFT (separate fit-test event, not automatic);
  NSEOC-ACA (occupational noise + airborne contaminants, both in this event); VENT.
- **Occupational noise:** there is no separate Podio app for occupational noise. It is a work type (NSEOC / NSED) on the HYG Assessment
  event; noise samples go in the auto-created hygiene event (main has no separate noise event type). Podio's "Noise Monitoring Event" app
  (24241557) is environmental noise monitoring and is not in the mirror; it is not covered.
- **Project:** a job can have several Podio projects (0019185-001 … -004); the event goes on the project the Podio event links to.
  A field code at the start of the Podio reference (0019185-002-…) is used for duplicate matching and as the code when free.
- **Long Podio task text** (e.g. a forwarded client email) is stored in full in `taskDesc`; the event's From Podio card shows the first
  ~300 characters with **Show all**. Notes stay empty.
- **Per-app config (John, 26 Nov 3:15 pm):** `PODIO_EVENT_APPS` in field.html lists the Podio event apps that feed auto-create and the
  field event each makes: HYG Assessment (24280319) → hygiene. Occ Noise Event (30888380) → hygiene, kind noise; Vent Survey Event
  (30888385) → hygiene, kind vent; Onsite RFT Event (30888384) → fit ({job}-FIT-nnn). John created the three 26 Nov 3:29 pm AWST; they are read from the draft view `v_field_podio_events` (`work/hyg_v48_14_01_podio_events_view.sql` + rollback, NOT applied). A missing
  view or failed read just leaves them out (nothing created, nothing flagged "gone"). Field spec for the new apps: `work/podio-event-apps/`.
- A Podio read repaints the screen only when review flags or link offers changed (a repaint mid-tap was swapping buttons).
- **Podio-first UI:** on a project, "New project event" / "Start an event not in Podio" become a quiet **Add event not in Podio** button
  (and a small "+ Not in Podio" FAB) with "Podio events appear in the events list by themselves." Both still work as the fallback.

## What it does
- When the app reads the Podio copy (`v_field_hyg_events`, HYG Assessment Events app 24280319) it creates the field event itself.
  The read happens on Refresh from Podio, on project open (as before) and now also in the background every 15 min while the app is open
  (the top-bar "Refreshed from Podio" note only changes when someone taps Refresh).
- Created for every planned HYG event (tentative, confirmed or no status). Not planned (never auto-created): Site Works Start Date Status
  "Site Works Not Required"; COC Status "Lab Results Received"; Report Status at or after "Final Report Generated" — Final Report Generated,
  \*Send final Report to Client, Report Sent, Canceled (or Cancelled), No Report Required, Invoiced, plus the deleted legacy texts still on old
  items (Report Generated - Not Sent, Report Sent to Client, Event Canceled). Exact option texts read from Podio app 24280319 (read only,
  23 Nov 2026 AWST). Earlier report stages (Pending, drafting, review) still count as planned. Same rule in `supabase/functions/pull-hyg-events/map.js`
  (repo copy only; the Edge Function is not redeployed).
  — no wait for a confirmed date — when its Podio start date is no more than 7 days ago, or it has no start date and was edited in Podio in the
  last 60 days. Older backlog keeps the **Start fieldwork** button (fallback). AFM-only HYG items (`-HYG-AFM-`) are skipped (AFM flow).
- Same record as Start fieldwork (POC, lab, task, turnaround, Drive link, Podio item id) plus `podioAuto: true`, `podioSeen` (the Podio date /
  status / job it was made from) and an audit entry "Created automatically from Podio". No start date in Podio → event date left blank.
- **Delete:** an admin's Delete event now writes the Podio item id into the tombstone. The app never re-creates a Podio event whose field event
  was deleted (checked on every device, including events deleted before this version: their old rows are recognised on pull).
  The Podio card then says "will not be created again" with a deliberate **Start fieldwork again** (fresh id).
- **Codes of deleted events (John, 23 Nov 2026 8:05 pm AWST):** a deleted event's code stays reserved, except when the deleted event was a
  hand-made duplicate on the same job (marked Podio unplanned, never linked to Podio, not auto-created, not `e-podio-…`, not AFM) with no samples
  at all (no sample rows, no sample tombstones). Then the auto-created Podio event reuses that code (0019401 → 0019401-001). The deleted event
  itself stays deleted. Anything unknown keeps its code reserved. Delete event now also records hand-made / auto / sample count in the tombstone.
  Auto-create waits for this device's second successful pull (started straight after the first) so tombstone details are complete.
- **Podio moved / deleted:** never applied. The event, the project's Podio list and the dashboard show "Changed in Podio. Nothing here was
  changed automatically." with the change (date moved, date set/cleared, job changed, Not required, no longer in Podio) and
  **Use Podio date** / **Keep as is** (both audited). A linked event later set to Canceled in Podio is flagged the same way.
- **Hand-made duplicates:** if the job already has a hand-made ("Podio unplanned") hygiene event with the same code, a start date within 3 days,
  or (Podio has no date) a current one, nothing is created. Staff get **Link 0019401-001** or **Create a separate event** on the project, and
  **Link to this Podio event** / **Not this one** on the hand-made event. Link fills empty fields only (date, Mines Act etc. kept).

## Why client-side, not a DB cron
- Every create goes through the app's existing sync (upsert by id, audit, tombstones, v46 three-way merge). No new write path, no service key,
  no SQL that writes envss_events.
- Idempotent: event id is `e-podio-<Podio item id>`, so two devices creating it write the same row. It runs only after this device has pulled
  events, tombstones and projects. Before the first send of an auto-created event the app reads Supabase; if that row already exists (another
  device made it, edited it, or deleted it) Supabase's copy wins and nothing is sent. Never deletes anything. No Podio calls or writes.
- Trade-off: an event appears when any staff member has the app open (within 15 min), not the instant Podio changes.

## SQL
None required. Optional draft (NOT APPLIED): `work/hyg_v48_7_01_deleted_view.sql` (+ `_rollback.sql`) adds read-only staff-only view
`v_field_hyg_deleted` so the flag can say "deleted in Podio" instead of "no longer in Podio".

## Tests
`ROOT=/workspace/envss-auto node work/v48-7/test.mjs` (Pixel 7 412×915 and Chromebook 1366×768; each device has its own browser storage;
Supabase mocked in memory, *.supabase.co mapped to a dead port). Results `test-results.json`, screenshots `shots/`.

## Dry run against the live mirror (read only, 23 Nov 2026 ~7:10 pm AWST)
`/workspace/envss-auto-dryrun/dryrun.mjs` runs this field.html on a read-only copy of podio_items (app 24280319), envss_events,
envss_deletions and envss_projects, with nothing sent. Day one: 8 events created, 1 link offer (0019185-001), 123 items not planned,
3 planned but older than 7 days, 2 already linked. Rerun 23 Nov 8:10 pm AWST (copy incl. samples and all tombstones,
`LIVE=/workspace/envss-auto-dryrun/live-20261123-2010.json`): same 8, with 0019401 now **0019401-001** (Minah's deleted hand-made
0019401-001 had no samples).

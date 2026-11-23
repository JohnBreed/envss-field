# v48.7 draft — field events created automatically from Podio (open item 11)

John: rules 20 Nov 2026 AWST, build approved 23 Nov 2026 AWST. **Draft only. Not published:** merging field.html to main publishes the live app.
Numbered 48.7 because 48.6 (linked samples, PR #14) is a separate draft. Rebased on main (v48.5 merged as ef2874a).

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
3 planned but older than 7 days, 2 already linked.

# New Podio event apps for "1.6 ENVSS Project Events" — field-list spec (draft, 26 Nov 2026 AWST)

John decided (26 Nov 2026 3:15 pm AWST) to create three new Podio apps: **Occ Noise Event**, **Ventilation Survey Event** and
**Onsite Respirator Fit Test Event**. Nothing has been created in Podio by Grok Bot (read only).

Files
- `podio-new-event-apps-fields.csv` — one row per field, per app (opens straight into Google Sheets). Columns: label to type,
  Podio field type, the external id Podio will give it, options, required, the matching HYG Assessment field, and how the field app uses it.
- `hyg-assessment-events-24280319-fields.txt` — the live HYG Assessment Events field list (89 fields incl. deleted ones) it was modelled on.

Rules that make auto-create work with no code change
1. **Project** must be an app reference to the Projects app **21851342** (as HYG) — that is how the field app picks the project.
2. **Event Reference** in the HYG format `{job}-{client}-HYG-{codes}-{site}` (codes e.g. NSEOC, VENT, RFT) so job number and scope read right.
3. **Site Works Start Date**, **Site Works Start Date Status** (same three option texts as HYG) and **Report Status** (same option
   texts as HYG) — these decide planned / finished / cancelled, exactly as for HYG events.
4. Type the labels exactly as in the CSV. Podio makes the external id from the label; the field app already maps these ids
   (event-reference, report-status, coc-status, poc-*, site-works-attended-by, all-equipment-required-details, …) onto the HYG ones.

How each app maps in the field app (v48.14, `PODIO_EVENT_APPS` in field.html)
| Podio app | Field event | Code | Notes |
|---|---|---|---|
| HYG Assessment Events (24280319) | hygiene | {job}-001… | live now |
| Occ Noise Event (30888380) | hygiene, kind "noise" | {job}-00n | noise samples go in the event (noise.js); main has no separate noise event type |
| Vent Survey Event (30888385) | hygiene, kind "vent" | {job}-00n | |
| Onsite RFT Event (30888384) | fit | {job}-FIT-00n | made with fit-test.js numbering; hand-made fit events on the same date get a Link offer instead |

John created them 26 Nov 3:29 pm AWST as copies of the HYG app (same field ids) — see new-apps-vs-spec.md.

To switch them on
1. Make sure the Dashboard Bot Podio sync copies the new apps into `podio_items`.
2. Put the three app ids into `work/hyg_v48_14_01_podio_events_view.sql` and apply it (DRAFT, not applied; rollback file beside it).
3. The ids are already in `PODIO_EVENT_APPS` in field.html (enabled). Nothing happens until the view exists.

Existing apps checked (read only) and NOT used
- **Noise Monitoring Event** (24241557, 167 items, 3 new in the last 30 days): environmental boundary noise monitors linked to ENV
  projects (e.g. "NSE01 Northern Boundary"; fields power supply, weekly rate, related equipment). Not occupational noise.
- **Respirator/Ear Fit Test Event** (23786375, 11,751 items, ~200 a month): one item per person tested (Calendly/Zapier bookings +
  PortaCount results, ids like FTR11925…), no Project link field. Not one event per job, so not used for auto-create.

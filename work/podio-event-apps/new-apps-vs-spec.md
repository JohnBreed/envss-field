# The three new Podio apps vs the spec (read only, 26 Nov 2026 ~3:35 pm AWST)

| App | App id | Fields | Link |
|---|---|---|---|
| Occ Noise Event | 30888380 | 77 (incl. deleted) | https://podio.com/envsscomau/sampling/apps/occ-noise-event |
| Onsite RFT Event | 30888384 | 67 | https://podio.com/envsscomau/sampling/apps/onsite-rft-event |
| Vent Survey Event | 30888385 | 67 | https://podio.com/envsscomau/sampling/apps/vent-survey-event |

All three are copies of HYG Assessment Events (24280319) and keep the HYG **external ids**, so the field app reads them with no mapping:
- Project link `project` → Projects apps 21851342 (Occ Hygiene) + 25367600 ✔
- `job-number` (calc) ✔, `reference-3` ("… Event Reference") ✔, title calc `afm-title` ("… Event Title") ✔
- `site-works-start-date` ✔ and `site-works-start-date-status` with the same 3 option texts ✔
- `generate-final-report` "Report Status", required, same 15 option texts as HYG ✔
- `report-submitted-by` "Site Works attended by" (assigned tech, Staff app 21061319) ✔
- `task-description`, POC fields, `site-contact-namephone`, `google-drive-job-folder-link`, `equipment-details`, `field-sheet-link` ✔
- Lab fields: Occ Noise keeps `generate-report` (COC Status), `send-report`, `laboratory-cassette-bookings`; lab app link and turnaround
  (`which-laboratory-is-processing-samples`, `selection`) are gone. Onsite RFT and Vent Survey have no lab fields. Fine for these event types.

Missing — John may want to add (none are needed for auto-create to work)
- All three: a **Notes** field for office notes to the tech (optional; the app prefills Task Description today).
- All three: the title calc and reference still read like HYG copies — check the **Event Title** formula and the
  **Event Reference** format use the right code (e.g. `{job}-{client}-HYG-NSEOC-{site}`, `-VENT-`, `-RFT-`); the field app reads work
  types and the job number from the reference.
- Occ Noise Event: Noise Assessment Type; Number of Personal Dosimeters; Dosimeters Booked (serials); Sound Level Meter Required;
  SLM Serial; Acoustic Calibrator Serial; Calibrator Calibration Due; Shift Length (hours); Noise Exposure Standard.
- Vent Survey Event: Survey Type; Number of Systems / Test Points; Test Standard / Method; Instruments Required; Previous Test Report Link.
- Onsite RFT Event: Fit Test Type; Number of Attendees; Attendee List; Respirators to Test; PortaCount S/N; Fit Test Protocol;
  Site Access / Induction Requirements; Fit Test Reports Drive Folder Link.
- Leftovers John may want to hide/remove: "Job Type of HYG Event", "Mark This HYG Event as Invoiced?", "xx HYG Event Start Date",
  lab-cost / cassette fields on RFT/Vent copies (already removed there).

Mirror (podio_items)
- Not mirrored yet (0 items). The sync auto-discovers new apps in the space: `podio_apps.sync_enabled` defaults to true and every
  app in space 6088520 is enabled. "discover" runs about every 6 h (last 26 Nov 10:29 am AWST; next expected ≈ 4:30–5 pm AWST),
  then backfill + the 15-min incremental runs pick them up. **No sync change is needed**; just confirm after the next discover run:
  `select app_id, count(*) from podio_items where app_id in (30888380,30888384,30888385) group by 1;`
- Still needed (DRAFT, NOT applied): `work/hyg_v48_14_01_podio_events_view.sql` (+ rollback) — the staff-only read-only view the field
  app reads for these apps. Until it exists the app gets 404 and ignores them (asks again every 6 h).

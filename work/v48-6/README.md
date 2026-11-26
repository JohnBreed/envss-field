# v48.7 — Linked Sample A, B, … (open item 24)

John, 23 Nov 2026 AWST (built as the v48.6 draft); renumbered v48.7 on top of main v48.6 (project list Layout A, #18), 25 Nov 2026 AWST. Merging field.html to main publishes the live app.

- On a personal sample (airborne personal, passive badge, noise personal) that has **no name** and has **not been
  started**, a "Link samples to one person" box lists the other not-started, unallocated personal samples. Tick, Select,
  Link: the group gets the next free letter in the event (Linked Sample A, B, …). Nothing to type.
- The label shows as a chip on the sample screen and as a tag on the event's sample list. It stays as secondary text
  once a name is entered; the v46 "This person's samples" box then takes over as before.
- Changing first / last name, date of birth, sex, company, occupation, occupation code or SEG on one sample in a
  group asks once (after leaving the person fields): "This will also fill Linked Sample A: samples 2, 3. OK?"
  OK fills the others (audit entry on each); Cancel changes only that sample (audited as declined).
- Never filled: started samples, rejected / fault samples, samples whose name is a different person.
  v46 silent carry-across of location / date / shift / roster now also skips started samples; SEG moved to the
  confirm set.
- Respirator (John, 25 Nov 2026 AWST): a change to Respirator worn? / brand / model / clean-shaven / fit-tested on one
  sample in a group asks once — when the answer is complete (No / Unknown, or Yes with model + both questions), or when
  the sample is left. OK fills the group's other airborne personal samples on the same day INCLUDING running / stopped
  ones (audit entry each); Cancel changes only that sample. Never rejected / fault samples, never another person's
  sample. The v46 silent respirator carry-across now applies only to untagged same-name samples.
- Stored as `linkLabel` next to the existing `personTag` on the sample record (syncs in the payload).
  "Clear this sample's information" also clears the label. Static, field blank and AFM samples are never offered.

Test: `ROOT=/workspace/envss-li node work/v48-6/test.mjs` (Pixel 7 412×915 and Chromebook 1366×768; Supabase mocked
in memory and *.supabase.co mapped to a dead local port). Results in `test-results.json`, screenshots in `shots/`.

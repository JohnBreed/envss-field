# Stage 1: send the chain of custody to the lab (v48.19, branch `feat/v48-19-coc-send`)

Tech reviews a generated Form 302 CoC in the field app, ticks **I have checked the CoC**, taps **Send**. The email goes **From lab@envss.com.au To ohlwa@mpl.com.au**. Nothing here sends by itself, and nothing in this branch has been deployed, applied, published, or emailed.

## How it works
1. **Event page** gets a "Chain of custody to the lab" card (status, last send, **Review and send CoC**). Not shown on AFM events.
2. **Review screen** (full-screen dialog, so auto-update waits while it is open): helper steps, From/To/Results/Invoice, **Step 1 checks**, **Step 2 when and where to collect** (day, time from, optional time to, location; location defaults to the ENVSS office, editable), **Step 3 the CoC page as a zoomable image** + the sample list, **Something looks wrong**, then a sticky bar: tick + Send.
3. **Generated, never typed.** The Form 302 spreadsheet comes from the app's own `buildCocV45c`. The PDF is drawn from the same samples by `coc-send-core.js` (one drawing list is drawn to the PDF **and** to the on-screen image, so the tech sees exactly what is attached). The only things the tech types are the collection details (and a reason for an amended / repeat send, and an error comment). None of it can change the CoC rows.
4. **Send** = the app uploads the xlsx + PDF to `field-exports/g/<job>/<event>/coc-send/<id>/` and inserts one `envss_coc_sends` row (status `queued`). Offline: the tap saves the send on the device (IndexedDB) and it goes when back online (the tap is still required). The existing Drive queue then copies the xlsx, PDF and a CSV into `{job}_Field-App`.
5. **Worker** (`work/coc-send-worker`, Apps Script as developer@) sends the email as lab@, once, and updates the row (`sent`, Gmail message id, time).

## On the CoC (John t769u/t770u)
- Job number + sample details only. **No project name, client, site, sampler names, initials, mobile or personal email.** Contact Person / Project Mgr / Sampler = "ENVSS office"; Print name = "ENVSS"; Signature = "ENVSS Field app".
- Phone = **08 9355 4010** only (template "Mob:" label and number removed). Results to **lab@envss.com.au**, invoices to **accounts@envss.com.au** (template said "accounts@ & lab@"). **ESDAT** ticked on Form 302, written in Lab Comments, and a red "RESULTS REQUIRED IN ESDAT FORMAT" banner on the PDF and in the email.
- These Form 302 changes are in the shared `buildCocV45c`, so the existing manual **Create COC** download gets them too.
- The email has no Cc and no tech name or address. A privacy lint scans the generated spreadsheet, PDF text, email and file names for tech / worker / project / client names, other emails and any phone number except the office (and Envirolab's own 1300 number printed on the form) and **blocks** if it finds one.

## Pre-send checks (block = Send disabled; warn = shown and logged)
`fix: tech` = the tech can correct it in the app (an Open sample button is shown). `fix: app` = the generated CoC or app set-up is wrong: Send stays blocked and the tech is prompted to send an error report.

| | Check | Level | Fix |
|---|---|---|---|
| John's list | Every sample has a volume, and it equals avg flow × run time (recomputed independently from raw start/stop/flows, compared with **both** the generated spreadsheet cell and the PDF model; tolerance 0.05 L) | block | tech if data missing; **app** if generated ≠ recomputed |
| | Field blanks show N/A for run time and volume | block | app (generated) · warn if a blank has flow/times typed |
| | Rejected samples have a reason; the CoC comment says rejected / voided | block | tech (reason) · app (comment) |
| | No duplicate sample IDs (and no duplicate sample numbers); no missing ID | block | tech |
| | Every sample has an analysis requested | block | tech |
| | Sample count: spreadsheet rows = PDF rows = the event's samples (counted independently, not-used left off) | block | app |
| | No missing / backwards start-stop times; no flow | block | tech |
| | Collection day, time, location present; day not in the past; end after start; location not trivially short | block | tech |
| Also added | Samples not finished (existing v48.3 gate) | block | tech |
| | Job number is 7 digits | block | app |
| | Form 302 holds 58 rows | block | app |
| | Analysis shown by raw code (no catalogue name) | block | app |
| | Generated spreadsheet: ESDAT ticked, results email, invoice email, office phone | block | app |
| | Privacy lint (see above) | block | app |
| | Generator / PDF / library failure | block | app |
| | Error report already raised for this CoC + app version | block | app |
| | One flow reading only (volume uses it); run > 16 h; run < 30 min; flow outside tolerance; sample date > 1 day from event; no location; no field blank on the event; sample-number gap; not-used samples left off; rejected with no volume; collection on a weekend or outside 7:00–17:30 or already passed today | warn | tech |

## Duplicate / resend guard
Hash of (job, event, turnaround, collection, every sample's id/no/date/type/analyses/run/volume/comment). Same hash already `queued/sending/sent` → "already sent", Send disabled; a "lab didn't get it" path asks for a reason and is throttled (10 min). Different hash after a send → offered as **AMENDED** (subject, body, `resend_of`), reason required and logged. The table has partial unique indexes on the hash as well, so two devices can't both send the same CoC.

## "Something looks wrong" (error report to john@envss.com.au)
Tech ticks the flag and writes **at least 20 characters** (prompted; counter shown). Raised automatically-prompted when an app-side check fails, or by hand from the preview at any time (a manual flag blocks Send while ticked). The report is a queued `kind='alert'` row that the tech sends with a tap; the worker emails John from lab@ with: **tech's flag + comment at the top**, job, event, project id, every sample with raw times/flows/recomputed volume, each failing check with value and expected, the spreadsheet rows and page rows as generated, collection entered, content hash, app version, device/browser, screen, online state, tech user, time (AWST + ISO), attachments: CoC PDF, page PNG(s), spreadsheet. Flag + comment are stored in `tech_flag` on the row. After a report, Send to the lab stays blocked for that CoC content and app version (changing the samples or updating the app unblocks it).

## What John / Josh must do to enable sending (nothing is done yet)
1. **Apply** `work/coc_v48_19_01_envss_coc_sends.sql` (draft; rollback alongside). The table pins recipients: kind `send` → `ohlwa@mpl.com.au` only, kind `alert` → `john@envss.com.au` only, From `lab@envss.com.au` only. Changing an address is a new migration (deliberate).
2. **Supabase**: Project Settings → API Keys → new **secret key named `coc-worker`** (not service-role). Revocable on its own.
3. **Google Workspace**: make **lab@envss.com.au** a verified **Send-as** alias on **developer@envss.com.au** (Gmail → Settings → Accounts → Send mail as; the verification email goes to lab@, so someone who reads lab@ clicks it). If lab@ is a Google Group, an admin must allow it as an alias / Send-as (Admin console → Gmail → "Allow per-user outbound gateways" is not needed; "Let users send from groups" / group alias settings are). The worker refuses to send if the alias is missing, because Gmail would otherwise silently send From developer@.
4. **Apps Script** (signed in as developer@, tell John first): new project "ENVSS CoC send", paste `work/coc-send-worker/Code.gs` and `appsscript.json` (Gmail advanced service v1, scopes gmail.send + gmail.settings.basic), Script property `coc-worker` = the key, run `checkSetup` (sends nothing), then `installTrigger` (every minute).
5. Storage already allows `field-exports/g/…` inserts (drive_v45d_01). Nothing else.
6. Alternative, not built: a Supabase edge function sending as lab@ through a Google service account with domain-wide delegation. More secret handling and an admin-console grant; the Apps Script worker reuses the existing Drive-worker pattern.
7. On publish: bump the version / `CACHE` in `sw-field.js` (this branch keeps 48.19) and tag `rollback-v<prev>`.

## Tests
`node work/v48-19/coc-send-core.test.mjs` (41, pure) · `node work/coc-send-worker/worker.test.mjs` (16, Apps Script + Gmail mocked) · `ROOT=<worktree> OUT=/workspace/guard-shots/v4819 node work/v48-19/coc-send.test.mjs [pixel7|chromebook]` (browser; Supabase mocked, `*.supabase.co` mapped to a dead port, no email). Screenshots: `/workspace/guard-shots/v4819/coc-*.png`.

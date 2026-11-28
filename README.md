# ENVSS Field

Offline-first sample-train capture for Environmental Site Services.

Live (after Pages is on): `https://johnbreed.github.io/envss-field/`

## Enable GitHub Pages

1. Open https://github.com/JohnBreed/envss-field/settings/pages
2. Source: **Deploy from a branch**
3. Branch: `main` / folder `/` (root)
4. Save. Wait a minute.

## Google Workspace sign-in

GitHub Pages is a static site. Google sign-in uses Google Identity Services in the browser. No server secret.

1. Google Cloud Console → APIs & Services → Credentials → Create credentials → **OAuth client ID** → **Web application**.
2. Authorised JavaScript origins:
   - `https://johnbreed.github.io`
   - `http://localhost:8080`
3. Copy the client ID into `config.js` → `googleClientId`.
4. Restrict the OAuth consent screen to the `envss.com.au` Workspace if you want.

After that, staff sign in with their Google Workspace account. The name and email stay on that device until they tap Sign out.

## Vent survey measurements (v48.19, `vent.js`)

Events linked to the Podio *Vent Survey Event* app (`podioEventKind: "vent"`) record measurements instead of samples:
anemometer make/model/serial once per event, then one measurement per extraction unit + location with a numbered
velocity list (m/s), automatic average/lowest/highest, optional "distance where velocity < 0.5 m/s", comments and photos.
Measurements are ordinary train rows (`trainKind: "vent"`, data in `t.vent`) so they save offline and sync like samples.
No COC (vent trains are left out of COCs on mixed events), no Podio writes, no Drive sheet fill: the event menu has
"Export vent survey CSV" in the Drive template's column order. Tests: `work/v48-19/vent.test.mjs` (Pixel 7 + Chromebook).

**Fume cupboard audit** (type `grid`, first on the Add measurement screen) walks the tester through
AS/NZS 2243.8:2014 in four steps, each citing its clause: (1) Unit details: location, F/C number, type, make/model/serial,
new or existing installation (A4.1.3 empty / A4.1.2 normal working conditions), empty or equipment inside (photo or plan,
A5), smoke source (air current tubes, A3), fan condition. (2) Smoke test (Appendix A), done before face velocity (A4.1.1;
a soft gate with a logged "record anyway"): A4.2(b)–(k) in order, each asked as a question (paraphrased, not the
standard's text) and answered with one tap G Good / S Satisfactory / D Dangerous (A5) or N/A (always needs a reason),
with the meanings under the buttons and an optional "Help me decide" matrix (rows = what the smoke did, cell = rating).
Each position has an optional "What did you see?" note and photos; the notes feed the A4.2(l) observations in the
Figure A1 record and CSV. Result = worst rating, compliant if all S or better (A6). Step 1 and 3 prompts are questions too. (3) Face velocity
(Appendix B): opening width × height (mm) sets the B4.2(c) grid (first/last lines 100 mm in, not more than 250 mm
vertically / 500 mm horizontally, fewest lines; 2000×1800 → 5×8 = 40, 600×500 → 2×3 = 6); a manual grid (default
4×7 = 28) has an optional reason that never blocks. Points are lettered A, B, C… across each row from top left (Figure A1
note 4); Enter moves to the next letter. Older records keep their stored "point N" keys and show "was N" beside the
letter (nothing moved). Readings are stored raw; reported figures add the anemometer calibration correction (Figure A1
note 3). cl. 3.1.2 indicator (average ≥ 0.5 m/s, no point < 0.3 m/s). (4) Summary: smoke result, face velocity result,
overall, and a Figure A1-style record. "+ Another condition on this unit" copies the unit details and opening.

**Anemometer** (once per event): Owned / Hired (supplier defaults to Airmet when Hired), make, model, serial, last
calibration date, calibration due date, correction (m/s at m/s) and a "Photo of calibration certificate" (stored on the
device and uploaded under `…/t/vent-cert-<event id>/`). Warnings, never blocks: due date before the survey date, missing
dates, last calibration over 12 months before the survey (B3), missing or non-numeric correction, no certificate photo.
Shown on the event page, in step 3, the summary, the Figure A1 record and the CSV.

The single-location Face velocity type stays on the Add screen. The event page shows a velocity summary table (with Smoke
and Overall). The CSV puts the 0019340 Sheet1 columns first (distance header in metres, (m); blank column A omitted),
then app-only columns (raw reading, correction, smoke, overall, location, installation, empty, anemometer owned/hired,
supplier, calibration dates and check), a Summary block with an anemometer line, and one Figure A1 record per audit.
Type picker pictures are freely licensed (credits on each card and in `assets/vent/ATTRIBUTION.md`), precached by
`sw-field.js`, with an SVG icon if a picture fails.

# v49 — Detailed Occupational Noise Assessment (draft, not live)

Build approved by John 12 Nov 2026 9:41 pm AWST. **Draft PR only — publish needs John's separate OK.**

## What it is
A new event type, **Detailed Occupational Noise Assessment** (`type: "noise_assessment"`), in the New project event
dropdown next to *Hygiene event* and *Airborne fibre monitoring (AFM)*. Fully separate, built only in `noise.js`
(NZA section near the end). Hygiene and AFM events, their samples and the v47/v48 noise panel on hygiene noise samples
are unchanged (tests render those screens on v48 and v49 and require identical HTML).

## Flow (John 10–11 Nov 2026)
1. Pick the type → event created with **no samples** (code follows the job sequence, e.g. `0099999-002`).
2. **Before site**: add dose badges (serial, model) and the sound level meter with its **calibration certificate**
   (photo + certificate number, calibrated-on and next-due dates).
3. **On site**, per field day (multi-day jobs: each day):
   - Start-of-day calibration for every badge and SLM (calibrator level, meter reading, time/who/device/GPS stamped).
   - Measurements one at a time as collected (floating **+** = *Add measurement*):
     - **SLM reading (area / task)**: location, SLM reading no., duration, source, conditions, position,
       LAeq (required), LCpeak, LCeq, optional octave bands, Spectrum Table photo prompt (LCpeak ≥ 140 dB(C) or
       LAeq > 110 dB(A), from v47), **A6**: area LAeq ≥ 85 dB(A) → flag + affected-area extent and distance.
     - **Dose badge result (personal)**: the only place personal details are asked (name, occupation, company, DOB,
       SEG optional), task, start/stop, LAeq (required) + LCpeak only (Minah: no LCeq / spectrum on dosimeters),
       HPD questions (worn?, brand/model, style, class and attenuation as separate fields, fit-tested? → PAR).
     - Values from a **photo of the meter screen** (OCR, v47) or typed — never both; a misread value can be corrected
       with the photo reading kept. Photo of the meter = in-field source-of-truth check.
   - End-of-day calibration for every badge and SLM.
4. **Flags for the team** (never block): calibration deviation / drift beyond ±0.5 dB (v47 value), certificate past
   due, start ≥ stop, odd duration, LCpeak < LCeq, A6, spectrum photo missing, possible duplicates in the event.
   Field note per measurement. Meter downloads / charts stay at reporting.
5. **Mark event complete** is blocked only by missing required data (LAeq, instrument, person + HPD answer on badges,
   location + area/task on SLM readings, start/end-of-day calibration for each instrument used that day, a certificate
   for each SLM used). Flags are listed in the confirm ("N flags will be referred to the team").
6. Export CSV (one row per measurement, flags included) / JSON from ☰ — through the core download, so the existing
   Drive copy queue picks them up like Hygiene exports.

## Data
- Everything on the event record: `ev.nza = { badges[], slms[], cal{day:{calibrator,start{instId},end{instId}}},
  readings[], days[], audit[], seq }`. Synced by the existing `envss_events` payload (jsonb, no constraints/triggers).
- **No SQL needed.** No new tables or columns, no new IndexedDB databases or stores (`envss-field-photos`,
  `envss-field-drive`, `envss-field-v46` unchanged). Photos use the existing photo queue (`field-photos` bucket path
  `p/<project>/e/<event>/t/<measurement-or-SLM id>/<pid>.jpg`).
- Measurements are never deleted: *Void* keeps them (with reason) in the record and audit log.
- The generic v40 event change-log is skipped while a noise assessment is open (it would copy every measurement
  into `ev.audit` on each save); NZA keeps its own audit in `ev.nza.audit` (who, login, device, GPS).

## Tests
`ROOT=<repo> OUT=<shots dir> V48ROOT=<v48 checkout> node work/v49/test49.mjs` (headless Chrome, CrOS 1366×768 and
Pixel 7 412×915 UAs, mock Supabase — no production calls). Fixture = pre-v49 localStorage data + an existing
IndexedDB photo record.

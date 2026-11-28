# v48.19 Hearing protection onsite (optional capture) — DRAFT

Branch `feat/v48-19-hpd`, stacked on `feat/v48-19-lockdown-guards`. Not published. No SQL to apply (see "Data"). Same app version string (48.19); `hpd.js` and `hpd-library.js` load after `fit-test.js`.

## What John asked (28 Nov 2026)
An option, on ACA-NSED, NSED and NSEOC events, to photograph the boxes of whatever HPD the crew has onsite, like section 7.7 of report 0019037 (product, Class, expected attenuation).

## Walkthrough (event screen, card "Hearing protection onsite")
Shown on events that include noise: service codes with NSE (NSEOC, NSED, ACA NSED), Podio noise events, or any event that already has a noise sample. Never on AFM, fit-test or vent events. Optional: it is not in `answerItems`, not on Mark event complete, not on Create COC.

1. **Photograph HPD box** (camera) or **Choose photos**. Each photo makes a new product entry at once, so a photo is never lost. **Another photo of this box** adds the back or side to the same product.
2. The photo is read in the background with the existing Google Vision function (`ocr-fit-report`, key stays server side). It offers up to three library matches ("The photo looks like: 3M E-A-Rsoft SuperFit · Class 4 · 24 dB") and pre-fills "Printed on the box" Class / SLC80 if the box text states them (marked "read from the photo, check").
3. The tech taps a suggestion, or types in the search box (brand, model, part code), or picks **Not in the list** and types the name as printed (office completes Class / SLC80 later).
4. Choosing a product fills **Class**, **SLC80 (expected attenuation, dB)**, type, and a basis chip: *manufacturer value* or *ENVSS reports (unverified)*. A "check the box" chip shows with a plain-language reason where sources disagree.
5. **Printed on the box (optional)**: Class and SLC80 as read off the pack. They win over the library for every check. If the box disagrees with the library, or Class does not fit the SLC80 band, the card says so and the office confirms.
6. **Worn by (optional)**: tick the personal noise samples (workers) who use that product. Blank = onsite for everyone.
7. **Type it in** adds a product with no photo. **None onsite** is a valid answer (undo available). No answer is also fine.
8. **Exposure check (indicative)** under each product, for the ticked workers (or all) who have an LAeq: class needed for that LAeq, LCpeak ≥ 140 dB(C) → Class 5, protected level, adequacy. Marked indicative; the report is still the office's call.
9. On a worker's own sample, the existing "Hearing protection worn?" block gets **Pick from the onsite HPD list**, which fills Brand/model, Style and Class/attenuation (still editable).

## Exposure check method (AS/NZS 1269.3:2005, paraphrased; no standard text is in the app)
| Step | Rule used | Source |
|---|---|---|
| Class needed | LAeq,8h with L(crit) 85: under 85 none; 85 to under 90 → 1; 90–95 → 2; 95–100 → 3; 100–105 → 4; 105–110 → 5; 110 or more → octave-band method, ask the office | Appendix A cl A2.1, A2.2, A3.1, Table A1 |
| Class from SLC80 | 10–13 → 1, 14–17 → 2, 18–21 → 3, 22–25 → 4, 26 or more → 5 | Table E1 |
| Protected level | LCeq − SLC80 when LCeq is entered (ENVSS NSEOC method); otherwise LAeq − SLC80 (ENVSS dosimetry convention in 0019037, e.g. 90 − 29 = 61) | cl A2.3 allows SLC80 as an alternative procedure; the LAeq variant is an ENVSS convention |
| Adequate | protected level below 85 dB(A) | L(crit) |
| Over-protection | 70 dB(A) or less "could" lead to it | cl 6.2.2 (ENVSS reports use 65: open question) |
| Peak | LCpeak ≥ 140 dB(C) needs Class 5 | App B as quoted by WorkSafe WA code / ENVSS reports |
| Not computed | Dual protection (cl 6.2.5 says do not add; ENVSS "higher SLC80 + 5 dB" is unconfirmed), wearing-time derating (cl 6.2.3, WorkSafe code 5.3), fit | left to the office |

Constants at the top of `hpd.js`: `OVER_DB`, `CRIT_DB`, `PEAK_CLASS5_DB`.

## Data
* `ev.hpd` on the **event** record: `{ v, status: "" | "none_onsite", items: [{ id, photos[], libId, other, name, boxClass, boxSlc80, boxSrc, appliesTo[], note, ocr{state,text,suggest,printed}, addedAt, addedBy }], updatedAt, by }`. It rides inside the existing `envss_events` payload, so **no SQL is needed**. Every change adds an `ev.audit` entry (field `hpd`).
* Photos: the shared photo store (`envssPhotos.add`, holder id `hpd:<eventId>`, field `hpd`): shrunk to 2000 px, IndexedDB, queued upload to `field-photos` at `p/<project>/e/<event>/t/hpd_<event>/<uuid>.jpg`, then the normal Drive copy. Drive name `<eventCode>_hpd_photo_<n>.jpg` in `{job}_Field-App` (same folder as the other photos; `Code.gs` needs no change because it uses the file name in the queue row).
* Core changes in `field.html`: `markOnRecord` (uploaded flag for event photos), `photoTypeOf` + `onPhotoUploaded` (hpd name), two script tags. `sw-field.js` caches both new files.
* Library `hpd-library.js` is generated (`work/v48-19/hpd-library/gen_js.py` from `library.json`, which came from the "ENVSS HPD Library (DRAFT 2026-11-28)" Google Sheet). 55 products, 29 with a manufacturer value (the rest use ENVSS report values, marked unverified). The app uses the manufacturer value when there is one (Class follows the SLC80 band), otherwise the most common report value, marked unverified.

## Tests
* `node work/v48-19/hpd.test.mjs` (43 checks: library integrity, class bands, assess, search, OCR suggestion, box mismatch, event eligibility).
* `ROOT=$PWD OUT=/workspace/guard-shots/v4819 node work/v48-19/hpd-test.mjs [pixel7|chromebook]` (Puppeteer, Supabase and Vision mocked, nothing leaves the box). Screenshots: `hpd-pixel7-*.png`, `hpd-chromebook-*.png`.

## Not done / needs John
See the PR description (open questions). Nothing here writes to Podio or a job folder; no email.

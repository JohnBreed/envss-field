# v45d checks (8 Nov 2026)

Headless Chrome at 1366×768 (Chromebook-sized). No page errors. SQL was not applied. Nothing was written to Podio or to Google Drive.

## COC

Generated from the real `buildCocV45c` path (embedded Form 302 template) for event `0019333-001`.

One analyte, `Lead, inorganic dusts and fumes`:

- Column F width 20 (was 5.5). `Tests Required` sits in that cell, horizontal, not rotated.
- The analyte name is horizontal, wrapped, Arial 10 bold. Row 17 height 38. No cell in the file uses text rotation.
- Sample-info columns A–E are unchanged (14.63, 21.88, 8.13, 9, 13.88).
- Run Time (min) width 13, Volume (L) width 11.
- A field blank comment is `Field blank`. A rejected field blank is `Field blank; voided needs clean and return`.
- Print is still A4 landscape, fit to 1 page wide.

Six analytes (inhalable, respirable, silica, diesel particulate, welding fume, lead): widths 8, 8, 8, 10, 8, 13. `Tests Required` is merged F16:K16 (about 55 width units). Row 17 height 68 so the longest name wraps on several lines. Run time is column L, volume column M, comments N:W.

## Photos

Long edge 2000 px, JPEG quality 0.8 (was 1600 px, 0.7). Same shrink path the app uses (`envssPhotos.shrinkSrc`).

| Source | Before | After | Pixels after |
| --- | --- | --- | --- |
| Noisy full-frame photo, 4032×3024, JPEG 0.92 | 9,852,778 bytes (9.4 MB) | 807,381 bytes (0.81 MB) | 2000×1500 |
| Page of writing, 4032×3024, JPEG 0.92 | 864,279 bytes | 233,534 bytes | 2000×1500 |

A real phone photo of a cassette is usually a few megabytes and lands in the same band as the noisy frame. The page of writing stays large enough that filter IDs and log lines remain readable (the test drew them at a size that is still about 36 px after the resize).

## Drive names and folder match

`0019333-001_S03_filter_1.jpg`. A second COC is `0019333-001_Laboratory_COC_2.xlsx` (the download the sampler gets keeps the original name).

Folder match, shared-drive search by name only:

- `0019333 …` → `12U0YFSi3_yhY9ItrsGt0G2t67OW7bayx`
- `0019032 …` plus siblings `0019032_Admin` and `0019032_Lab` → `18vWLmc4YG8u7_oYngUaDtv6ppxpGiLb4` only
- No match, or two project roots → stopped, and the app says `Drive copy waiting: job folder not found` or `… not unique`

The same functions are in `field.html` and `work/drive-worker/Code.gs` (the test fails if they diverge).

## Podio planned events

Fixture `work/v45d/fixtures/hyg-0019333.json` (the live mirror’s item shape, job 0019333, project item 3384715481). Mapped locally:

- Reference `0019333-001` becomes the field event code, turnaround `3_day`, lab MPL Laboratories, start date 2026-11-07, POC and task text with the HTML stripped.
- A long `reference-3` (how all 92 mirrored rows actually look) does not invent an `-001` code.
- `Lab Results Received` / `Report Sent` is not planned.

In Chrome, Start fieldwork on that fixture created `0019333-009` with the prefill and the From Podio card, and it was not flagged unplanned. Start an event not in Podio created one event and showed `Not in Podio yet - office to create/link`.

Hire, same viewport: delivery address `10 Bermondsey Street, West Leederville WA 6007`. Air-Met equipment groups start with `Most used`.

## How to re-run

```text
node work/v45d/pure.test.mjs
PUPPETEER_CORE=/tmp/pw/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js node work/v45d/browser-check.mjs
```

`browser-check.mjs` serves the repo and opens `field.html` in system Chrome. It needs network once so ExcelJS can load from jsDelivr.

# v48.19 lab sync (stage 2 of the lab pipeline)

Branch `feat/v48-19-lab-sync`, off `feat/v48-19-lockdown-guards`. Pure core in `lab-sync-core.js` (browser: `window.ENVSS_LABSYNC`, Node: `require`). It reads, parses, matches and calculates. It does not send, publish, write to Drive or touch Supabase or Podio. Not wired into `field.html` or the service worker yet.

## What it does
1. **Field samples**: `normaliseTrain(payload)` (an `envss_trains.payload`) or `fieldFromTable(parseTsv(text))` (flat export, columns in `backtest.mjs`).
2. **Receipt** (Envirolab Sample Receipt Advice): `parseSraItems(items)` reads positioned text items (lab number, `Filter | date`, client ID, bullets under the rotated column headings). `itemsFromPopplerBbox(html)` turns `pdftotext -bbox` output into items (a pdf.js adapter is the same 6 fields). `parseSraHeader(text)` reads the reference, dates and sample count.
3. **ESDAT**: `parseEsdat(Sample4.csv, Chemistry4.csv)`. Only `Sample_Type = Normal` with a Field_ID is a client sample; MB, LCS and LAB_D rows are counted and never matched. A `<` Prefix keeps the value as the limit (`lessThan: true`). `Method_Type` splits the three gravimetric dust results (inhalable, respirable, welding).
4. **Matching**: `matchAll(field, sra, esdat)`: field to receipt by client sample ID, receipt to ESDAT by lab number, ESDAT Field_ID as a cross-check. Unmatched both ways, unused prepared samples, date differences, analysis-grid gaps and ID conflicts are listed, never forced.
5. **Calcs**: `sampleVolume` (average of start and stop flow x minutes), `massMg` (mg, ug, ng), `dmirsFactor(cat, shift h, days on, days off)` and `compareOne`.
6. **Rows**: `buildRows(job, matched, esdat)` gives one row per sample x analyte with the written calc note; `rowsToTable` / `csvOut` give the sheet table.
7. **Issued report check**: `parseReportText` (tables 5 to 8 from `pdftotext -layout`), `compareReport(report, rows)`, `parseReportTable2` and `compareReportTable2`.

## Rules baked in
* **TWA** = mass (mg) / sampled volume (m3), the concentration over the sampled time. The calc note says when the sample covers under 80% of the rostered shift (the TWA then assumes the unsampled time had the same exposure); a row is flagged under 50%.
* **DMIRS 2019** (Adjustment of atmospheric contaminant exposure standards, modified Quebec model): category 1 none; category 2 Fa = 8 / hours per shift; category 3 Fa = 40 / hours per week; category 4 the lower of the two. Hours per week = shift hours x days on x 7 / (days on + days off). Fa is capped at 1. Shifts under 4 h or over 16 h are not adjusted and are flagged. Categories come from DMIRS Table 1 (diesel particulate is not listed there; category 3 as in the issued report).
* **Limits by sample date** (John's rule): before 1 Dec 2026 both the WES and the WEL are compared; from 1 Dec 2026 the WEL only. The date used is the app shift date. `CFG.welFrom` holds the cut-over.
* **Official values** are in `ANALYTES` with the source text for each one: Safe Work Australia WES list (18 Jan 2024) and WEL list (Nov 2025). Two numbers in the issued report are not rows in the SWA lists and are marked `official: false`: respirable dust 3 mg/m3 and diesel particulate 0.1 mg/m3 (WES side). Inhalable dust 10 mg/m3 comes from SWA WES note (j) (nuisance dust, inhalable); the WEL list has no number for dust NOC.
* **Iron**: the limit is "as Fe", so the lab's Iron row is compared. The lab's Fe2O3 row is shown as information.
* **Gypsum WEL** is the respirable value (1.5); the filter is an inhalable sample, so the comparison is conservative (noted on the row).

## Tests
`node work/v48-19-lab-sync/lab-sync-core.test.mjs` (89 checks, results in `lab-sync-test-results.json`). Every fixture is made up (job 0000001, lab ABC0001, sample IDs TS1 and so on); no worker, client or lab data is in the repo.

## Backtest runner
`node work/v48-19-lab-sync/backtest.mjs --job <job> --field trains.tsv --sra-bbox sra_bbox.html --sra-text sra.txt --sample4 Sample4.csv --chem Chemistry4.csv --report report.txt --out outdir`
Inputs are local copies (PDFs converted with `pdftotext -layout` and `pdftotext -bbox`). It writes `rows.csv`, `rows.json`, `match.json`, `report-compare.json` and `tabs.json` into `--out`. Keep the outputs out of the repo (they carry real job data).

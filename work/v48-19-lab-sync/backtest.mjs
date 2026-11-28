/* Backtest runner for the lab sync core. Usage:
   node backtest.mjs --job 0019037 --field trains.tsv --sra-bbox sra_bbox.html --sra-text sra.txt --sample4 S.csv --chem C.csv --report report.txt --out outdir
   Inputs are local files (the PDFs are converted first with poppler: pdftotext -layout / pdftotext -bbox). Reads only; writes json/csv into --out. */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const L = createRequire(import.meta.url)("../../lab-sync-core.js");
const a = process.argv.slice(2), arg = k => { const i = a.indexOf("--" + k); return i >= 0 ? a[i + 1] : null; };
const rd = f => fs.readFileSync(f, "utf8");
const job = arg("job"), out = arg("out"); fs.mkdirSync(out, { recursive: true });
const field = L.fieldFromTable(L.parseTsv(rd(arg("field"))));
const sra = L.parseSraItems(L.itemsFromPopplerBbox(rd(arg("sra-bbox")))); sra.header = L.parseSraHeader(rd(arg("sra-text")));
const esdat = L.parseEsdat(rd(arg("sample4")), rd(arg("chem")));
const matched = L.matchAll(field, sra, esdat);
const rows = L.buildRows(job, matched, esdat);
const report = arg("report") ? L.parseReportText(rd(arg("report"))) : null;
const cmp = report ? L.compareReport(report, rows) : null;
fs.writeFileSync(path.join(out, "rows.csv"), L.csvOut(L.rowsToTable(rows)));
fs.writeFileSync(path.join(out, "rows.json"), JSON.stringify(rows.map(r => Object.assign({}, r, { faInfo: undefined })), null, 1));
fs.writeFileSync(path.join(out, "match.json"), JSON.stringify({ header: sra.header, sraWarnings: sra.warnings, esdat: { samples: esdat.samples.length, results: esdat.results.length, qc: esdat.qc, unmapped: esdat.unmapped, warnings: esdat.warnings }, stats: matched.stats, unmatched: matched.unmatched, checks: matched.checks }, null, 1));
if (cmp) fs.writeFileSync(path.join(out, "report-compare.json"), JSON.stringify({ reportRows: report.rows.length, reportWarnings: report.warnings, matched: cmp.matched.length, diffs: cmp.diffs, missingInReport: cmp.missingInReport }, null, 1));
/* tabs for the sheet builder (python/openpyxl or any other writer): plain 2D arrays */
const sig = n => (n == null || n === "" ? "" : n);
const tabs = {};
tabs["Sampling sheet"] = L.rowsToTable(rows);
const acts = [["Field ID", "Date", "Analyte", "Conc mg/m3 (TWA)", "Below LOR?", "Fa", "% WES adj", "WES risk", "% WEL adj", "WEL risk", "Occupation", "Location"]];
rows.filter(r => r.kind === "sample" && r.cmp && ((r.cmp.WES && r.cmp.WES.pct > 50) || (r.cmp.WEL && r.cmp.WEL.pct > 50))).forEach(r => acts.push([r.fieldId, r.date, r.analyte, r.twa == null ? "" : (r.lessThan ? "<" : "") + Number(r.twa.toPrecision(4)), r.lessThan ? "yes" : "no", r.fa == null ? "" : Number(r.fa.toFixed(4)), r.cmp.WES && r.cmp.WES.pct != null ? Number(r.cmp.WES.pct.toFixed(1)) : "", r.cmp.WES ? r.cmp.WES.risk : "", r.cmp.WEL && r.cmp.WEL.pct != null ? Number(r.cmp.WEL.pct.toFixed(1)) : "", r.cmp.WEL ? r.cmp.WEL.risk : "", r.occupation, r.location]));
tabs["Over 50% of a limit"] = acts;
const mt = [["Field ID", "Kind", "Receipt lab no", "Receipt date", "Receipt client ID", "ESDAT lab no", "ESDAT Field_ID", "ESDAT date", "App shift date", "ESDAT matched via", "Receipt grid tests"]];
matched.links.forEach(l => mt.push([l.field.fieldId, L.fieldKind(l.field), l.sra ? l.sra.labNo : "", l.sra ? l.sra.date : "", l.sra ? l.sra.clientId : "", l.esdat ? l.esdat.labNo : "", l.esdat ? l.esdat.fieldId : "", l.esdat ? l.esdat.date : "", l.field.shiftDate, l.esdatVia, l.sra ? l.sra.tests.join("; ") : ""]));
tabs["Match"] = mt;
const um = [["List", "Item"]];
const U = matched.unmatched; [["App sample with no receipt entry", U.fieldNoReceipt], ["Receipt entry with no app sample", U.receiptNoField], ["Receipt entry with no ESDAT sample", U.receiptNoEsdat], ["ESDAT sample with no receipt entry", U.esdatNoReceipt], ["ESDAT sample with no app sample", U.esdatNoField], ["App sample prepared but not used (no times, not a blank)", U.fieldUnused]].forEach(([k, a]) => { if (!a.length) um.push([k, "(none)"]); a.forEach(x => um.push([k, x])); });
const C = matched.checks; [["Receipt date differs from app shift date", C.sraDateVsShift], ["Receipt date differs from ESDAT date", C.dateMismatch], ["Receipt analysis grid differs from the app analysis plan", C.gridGaps], ["ESDAT Field_ID disagrees with receipt", C.conflicts], ["ESDAT analytes not mapped", esdat.unmapped], ["ESDAT warnings", esdat.warnings], ["Receipt parse warnings", sra.warnings]].forEach(([k, a]) => { if (!a.length) um.push([k, "(none)"]); a.forEach(x => um.push([k, x])); });
tabs["Unmatched and checks"] = um;
if (cmp) {
  const rd = [["Sample", "Report date", "Analyte", "Report result", "Report % of WES", "Ours (TWA mg/m3)", "Ours % of WES adj (DMIRS 2019)", "Difference", "Likely cause"]];
  cmp.diffs.forEach(d => rd.push([d.sampleId, d.date || "", d.analyte, d.report, d.reportPct || "", d.ours, d.oursPct || "", d.type, d.cause]));
  cmp.missingInReport.forEach(d => rd.push([d.sampleId, "", d.analyte, "(not in report)", "", d.ours, "", d.type, d.cause]));
  tabs["Report vs ours"] = rd;
  const t2 = L.parseReportTable2(rd0(arg("report")));
  const t2d = L.compareReportTable2(t2), tr = [["Analyte (report Table 2)", "Roster", "Report adjusted WES", "Ours (WES x DMIRS 2019 Fa)", "Likely cause"]];
  t2d.forEach(d => tr.push([d.analyte, d.roster, d.report, d.ours, d.cause]));
  tabs["Report Table 2 vs DMIRS"] = tr;
  var t2count = t2d.length;
}
function rd0(f) { return rd(f); }
const lim = [["Analyte", "DMIRS 2019 category", "Category source", "WES mg/m3", "WES is an SWA list value?", "WES source", "WEL mg/m3", "WEL source"]];
Object.keys(L.ANALYTES).forEach(k => { const a = L.ANALYTES[k]; lim.push([a.label, a.cat, a.catNote, a.wes.value == null ? "none" : a.wes.value, a.wes.value == null ? "" : (a.wes.official === false ? "no (benchmark used in the issued report)" : "yes"), a.wes.note, a.wel.value == null ? "none" : a.wel.value, a.wel.note]); });
tabs["Limits and sources"] = lim;
fs.writeFileSync(path.join(out, "tabs.json"), JSON.stringify(tabs));
console.log(JSON.stringify({ stats: matched.stats, unmatched: matched.unmatched, rows: rows.length, report: report && { rows: report.rows.length, warnings: report.warnings }, cmp: cmp && { matched: cmp.matched.length, diffs: cmp.diffs.length, missing: cmp.missingInReport.length } }, null, 1));

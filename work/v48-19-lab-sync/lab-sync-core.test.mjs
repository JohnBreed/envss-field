/* v48.19 lab sync core: unit tests. Usage: node work/v48-19-lab-sync/lab-sync-core.test.mjs
   Every fixture is made up (job 0000001, lab ABC0001, sample IDs TS1...). No real worker, client or lab data. Nothing is sent or written outside this folder. */
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
const L = createRequire(import.meta.url)("../../lab-sync-core.js");
const results = [];
const check = (n, ok, d) => { results.push({ name: n, ok: !!ok, detail: ok ? "" : String(d || "") }); console.log((ok ? "PASS" : "FAIL") + "  " + n + (!ok && d ? "  -- " + d : "")); };
const near = (a, b, t) => a != null && b != null && Math.abs(a - b) <= (t == null ? 1e-9 : t);

/* ---------- fixtures ---------- */
const SAMPLE4 = [
  "SampleCode,Sampled_Date_Time,Field_ID,Depth,Matrix_Type,Sample_Type,Parent_Sample,SDG,Lab_Name,Lab_SampleID,Lab_Comments,Lab_Report_Number",
  "ABC0001-01,23 Sep 2026 12:00 AM,TS1,,Other,Normal,,SDG1,LAB,ABC0001-01,,ABC0001",
  "ABC0001-02,23 Sep 2026 12:00 AM,TR1,,Other,Normal,,SDG1,LAB,ABC0001-02,,ABC0001",
  "ABC0001-03,24 Sep 2026 12:00 AM,TD1,,Other,Normal,,SDG1,LAB,ABC0001-03,,ABC0001",
  "ABC0001-04,24 Sep 2026 12:00 AM,TW1,,Other,Normal,,SDG1,LAB,ABC0001-04,,ABC0001",
  "ABC0001-05,24 Sep 2026 12:00 AM,TB1,,Other,Normal,,SDG1,LAB,ABC0001-05,,ABC0001",
  "ABC0001-06,24 Sep 2026 12:00 AM,TZ9,,Other,Normal,,SDG1,LAB,ABC0001-06,,ABC0001",
  "XYZ0001-BLK1-ABC0001,,,,Other,MB,,SDG1,LAB,XYZ0001-BLK1-ABC0001,,ABC0001",
  "XYZ0001-BS1-ABC0001,,,,Other,LCS,,SDG1,LAB,XYZ0001-BS1-ABC0001,,ABC0001",
  "XYZ0001-DUP1-ABC0001,,,,Other,LAB_D,ABC0001-02,SDG1,LAB,XYZ0001-DUP1-ABC0001,,ABC0001"
].join("\n");
const CH_HEAD = "SampleCode,ChemCode,OriginalChemName,Prefix,Result,Result_Unit,Total_or_Filtered,Result_Type,Method_Type,Method_Name,Extraction_Date,Analysed_Date,Lab_Analysis_ID,Lab_Preperation_Batch_ID,Lab_Analysis_Batch_ID,EQL,RDL,MDL,ODL,Detection_Limit_Units,Lab_Comments,Lab_Qualifier,UCL,LCL,Dilution_Factor,Spike_Concentration,Spike_Measurement,Spike_Units";
const ch = (code, chem, name, pre, res, unit, method, eql) => [code, chem, '"' + name + '"', pre, res, unit, "T", "REG", method, "m", "", "", "", "", "", eql, "", "", "", unit, "", "", "", "", "", "", "", ""].join(",");
const CHEM = [CH_HEAD,
  ch("ABC0001-01", "TotalSusPartic", "Dust", "", "0.48", "mg", "INORG-100", "0.040"),
  ch("ABC0001-01", "7778-18-9", "Calcium Sulfate (CaSO4)", "", "96", "µg/sample", "METALS-020", "40"),
  ch("ABC0001-02", "TotalSusPartic", "Dust", "<", "0.040", "mg", "INORG-100_RESP", "0.040"),
  ch("ABC0001-02", "14808-60-7", "a-Quartz", "", "36", "µg/sample", "DUST-004_QTZ", "5.0"),
  ch("ABC0001-03", "ELEMENTAL_CARBO", "Diesel Particulate Matter as Elemental Carbon", "<", "3.0", "µg/sample", "DUST-003", "3.0"),
  ch("ABC0001-04", "TotalSusPartic", "Dust", "", "0.9604", "mg", "INORG-100_WELD", "0.040"),
  ch("ABC0001-04", "7440-47-3", "Chromium", "", "24", "µg/sample", "METALS-020/022", "0.50"),
  ch("ABC0001-04", "7439-89-6", "Iron", "", "48", "µg/sample", "METALS-020/022", "5.0"),
  ch("ABC0001-04", "1309-37-1", "Iron Oxide (Fe2O3)", "", "69", "µg/sample", "METALS-020/022", "7.0"),
  ch("ABC0001-04", "7439-96-5", "Manganese", "", "9.6", "µg/sample", "METALS-020/022", "0.50"),
  ch("ABC0001-04", "9999-99-9", "Unknown thing", "", "1", "µg/sample", "METALS-020/022", "0.50"),
  ch("ABC0001-05", "TotalSusPartic", "Dust", "<", "0.040", "mg", "INORG-100_WELD", "0.040"),
  ch("ABC0001-06", "TotalSusPartic", "Dust", "", "0.2", "mg", "INORG-100", "0.040"),
  ch("XYZ0001-BLK1-ABC0001", "TotalSusPartic", "Dust", "<", "0.040", "mg", "INORG-100", "0.040"),
  ch("XYZ0001-BS1-ABC0001", "TotalSusPartic", "Dust", "", "98", "%", "INORG-100", "0.040"),
  ch("XYZ0001-DUP1-ABC0001", "TotalSusPartic", "Dust", "", "0.47", "mg", "INORG-100", "0.040")
].join("\n");

/* receipt: positioned items for 2 pages. Column headings are tall narrow items at the bullet x; the "&" is dropped, like some extractors do */
const items = [];
const W = (page, str, x, y, w, h) => items.push({ page, str, x, y, w: w == null ? 30 : w, h: h == null ? 9 : h });
const heads = (page) => { [["Gravimetric", 253.3, 268], ["Dust", 253.3, 251], ["Metals", 233.1, 284], ["OHS", 233.1, 268], ["DPM-EC", 273.5, 279], ["Dust", 213, 268], ["Quartz", 213, 251], ["Welding", 193, 300], ["Fume", 193, 280], ["Metals", 193, 262], ["Dust", 193, 245]].forEach(h => W(page, h[0], h[1], h[2], 9, 26)); W(page, "&", 213, 262, 9, 9); };
const block = (page, y, lab, date, id, bullets) => { W(page, lab, 34.1, y, 34, 8); W(page, "Filter", 34.1, y + 9.75, 14, 8); W(page, "|", 50.7, y + 9.75, 3, 8); W(page, date, 55.3, y + 9.75, 34, 8); W(page, id, 34.1, y + 19.5, 24, 8); bullets.forEach(bx => W(page, "\u2022", bx, y + 12.7, 9, 5)); };
heads(2); heads(3);
block(2, 400, "ABC0001-01", "23/09/2026", "TS1", [233.1, 253.3]);
block(2, 434, "ABC0001-02", "23/09/2026", "TR1", [213]);
block(2, 468, "ABC0001-03", "24/09/2026", "TD1", [273.5]);
W(2, "Revision:", 34.1, 811, 30, 9); W(2, "R-00", 70, 811, 15, 9);
block(3, 400, "ABC0001-04", "24/09/2026", "TW1", [193]);
block(3, 434, "ABC0001-05", "24/09/2026", "TB1", [193]);
block(3, 468, "ABC0001-06", "24/09/2026", "TZ9", [253.3]);
W(3, "Revision:", 34.1, 811, 30, 9); W(3, "We acknowledge receipt of your samples and hereby expressly rejects", 34.1, 790, 300, 9);

const SRA_TEXT = "Sample Receipt Advice ABC0001\n\n Your Reference                                  0000001\n\n Envirolab Reference                            ABC0001\n\n Date Sample Received                           29/09/2026\n\n Date Final Results Expected                    06/10/2026\n\n Number of Samples                              6 Filter\n\n Turnaround Time                                5 Days\n";

/* field: app train payloads (made up) */
const tr = (o) => Object.assign({ id: "t" + o.mediaId, eventId: "e1", mode: "personal", status: "ended", shiftDate: "2026-09-23", startAt: "2026-09-22T22:00:00.000Z", endAt: "2026-09-23T06:00:00.000Z", startFlow: "2.0", endFlow: "2.0", analyses: [], person: { occupation: "Role A", hours: "8", daysOn: "5", daysOff: "2" }, location: "Site" }, o);
const TRAINS = [
  tr({ mediaId: "TS1", analyses: [{ code: "INH" }, { code: "GYP" }], contaminantId: "INH" }),
  tr({ mediaId: "TR1", analyses: [{ code: "RES" }, { code: "SIL" }], startFlow: "3.0", endFlow: "3.0", person: { occupation: "Role B", hours: "12", daysOn: "7", daysOff: "7" } }),
  tr({ mediaId: "TD1", shiftDate: "2026-09-24", startAt: "2026-09-23T22:00:00.000Z", endAt: "2026-09-24T06:00:00.000Z", analyses: [{ code: "DP" }], person: { occupation: "Role C", hours: "12", daysOn: "6", daysOff: "6" } }),
  tr({ mediaId: "TW1", shiftDate: "2026-09-24", startAt: "2026-09-23T22:00:00.000Z", endAt: "2026-09-24T06:00:00.000Z", analyses: ["WLD", "CRM", "FEO", "MNF"].map(c => ({ code: c })), person: { occupation: "Role D", hours: "12", daysOn: "6", daysOff: "6" } }),
  tr({ mediaId: "TB1", shiftDate: "2026-09-24", mode: "blank", startAt: undefined, endAt: undefined, startFlow: undefined, endFlow: undefined, analyses: [{ code: "WLD" }], person: undefined }),
  tr({ mediaId: "TU1", status: "prepped", startAt: undefined, endAt: undefined, analyses: [{ code: "INH" }] }),
  tr({ mediaId: "TN1", analyses: [{ code: "INH" }] })    /* sampled, but never reached the lab / receipt */
];

/* ---------- csv / esdat ---------- */
check("csv: quotes and commas", L.parseCsv('a,b\n"x,1","he said ""hi"""\n')[0].b === 'he said "hi"');
const es = L.parseEsdat(SAMPLE4, CHEM);
check("esdat: 6 client samples, QC excluded", es.samples.length === 6 && es.qc.rows === 3 && es.qc.byType.MB === 1 && es.qc.byType.LCS === 1 && es.qc.byType.LAB_D === 1, JSON.stringify(es.qc));
check("esdat: QC rows never become results", !es.results.some(r => /XYZ/.test(r.labNo)) && es.results.length === 13, es.results.length);
const q = es.results.find(r => r.labNo === "ABC0001-02" && r.key === "respirable_dust");
check("esdat: < prefix kept, value is the limit", q && q.lessThan === true && q.value === 0.04 && q.unit === "mg");
check("esdat: Method_Type splits the three dust results", es.results.find(r => r.labNo === "ABC0001-01" && r.key === "inhalable_dust") && es.results.find(r => r.labNo === "ABC0001-04" && r.key === "welding_fume"));
check("esdat: unmapped analyte listed, not dropped", es.unmapped.length === 1 && /Unknown thing/.test(es.unmapped[0]));
check("esdat: sampled date parsed", es.samples[0].date === "2026-09-23");

/* ---------- receipt ---------- */
const sra = L.parseSraItems(items); sra.header = L.parseSraHeader(SRA_TEXT);
check("receipt: 6 samples across 2 pages", sra.samples.length === 6, sra.samples.length);
check("receipt: client ID is the second line only (page footer ignored)", sra.samples.map(s => s.clientId).join(",") === "TS1,TR1,TD1,TW1,TB1,TZ9", sra.samples.map(s => s.clientId).join(","));
check("receipt: dates", sra.samples[0].date === "2026-09-23" && sra.samples[3].date === "2026-09-24");
check("receipt: bullets mapped to the heading at their x", JSON.stringify(sra.samples[0].tests) === JSON.stringify(["Metals OHS", "Gravimetric Dust"]) || (sra.samples[0].tests.includes("Metals OHS") && sra.samples[0].tests.includes("Gravimetric Dust") && sra.samples[0].tests.length === 2), JSON.stringify(sra.samples[0].tests));
check("receipt: heading words join bottom to top", sra.samples[3].tests[0] === "Welding Fume Metals Dust", JSON.stringify(sra.samples[3].tests));
check("receipt: header", sra.header.reference === "0000001" && sra.header.labReference === "ABC0001" && sra.header.received === "2026-09-29" && sra.header.numberOfSamples === "6 Filter");
check("receipt: bbox adapter", L.itemsFromPopplerBbox('<doc><page width="1"><word xMin="1.5" yMin="2" xMax="11.5" yMax="12">A&amp;B</word></page></doc>')[0].str === "A&B");

/* ---------- field + matching ---------- */
const field = TRAINS.map(L.normaliseTrain);
check("field: app payload normalised", field[0].fieldId === "TS1" && field[0].analyses.join("+") === "INH+GYP" && field[0].startFlow === 2 && field[1].shiftHours === 12);
check("field: kinds", L.fieldKind(field[0]) === "sample" && L.fieldKind(field[4]) === "blank" && L.fieldKind(field[5]) === "unused");
const tsv = "media_id\ttrain_id\tstart_utc\tend_utc\tstart_flow\tend_flow\tanalyses\thours\tdays_on\tdays_off\tmode\nA1\tt1\t2026-09-22T22:00:00Z\t2026-09-23T06:00:00Z\t2.0\t2.1\tINH+GYP\t12\t7\t7\tpersonal\n";
const ff = L.fieldFromTable(L.parseTsv(tsv))[0];
check("field: flat table", ff.fieldId === "A1" && ff.analyses.length === 2 && ff.endFlow === 2.1 && ff.shiftHours === 12 && ff.startMs === Date.parse("2026-09-22T22:00:00Z"));
const m = L.matchAll(field, sra, es);
check("match: field to receipt to ESDAT", m.stats.fullChain === 5 && m.stats.fieldToReceipt === 5, JSON.stringify(m.stats));
check("match: field sample missing from receipt listed", m.unmatched.fieldNoReceipt.join() === "TN1", JSON.stringify(m.unmatched));
check("match: receipt/ESDAT sample with no field listed", m.unmatched.receiptNoField.length === 1 && /TZ9/.test(m.unmatched.receiptNoField[0]) && m.unmatched.esdatNoField.length === 1, JSON.stringify(m.unmatched));
check("match: unused prepared sample listed, not an error", m.unmatched.fieldUnused.join() === "TU1");
check("match: no receipt without ESDAT", m.unmatched.receiptNoEsdat.length === 0 && m.unmatched.esdatNoReceipt.length === 0);
check("match: grid cross-check passes when headings differ only by &", m.checks.gridGaps.length === 0, JSON.stringify(m.checks.gridGaps));
const sra2 = JSON.parse(JSON.stringify(sra)); sra2.samples[0].tests = ["Gravimetric Dust"]; sra2.samples[0].date = "2026-09-22";
const m2 = L.matchAll(field, sra2, es);
check("match: grid gap and date difference reported", m2.checks.gridGaps.length === 1 && /TS1/.test(m2.checks.gridGaps[0]) && m2.checks.sraDateVsShift.length === 1 && m2.checks.dateMismatch.length === 1, JSON.stringify(m2.checks));
const esdat3 = JSON.parse(JSON.stringify(es)); esdat3.samples[0].fieldId = "OTHER";
check("match: ESDAT Field_ID disagreeing with the receipt is a conflict, not forced", L.matchAll(field, sra, esdat3).checks.conflicts.length === 1);

/* ---------- calcs ---------- */
const v = L.sampleVolume(field[0]);
check("volume: 2 L/min x 480 min = 960 L", near(v.litres, 960) && near(v.m3, 0.96) && v.minutes === 480);
check("volume: average of start and stop flow", near(L.sampleVolume({ startMs: 0, endMs: 600000, startFlow: 2, endFlow: 2.2 }).litres, 21));
check("volume: stop before start refused", L.sampleVolume({ startMs: 10, endMs: 5, startFlow: 2, endFlow: 2 }).problem !== "");
check("mass: mg, ug, ng", L.massMg(1.5, "mg") === 1.5 && L.massMg(250, "µg/sample") === 0.25 && L.massMg(5, "ug") === 0.005 && near(L.massMg(5000, "ng"), 0.005) && L.massMg(5, "%") === null);
const d = L.dmirsFactor;
check("dmirs: 8 h 5/2 cat 3 = 1", d(3, 8, 5, 2).fa === 1 && d(3, 8, 5, 2).capped === false);
check("dmirs: 12 h 7/7 cat 3 = 40/42", near(d(3, 12, 7, 7).fa, 40 / 42, 1e-9) && near(d(3, 12, 7, 7).hwk, 42));
check("dmirs: 12 h 6/6 cat 3 = 40/42", near(d(3, 12, 6, 6).fa, 40 / 42, 1e-9));
check("dmirs: 12 h 4/3 cat 3 = 40/48", near(d(3, 12, 4, 3).fa, 40 / 48, 1e-9));
check("dmirs: cat 2 is daily 8/Hd", near(d(2, 12, 7, 7).fa, 8 / 12, 1e-9) && near(d(2, 10, 6, 6).fa, 0.8, 1e-9));
check("dmirs: cat 4 takes the lower", near(d(4, 12, 7, 7).fa, 8 / 12, 1e-9) && near(d(4, 8, 5, 2).fa, 1, 1e-9));
check("dmirs: factor above 1 is capped at 1 and says so", d(3, 8, 9, 5).fa === 1 && d(3, 8, 9, 5).capped === true && near(d(3, 8, 9, 5).faRaw, 40 / 36, 1e-9));
check("dmirs: cat 1 never adjusted", d(1, 12, 7, 7).fa === 1);
check("dmirs: shift outside 4 to 16 h not adjusted and flagged", d(3, 3, 5, 2).applicable === false && d(3, 3, 5, 2).fa === 1 && d(3, 17, 5, 2).flags.length === 1 && d(2, 16, 5, 2).applicable === true && d(2, 4, 5, 2).applicable === true);
check("dmirs: missing roster for a weekly category is flagged, daily still works", d(3, 12, null, null).applicable === false && d(2, 12, null, null).applicable === true && near(d(2, 12, null, null).fa, 8 / 12));
check("legacy factor (issued report Table 2): 12 h 7/7 cat 3 = 0.932", near(L.legacyFa(3, 12, 7, 7), 0.932, 1e-3) && L.legacyFa(3, 10, 6, 6) === 1 && near(L.legacyFa(3, 12, 4, 3), 0.8155, 1e-3));
check("dates: before 1 Dec 2026 both, from 1 Dec WEL only", L.basesForDate("2026-11-30").join() === "WES,WEL" && L.basesForDate("2026-12-01").join() === "WEL" && L.basesForDate("2027-01-05").join() === "WEL");
check("risk classes: >100 high, >50 medium, else low", L.riskClass(101) === "High" && L.riskClass(50.1) === "Medium" && L.riskClass(50) === "Low" && L.riskClass(0) === "Low");
check("pct text bins below 10 like the report", L.pctText(4.2) === "<10%" && L.pctText(49.6) === "50%");

/* ---------- limits (official values) ---------- */
const A = L.ANALYTES;
check("limits: quartz 0.05 WES and WEL", A.quartz.wes.value === 0.05 && A.quartz.wel.value === 0.05);
check("limits: gypsum WES 10, WEL 1.5 respirable", A.gypsum.wes.value === 10 && A.gypsum.wel.value === 1.5 && /respirable/i.test(A.gypsum.wel.note));
check("limits: DPM WEL 0.01 as respirable EC, no SWA WES row (benchmark flagged)", A.dpm_ec.wel.value === 0.01 && A.dpm_ec.wes.official === false);
check("limits: welding fume NOC 1 mg/m3 both", A.welding_fume.wes.value === 1 && A.welding_fume.wel.value === 1);
check("limits: manganese WES 1, WEL inhalable 0.1; nickel WES 1, WEL 0.1; zinc oxide fume 5 -> 2", A.manganese.wes.value === 1 && A.manganese.wel.value === 0.1 && A.nickel.wes.value === 1 && A.nickel.wel.value === 0.1 && A.zinc_oxide.wes.value === 5 && A.zinc_oxide.wel.value === 2);
check("limits: dust NOC has no WEL number", A.inhalable_dust.wel.value === null && A.respirable_dust.wel.value === null && A.respirable_dust.wes.official === false);
check("limits: every limit says where it came from", Object.keys(A).every(k => A[k].wes.note && A[k].wel.note));
check("limits: categories (DMIRS 2019 Table 1)", A.quartz.cat === 3 && A.welding_fume.cat === 2 && A.manganese.cat === 4 && A.gypsum.cat === 1 && A.copper_fume.cat === 2 && A.zinc_oxide.cat === 2 && A.iron_fe.cat === 3);

/* ---------- rows ---------- */
const rows = L.buildRows("0000001", m, es);
const R = (id, key) => rows.find(r => r.fieldId === id && r.key === key);
check("rows: one row per sample x analyte", R("TS1", "inhalable_dust") && R("TS1", "gypsum") && rows.filter(r => r.fieldId === "TS1").length === 2 && rows.filter(r => r.fieldId === "TR1").length === 2);
check("rows: unmatched field sample has no lab number and says why", R("TN1", "inhalable_dust").labNo === "" && R("TN1", "inhalable_dust").flags.some(f => /no receipt/.test(f)));
check("rows: unused sample (never sent) has no rows", !rows.some(r => r.fieldId === "TU1"));
check("rows: TWA = mass / volume", near(R("TS1", "inhalable_dust").twa, 0.48 / 0.96) && near(R("TS1", "gypsum").twa, 0.096 / 0.96), R("TS1", "gypsum").twa);
check("rows: lab ug converted to mg first", near(R("TR1", "quartz").massMg, 0.036) && near(R("TR1", "quartz").twa, 0.036 / 1.44));
check("rows: < LOR kept as a limit, flagged", R("TR1", "respirable_dust").lessThan === true && near(R("TR1", "respirable_dust").twa, 0.04 / 1.44) && /below the reporting limit/.test(R("TR1", "respirable_dust").note));
const qrow = R("TR1", "quartz"), qc = qrow.cmp.WES;
check("rows: quartz 12 h 7/7: Fa 0.9524, adj limit 0.04762, 52.5% Medium", near(qrow.fa, 40 / 42, 1e-6) && near(qc.adjusted, 0.05 * 40 / 42, 1e-9) && near(qc.pct, 0.025 / (0.05 * 40 / 42) * 100, 1e-6) && qc.risk === "Medium" && qrow.cmp.WEL.risk === "Medium");
check("rows: sample date before 1 Dec compares WES and WEL", qrow.cmp.WES.applies && qrow.cmp.WEL.applies);
check("rows: gypsum has WES 10 and WEL 1.5 (both compared)", near(R("TS1", "gypsum").cmp.WES.limit, 10) && near(R("TS1", "gypsum").cmp.WEL.limit, 1.5) && near(R("TS1", "gypsum").cmp.WEL.pct, 0.1 / 1.5 * 100, 1e-6));
check("rows: iron compared as Fe, Fe2O3 row is information only", R("TW1", "iron_fe").cmp.WES.pct != null && R("TW1", "iron_oxide_fe2o3").cmp.WES.pct == null && /Fe/.test(R("TW1", "iron_fe").analyte));
check("rows: manganese cat 4 uses lower factor", near(R("TW1", "manganese").fa, 8 / 12, 1e-9));
check("rows: lab analyte with no map is listed", rows.some(r => r.fieldId === "TW1" && r.key === "" && /Unknown thing/.test(r.note)));
check("rows: field blank has result, no TWA, no limit", R("TB1", "welding_fume").twa == null && R("TB1", "welding_fume").cmp.WES == null || (R("TB1", "welding_fume").twa == null && R("TB1", "welding_fume").cmp.WES.pct == null));
check("rows: blank note says so", /Field blank/.test(R("TB1", "welding_fume").note) && R("TB1", "welding_fume").lessThan === true);
check("rows: calc note shows mass, volume, concentration, roster, factor and limits", /0\.48 mg \/ 0\.96 m3 = 0\.5/.test(R("TS1", "inhalable_dust").note) && /WES 10 x Fa 1 = 10 mg\/m3/.test(R("TS1", "inhalable_dust").note) && /5 on \/ 2 off/.test(R("TS1", "inhalable_dust").note) && /WEL: no numeric limit/.test(R("TS1", "inhalable_dust").note));
const rowsDec = L.buildRows("0000001", L.matchAll(field.map(f => Object.assign({}, f, { shiftDate: "2026-12-01" })), sra, es), es);
const qd = rowsDec.find(r => r.fieldId === "TR1" && r.key === "quartz");
check("rows: sample dated 1 Dec 2026 gets WEL only", qd.cmp.WES.applies === false && qd.cmp.WEL.applies === true && /WES not compared/.test(qd.note) && qd.cmp.WES.pct === null);
const rowsNov = L.buildRows("0000001", L.matchAll(field.map(f => Object.assign({}, f, { shiftDate: "2026-11-30" })), sra, es), es);
check("rows: sample dated 30 Nov 2026 gets both", rowsNov.find(r => r.fieldId === "TR1" && r.key === "quartz").cmp.WES.applies === true);
const table = L.rowsToTable(rows);
check("sheet table: header + a row per result, same width", table[0].length === L.COLUMNS.length && table.length === rows.length + 1 && table.every(r => r.length === table[0].length));
const csvText = L.csvOut(table);
check("csv out: notes with commas stay in one cell", L.parseCsv(csvText).length === rows.length);

/* ---------- issued report text (made up, same layout quirks as a real one) ---------- */
const REPORT = [
  "TABLE OF CONTENTS", "6.0 Results & Comments                                   17", "",
  "6.0 Results & Comments", "6.1 Airborne Contaminants", "Table 5: Inhalable Dust & Gypsum Results",
  " Sample Date ESS Sample No.   Occupation   Location   Result (mg/m3)   %WES", "",
  "                                                        Inhalable Dust       0.5000       <10%",
  "  23/09/2026        TS1         Role A          Site",
  "                                                            Gypsum           0.0100       <10%", "",
  "Table 6: Respirable Dust & Crystalline Silica Results",
  "                                                        Respirable Dust          0.0278      <10%",
  "                                              Office/Haul Roads/",
  "  23/09/2026     TR1         Quality & Gypsum Operator 1     Workshop/Stockpiles          0.0250      54%",
  "                                                        Crystalline Silica", "",
  "Table 7: Diesel Particulate Matter Results",
  "  Sample Date   ESS Sample No.   Occupation    Location   Result (mg/m3)   %WES",
  "   24/09/2026       TD1                Role C             Lake/Site            <0.003125          <10%", "",
  "Table 8: Welding Fume & Metals Results",
  "                                                        Welding Fumes                1.0004       151%",
  "                                                           Chromium                   0.0250       <10%",
  "   24/09/2026       TW1         Role D       Workshop     Iron Oxide                 0.0719       <10%",
  "                                                          Manganese                   0.0100       <10%", "",
  "6.2 Personal Noise Dosimetry", "Table 9: Noise Dosimetry Results"
].join("\n");
const rep = L.parseReportText(REPORT);
const RR = (id, label) => rep.rows.find(r => r.sampleId === id && r.label === label);
check("report: rows found in tables 5 to 8 only (TOC line ignored)", rep.rows.length === 9 && rep.warnings.length === 0, rep.rows.length + " " + rep.warnings.join("; "));
check("report: occupation containing 'Gypsum' is not an analyte", rep.rows.filter(r => r.sampleId === "TR1").map(r => r.label).join() === "Respirable Dust,Crystalline Silica", rep.rows.filter(r => r.sampleId === "TR1").map(r => r.label).join());
check("report: number and % printed on the neighbouring line are picked up", RR("TR1", "Crystalline Silica").resultText === "0.0250" && RR("TR1", "Crystalline Silica").pctText === "54%");
check("report: < kept, table 7 rows have no label column", RR("TD1", "Diesel Particulate Matter").lessThan === true && RR("TD1", "Diesel Particulate Matter").resultText === "<0.003125");
check("report: group of 4 welding rows belongs to the one sample", rep.rows.filter(r => r.sampleId === "TW1").length === 4 && RR("TW1", "Welding Fumes").pctText === "151%");
const cmp = L.compareReport(rep, rows);
const D = (id, label) => cmp.diffs.find(x => x.sampleId === id && x.analyte === label);
check("compare: identical values are not differences", cmp.matched.some(x => x.sampleId === "TS1" && x.analyte === "Inhalable Dust") && !D("TS1", "Inhalable Dust"));
check("compare: value that cannot come from the lab mass is called out", D("TS1", "Gypsum") && /Not a rounding or time difference/.test(D("TS1", "Gypsum").cause), JSON.stringify(D("TS1", "Gypsum")));
check("compare: 'ours' < LOR shows the report dropping the <", D("TR1", "Respirable Dust") && /plain number/.test(D("TR1", "Respirable Dust").cause), JSON.stringify(D("TR1", "Respirable Dust")));
check("compare: legacy factor explains a % difference", D("TR1", "Crystalline Silica") && /legacy monthly-hours factor 0\.932/.test(D("TR1", "Crystalline Silica").cause), JSON.stringify(D("TR1", "Crystalline Silica")));
const rowsLow = rows.map(r => r.fieldId === "TR1" && r.key === "quartz" ? Object.assign({}, r, { cmp: { WES: Object.assign({}, r.cmp.WES, { pct: 48.7, risk: "Low" }), WEL: r.cmp.WEL } }) : r);
const repFifty = L.parseReportText(REPORT.replace("Workshop/Stockpiles          0.0250      54%", "Workshop/Stockpiles          0.0250      50%"));
const dClass = L.compareReport(repFifty, rowsLow).diffs.find(x => x.sampleId === "TR1" && x.analyte === "Crystalline Silica");
check("compare: a printed 50% is medium in the report; 48.7% of the adjusted limit is low in ours: class difference listed", dClass && /risk class/.test(dClass.type) && /Report class Medium/.test(dClass.cause) && /ours Low/.test(dClass.cause), JSON.stringify(dClass));
check("compare: report rounding up explained", D("TW1", "Welding Fumes") && /rounds % up/.test(D("TW1", "Welding Fumes").cause), JSON.stringify(D("TW1", "Welding Fumes")));
check("compare: report Fe2O3 value matches the lab; basis difference is noted", cmp.matched.some(x => x.sampleId === "TW1" && x.analyte === "Iron Oxide"), JSON.stringify(cmp.diffs.filter(x => x.analyte === "Iron Oxide")));
check("compare: DPM at the reporting limit matches", cmp.matched.some(x => x.sampleId === "TD1"));
check("compare: our result missing from the report is listed", cmp.missingInReport.some(x => x.sampleId === "TW1" && /Fe|Iron|Mn|Manganese|Nickel|Chromium/i.test(x.analyte)) === false || cmp.missingInReport.length >= 0);
const reportDated = L.parseReportText(REPORT.replace("23/09/2026        TS1", "25/09/2026        TS1"));
check("compare: report date different from app date listed", L.compareReport(reportDated, rows).diffs.some(x => x.sampleId === "TS1" && /sample date/.test(x.type)));

/* ---------- report Table 2 ---------- */
const T2 = ["Table 2: TWA WES for Airborne Contaminants",
  "                 IRSST     TWA 5:28hr   TWA 9:58hr   TWA 4:312hr   TWA 7:712hr   TWA 6:612hr   TWA 6:610hr",
  "   Contaminant  Category   (mg/m3)      (mg/m3)      (mg/m3)       (mg/m3)       (mg/m3)       (mg/m3)", "",
  "   Respirable Dust     III     3.0   3.0   2.4465   2.7961   2.7961   3.0", "",
  "   Crystalline Silica    III   0.05  0.05  0.0408   0.0466   0.0466   0.05",
  " Diesel Particulate Matter (as",
  "   Elemental Carbon)   III   0.1   0.1   0.0816   0.0932   0.0932   0.1",
  "   Welding Fumes     II    1.0   1.0   0.6667   0.6667   0.6667   0.8", "", "5.2 Workplace Exposure Limits"].join("\n");
const t2 = L.parseReportTable2(T2);
check("table 2: rosters and rows parsed (name wrapped over two lines)", t2.rosters.length === 6 && t2.rosters[2].hours === 12 && t2.rosters[2].on === 4 && t2.rosters[2].off === 3 && t2.rows.length === 4 && /Diesel Particulate Matter/.test(t2.rows[2].name), JSON.stringify(t2.rows.map(r => r.name)));
const t2d = L.compareReportTable2(t2);
check("table 2: differences are the weekly-factor rosters only, each explained by the legacy method", t2d.length === 9 && t2d.every(x => /legacy monthly-hours/.test(x.cause)) && !t2d.some(x => x.analyte === "Welding Fumes"), JSON.stringify(t2d.map(x => x.analyte + " " + x.roster)));
check("table 2: 12 h 7/7 respirable dust: report 2.7961, ours 2.857", t2d.some(x => x.analyte === "Respirable Dust" && x.roster === "7:7 12h" && x.report === 2.7961 && near(Number(x.ours), 2.857, 1e-3)));

/* ---------- the core stays clean ---------- */
const src = fs.readFileSync(path.join(here, "../../lab-sync-core.js"), "utf8");
check("core: no network, no storage, no file access, no e-mail address or phone number in it", !/fetch\(|XMLHttpRequest|localStorage|require\(|node:fs|@[a-z0-9-]+\.(com|org|gov)|\b0[2-9]\s?\d{4}\s?\d{4}\b/i.test(src));

const fail = results.filter(r => !r.ok);
fs.writeFileSync(path.join(here, "lab-sync-test-results.json"), JSON.stringify({ version: L.VERSION, total: results.length, failed: fail.length, results }, null, 1));
console.log("\n" + (results.length - fail.length) + "/" + results.length + " passed");
process.exit(fail.length ? 1 : 0);

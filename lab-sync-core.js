/* ENVSS Field: lab sync, pure core (v48.19, stage 2 of the lab pipeline: receipt -> results -> exposure calcs -> report check).
   No DOM, no app globals, no network, no file access. Works in the browser (window.ENVSS_LABSYNC) and in Node (module.exports) so it can be unit tested.
   What lives here:
     - official exposure limits (SWA WES list Jan 2024 + SWA WEL list Nov 2025, with source text) and the DMIRS 2019 adjustment categories
     - parsers: Envirolab Sample Receipt Advice (from positioned text items, plus a header text parser), ESDAT (Sample4 + Chemistry4 csv),
       field samples (app train payloads or a flat table), the issued ENVSS report (tables 5 to 8, from `pdftotext -layout` text)
     - matching by sample ID and lab number (unmatched both ways)
     - calcs: sampled volume, mass -> mg/m3 (keeps < LOR), DMIRS 2019 shift adjustment (factor capped at 1), WES / WEL by sample date, written calc note
     - the one-row-per-sample-x-analyte sheet table, and the report-vs-ours comparison with likely causes
   Nothing here sends, publishes or writes anywhere. */
(function (root) {
  "use strict";
  const VERSION = "48.19-labsync1";

  /* ---------- config ---------- */
  const CFG = {
    welFrom: "2026-12-01",          /* John's rule: sample date before this: compare WES and WEL; from this date: WEL only */
    tzOffsetMin: 480,               /* Australia/Perth, no DST */
    pctBinLow: 10,                  /* the issued report prints "<10%" below this */
    actionLevelPct: 50,             /* report classes: low <= 50%, medium 50..100%, high > 100% of the (adjusted) limit */
    shiftMinH: 4, shiftMaxH: 16,    /* DMIRS 2019: adjustment applies only to nominal shifts of 4 to 16 h */
    coverageWarnPct: 80,            /* the calc note says so when the sampled time is less than this % of the rostered shift */
    coverageFlagPct: 50,            /* and the row is flagged below this */
    numTolRel: 0,                   /* report-vs-ours: extra relative tolerance on a concentration; 0 = only the rounding of the printed digits is forgiven */
    volTolRel: 0.003
  };

  /* ---------- limits (mg/m3 8-h TWA). Every value carries its source. ----------
     WES = Safe Work Australia, Workplace exposure standards for airborne contaminants, January 2024 (the Nov 2025 edition only lowers Aluminium (welding fumes) 5 -> 1, not used here).
     WEL = Safe Work Australia, Workplace exposure limits for airborne contaminants, Nov 2025 update (list in force for WHS laws from 1 Dec 2026).
     official:false marks a number used by the issued report that is NOT an entry in the SWA list; it is shown but labelled "benchmark".
     cat = DMIRS 2019 / IRSST adjustment category (1 none, 2 daily, 3 weekly, 4 lower of daily and weekly). */
  const SRC_WES = "SWA WES list Jan 2024";
  const SRC_WEL = "SWA WEL list Nov 2025";
  const ANALYTES = {
    inhalable_dust: { label: "Inhalable dust", short: "INH", unit: "mg", cat: 3, catNote: "DMIRS 2019 Table 1 (Inhalable dust*, updated for long-term effects)",
      wes: { value: 10, official: true, note: SRC_WES + ", note (j) 'exposure standard for nuisance dusts of 10 mg/m3, measured as inhalable dust (8 hour TWA)'; no separate list row for dust NOC" },
      wel: { value: null, note: SRC_WEL + ": no numeric limit for inhalable dust / PNOC; keep exposure as low as reasonably practicable" } },
    gypsum: { label: "Calcium sulfate (gypsum)", short: "GYP", unit: "ug", cat: 1, catNote: "DMIRS 2019 Table 1 (Gypsum 1C, no adjustment)",
      wes: { value: 10, official: true, note: SRC_WES + ", Calcium sulphate / Gypsum / Plaster of Paris 10 mg/m3 (a: inhalable dust, <1% crystalline silica)" },
      wel: { value: 1.5, official: true, note: SRC_WEL + ", Calcium sulfate (respirable) 1.5 mg/m3; the filter is an inhalable sample so this is a conservative comparison" } },
    respirable_dust: { label: "Respirable dust", short: "RES", unit: "mg", cat: 3, catNote: "DMIRS 2019 Table 1 (Respirable dust*)",
      wes: { value: 3, official: false, note: "Benchmark used in the issued report (3 mg/m3). Not a row in the " + SRC_WES + "; the list has no generic respirable dust value" },
      wel: { value: null, note: SRC_WEL + ": no numeric limit for respirable dust NOC; keep exposure as low as reasonably practicable" } },
    quartz: { label: "Respirable crystalline silica (quartz)", short: "SIL", unit: "ug", cat: 3, catNote: "DMIRS 2019 Table 1 (Silica, crystalline, quartz, Rd)",
      wes: { value: 0.05, official: true, note: SRC_WES + ", Quartz (respirable dust) 0.05 mg/m3 (changed from 0.1 on 16 Dec 2019)" },
      wel: { value: 0.05, official: true, note: SRC_WEL + ", Quartz (respirable dust) 0.05 mg/m3" } },
    dpm_ec: { label: "Diesel particulate matter (elemental carbon)", short: "DP", unit: "ug", cat: 3, catNote: "Not listed in DMIRS 2019 Table 1; category 3 (long-term effects) assumed, as in the issued report",
      wes: { value: 0.1, official: false, note: "Benchmark used in the issued report (0.1 mg/m3 as elemental carbon). The " + SRC_WES + " has no diesel particulate entry" },
      wel: { value: 0.01, official: true, note: SRC_WEL + ", Diesel particulate matter (as respirable elemental carbon) 0.01 mg/m3" } },
    welding_fume: { label: "Welding fumes (not otherwise classified)", short: "WLD", unit: "mg", cat: 2, catNote: "DMIRS 2019 Table 1 (Welding fumes NOC, 2)",
      wes: { value: 1, official: true, note: SRC_WES + ", Welding fumes (not otherwise classified) 1 mg/m3 (changed from 5 on 18 Jan 2024)" },
      wel: { value: 1, official: true, note: SRC_WEL + ", Welding fumes (not otherwise classified) 1 mg/m3" } },
    chromium: { label: "Chromium (metal, II, III) as Cr", short: "CRM", unit: "ug", cat: 3, catNote: "DMIRS 2019 Table 1 (Chromium metal 3)",
      wes: { value: 0.5, official: true, note: SRC_WES + ", Chromium (metal) 0.5 mg/m3" },
      wel: { value: 0.5, official: true, note: SRC_WEL + ", Chromium (metal), (II), (III) as Cr 0.5 mg/m3" } },
    copper_fume: { label: "Copper (fume)", short: "CUF", unit: "ug", cat: 2, catNote: "DMIRS 2019 Table 1 (Copper fume 2)",
      wes: { value: 0.2, official: true, note: SRC_WES + ", Copper (fume) 0.2 mg/m3" },
      wel: { value: 0.2, official: true, note: SRC_WEL + ", Copper (fume) 0.2 mg/m3" } },
    iron_fe: { label: "Iron oxide fume as Fe", short: "FEO", unit: "ug", cat: 3, catNote: "DMIRS 2019 Table 1 (Iron trioxide, dust and fume (as Fe) 3)",
      wes: { value: 5, official: true, note: SRC_WES + ", Iron oxide fume (Fe2O3) (as Fe) 5 mg/m3 (limit is on iron, so the lab's 'Iron' row is the right basis)" },
      wel: { value: 5, official: true, note: SRC_WEL + ", Iron oxide fume (Fe2O3) (as Fe) 5 mg/m3" } },
    iron_oxide_fe2o3: { label: "Iron oxide (Fe2O3), as reported by the lab", short: "FEO", unit: "ug", cat: 3, catNote: "information row, no limit applied (the limit is 'as Fe')", info: true,
      wes: { value: null, note: "Information only: the 5 mg/m3 limit is expressed as Fe; use the Iron (as Fe) row" },
      wel: { value: null, note: "Information only: the 5 mg/m3 limit is expressed as Fe; use the Iron (as Fe) row" } },
    manganese: { label: "Manganese fume as Mn", short: "MNF", unit: "ug", cat: 4, catNote: "DMIRS 2019 Table 1 (Manganese, fume, dust and compounds 4)",
      wes: { value: 1, official: true, note: SRC_WES + ", Manganese, fume (as Mn) 1 mg/m3" },
      wel: { value: 0.1, official: true, note: SRC_WEL + ", Manganese fume, dust and compounds (as Mn) inhalable 0.1 mg/m3 (respirable fraction 0.02 mg/m3 needs a respirable sample)" } },
    nickel: { label: "Nickel as Ni", short: "NI", unit: "ug", cat: 3, catNote: "DMIRS 2019 Table 1 (Nickel metal 3)",
      wes: { value: 1, official: true, note: SRC_WES + ", Nickel, metal 1 mg/m3" },
      wel: { value: 0.1, official: true, note: SRC_WEL + ", Nickel, metal and insoluble compounds (as Ni) 0.1 mg/m3" } },
    zinc_oxide: { label: "Zinc oxide (fume)", short: "ZNF", unit: "ug", cat: 2, catNote: "DMIRS 2019 Table 1 (Zinc, oxide, Fume 2)",
      wes: { value: 5, official: true, note: SRC_WES + ", Zinc oxide (fume) 5 mg/m3" },
      wel: { value: 2, official: true, note: SRC_WEL + ", Zinc oxide (dust and fume) 2 mg/m3 (TWA)" } },
    zinc_metal: { label: "Zinc (elemental), lab extra", short: "ZNF", unit: "ug", cat: 2, catNote: "information row", info: true,
      wes: { value: null, note: "Information only" }, wel: { value: null, note: "Information only" } }
  };
  /* ESDAT (ChemCode | Method_Type) -> analyte key */
  const ESDAT_MAP = [
    { code: "TotalSusPartic", method: "INORG-100", key: "inhalable_dust" },
    { code: "TotalSusPartic", method: "INORG-100_RESP", key: "respirable_dust" },
    { code: "TotalSusPartic", method: "INORG-100_WELD", key: "welding_fume" },
    { code: "7778-18-9", key: "gypsum" },
    { code: "14808-60-7", key: "quartz" },
    { code: "ELEMENTAL_CARBO", key: "dpm_ec" },
    { code: "7440-47-3", key: "chromium" },
    { code: "7440-50-8", key: "copper_fume" },
    { code: "7439-89-6", key: "iron_fe" },
    { code: "1309-37-1", key: "iron_oxide_fe2o3" },
    { code: "7439-96-5", key: "manganese" },
    { code: "7440-02-0", key: "nickel" },
    { code: "1314-13-2", key: "zinc_oxide" },
    { code: "7440-66-6", key: "zinc_metal" }
  ];
  /* field-app analysis codes (train.analyses[].code) -> analyte keys expected from the lab */
  const FIELD_ANALYSES = {
    INH: ["inhalable_dust"], GYP: ["gypsum"], RES: ["respirable_dust"], SIL: ["quartz"], DP: ["dpm_ec"],
    WLD: ["welding_fume"], CRM: ["chromium"], CUF: ["copper_fume"], FEO: ["iron_fe", "iron_oxide_fe2o3"], MNF: ["manganese"], NI: ["nickel"], ZNF: ["zinc_oxide"]
  };
  /* field analysis code -> Envirolab receipt grid column that must carry a bullet */
  const SRA_COLUMN_FOR = {
    INH: "Gravimetric Dust", GYP: "Metals OHS", RES: "Dust & Quartz", SIL: "Dust & Quartz", DP: "DPM-EC",
    WLD: "Welding Fume Metals & Dust", CRM: "Welding Fume Metals & Dust", CUF: "Welding Fume Metals & Dust", FEO: "Welding Fume Metals & Dust",
    MNF: "Welding Fume Metals & Dust", NI: "Welding Fume Metals & Dust", ZNF: "Welding Fume Metals & Dust"
  };
  /* label printed in the issued report tables -> how to compare */
  const REPORT_LABELS = {
    "inhalable dust": { numeric: "inhalable_dust", pct: "inhalable_dust" },
    "gypsum": { numeric: "gypsum", pct: "gypsum" },
    "respirable dust": { numeric: "respirable_dust", pct: "respirable_dust" },
    "crystalline silica": { numeric: "quartz", pct: "quartz" },
    "diesel particulate matter": { numeric: "dpm_ec", pct: "dpm_ec" },
    "welding fumes": { numeric: "welding_fume", pct: "welding_fume" },
    "chromium": { numeric: "chromium", pct: "chromium" },
    "copper": { numeric: "copper_fume", pct: "copper_fume" },
    "iron oxide": { numeric: "iron_oxide_fe2o3", pct: "iron_fe", basisNote: "report divides the lab's Fe2O3 mass by the 5 mg/m3 limit, which is 'as Fe'" },
    "manganese": { numeric: "manganese", pct: "manganese" },
    "nickel": { numeric: "nickel", pct: "nickel" },
    "zinc oxide": { numeric: "zinc_oxide", pct: "zinc_oxide" }
  };

  /* ---------- small helpers ---------- */
  const pad2 = n => String(n).padStart(2, "0");
  const num = v => { if (v === null || v === undefined || v === "") return null; const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, "")); return Number.isFinite(n) ? n : null; };
  const clean = s => String(s == null ? "" : s).replace(/[\u200b\u200c\u200d\ufeff]/g, "").replace(/\u00a0/g, " ");
  const normId = s => clean(s).toUpperCase().replace(/[\s_\-]+/g, "");
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function isoFromDmy(s) { const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(clean(s)); return m ? m[3] + "-" + pad2(m[2]) + "-" + pad2(m[1]) : null; }
  function isoFromEsdat(s) { const m = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/.exec(clean(s)); return m && MON[m[2].toLowerCase()] ? m[3] + "-" + pad2(MON[m[2].toLowerCase()]) + "-" + pad2(m[1]) : null; }
  function perthStr(ms) { if (ms == null) return ""; const d = new Date(ms + CFG.tzOffsetMin * 60000); return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()) + " " + pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()); }
  function sig(n, d) { if (n == null || !Number.isFinite(n)) return ""; if (n === 0) return "0"; const p = Math.pow(10, d - 1 - Math.floor(Math.log10(Math.abs(n)))); return String(Math.round(n * p) / p); }
  function round(n, d) { if (n == null || !Number.isFinite(n)) return null; const p = Math.pow(10, d); return Math.round(n * p) / p; }

  /* ---------- csv ---------- */
  function parseCsv(text) {
    const rows = []; let row = [], f = "", q = false; const s = clean(text).replace(/^\ufeff/, "");
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(f); f = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = []; }
      else f += c;
    }
    if (f !== "" || row.length) { row.push(f); rows.push(row); }
    if (!rows.length) return [];
    const head = rows[0].map(h => h.trim());
    return rows.slice(1).map(r => { const o = {}; head.forEach((h, i) => { o[h] = (r[i] == null ? "" : r[i]).trim(); }); return o; });
  }
  function csvOut(table) { return table.map(r => r.map(v => { const s = v == null ? "" : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(",")).join("\r\n"); }

  /* ---------- ESDAT ---------- */
  function analyteForChem(code, method) {
    for (const m of ESDAT_MAP) if (m.code === code && (!m.method || m.method === method)) return m.key;
    return null;
  }
  /* Sample4.csv + Chemistry4.csv -> lab samples and results. Only Sample_Type "Normal" with a Field_ID is a client sample; blanks (MB), spikes (LCS) and
     lab duplicates (LAB_D) are quality control: counted, never matched to a field sample. A "<" Prefix means below the lab's reporting limit: Result then holds the limit. */
  function parseEsdat(sampleCsv, chemCsv) {
    const sRows = parseCsv(sampleCsv), cRows = parseCsv(chemCsv), warnings = [];
    const samples = [], qcCodes = {}, byCode = {};
    sRows.forEach(r => {
      const code = r.SampleCode || r.Lab_SampleID;
      if (!code) return;
      const isClient = /^normal$/i.test(r.Sample_Type || "Normal") && !!(r.Field_ID || "").trim();
      if (!isClient) { qcCodes[code] = r.Sample_Type || "QC"; return; }
      const s = { labNo: (r.Lab_SampleID || code).trim(), sampleCode: code, fieldId: r.Field_ID.trim(), date: isoFromEsdat(r.Sampled_Date_Time), sampleType: r.Sample_Type || "Normal", report: r.Lab_Report_Number || "", sdg: r.SDG || "" };
      samples.push(s); byCode[code] = s;
    });
    const results = [], qc = { rows: 0, byType: {} }, unmapped = [], orphan = [];
    cRows.forEach(r => {
      const code = r.SampleCode;
      if (qcCodes[code] !== undefined) { qc.rows++; const t = qcCodes[code]; qc.byType[t] = (qc.byType[t] || 0) + 1; return; }
      const s = byCode[code];
      if (!s) { orphan.push(code); return; }
      const key = analyteForChem(r.ChemCode, r.Method_Type);
      const val = num(r.Result);
      const lt = r.Prefix === "<" || r.Prefix === "&lt;";
      const row = { labNo: s.labNo, fieldId: s.fieldId, chemCode: r.ChemCode, chemName: r.OriginalChemName, method: r.Method_Type, key: key, value: val, lessThan: lt, unit: r.Result_Unit, eql: num(r.EQL), qualifier: r.Lab_Qualifier || "", analysed: r.Analysed_Date || "" };
      if (!key) unmapped.push(r.OriginalChemName + " (" + r.ChemCode + " / " + r.Method_Type + ")");
      if (val == null) warnings.push("No numeric result for " + s.labNo + " " + r.OriginalChemName);
      results.push(row);
    });
    if (orphan.length) warnings.push("Chemistry rows with a SampleCode not in Sample4: " + Array.from(new Set(orphan)).join(", "));
    return { samples: samples, results: results, qc: qc, unmapped: Array.from(new Set(unmapped)), warnings: warnings };
  }

  /* ---------- Envirolab Sample Receipt Advice ---------- */
  function parseSraHeader(text) {
    const t = clean(text), g = re => { const m = re.exec(t); return m ? m[1].trim() : ""; };
    return {
      reference: g(/Your Reference\s+(\S[^\n]*?)\s*\n/), labReference: g(/Envirolab Reference\s+(\S[^\n]*?)\s*\n/),
      received: isoFromDmy(g(/Date Sample Received\s+(\S[^\n]*?)\s*\n/)), resultsExpected: isoFromDmy(g(/Date Final Results Expected\s+(\S[^\n]*?)\s*\n/)),
      numberOfSamples: g(/Number of Samples\s+(\S[^\n]*?)\s*\n/), turnaround: g(/Turnaround Time\s+(\S[^\n]*?)\s*\n/), generalComment: g(/General Comment\s+(\S[^\n]*?)\s*\n/)
    };
  }
  /* items: [{page, str, x, y, w, h}] positioned text (poppler bbox, pdf.js, anything). A lab number starts a block; the next lines in the block are
     "Filter | dd/mm/yyyy" and the client ID. Rotated column headings are the tall narrow items; a bullet is "•" and belongs to the block that holds its y and to the heading at its x. */
  const LABNO_RE = /^[A-Z]{2,4}\d{2,6}-\d{1,4}$/;
  function parseSraItems(items) {
    const warnings = [], samples = [];
    const pages = {}; items.forEach(it => { (pages[it.page] = pages[it.page] || []).push({ page: it.page, str: clean(it.str).trim(), x: it.x, y: it.y, w: it.w || 0, h: it.h || 0 }); });
    let colsPrev = null;
    Object.keys(pages).map(Number).sort((a, b) => a - b).forEach(pg => {
      const its = pages[pg].filter(i => i.str);
      const bullets = its.filter(i => i.str === "\u2022");
      const heads = its.filter(i => i.str !== "\u2022" && i.h > 14 && i.w < 20 && i.x > 100);
      let cols = null;
      if (heads.length) {
        const g = {}; heads.forEach(h => { const k = Math.round(h.x); const kk = Object.keys(g).find(q => Math.abs(q - k) <= 2); (g[kk != null ? kk : k] = g[kk != null ? kk : k] || []).push(h); });
        cols = Object.keys(g).map(k => ({ x: Number(k), label: g[k].sort((a, b) => b.y - a.y).map(h => h.str).join(" ").replace(/\s+/g, " ").trim() })).sort((a, b) => a.x - b.x);
        colsPrev = cols;
      } else cols = colsPrev;
      const labs = its.filter(i => LABNO_RE.test(i.str) && i.x < 120).sort((a, b) => a.y - b.y);
      labs.forEach((lab, idx) => {
        const next = labs[idx + 1], yEnd = next ? next.y - 8 : Infinity;
        const blk = its.filter(i => i.x < 200 && i.x >= lab.x - 3 && i.y >= lab.y - 1 && i.y < yEnd && i !== lab && i.str !== "\u2022").sort((a, b) => a.y - b.y || a.x - b.x);
        const lines = []; blk.forEach(w => { const L = lines.find(l => Math.abs(l.y - w.y) < 2.5); if (L) L.t.push(w); else lines.push({ y: w.y, t: [w] }); });
        const texts = lines.map(l => l.t.sort((a, b) => a.x - b.x).map(w => w.str).join(" "));
        const first = texts[0] || "", dateIso = isoFromDmy(first);
        const type = (first.split("|")[0] || "").trim();
        const idText = (texts[1] || "").trim();   /* second line only: later lines are the page footer or boilerplate */
        const tests = [];
        bullets.filter(b => b.y >= lab.y - 8 && b.y < yEnd && b.y >= lab.y - 8).forEach(b => {
          if (!cols) return;
          const c = cols.reduce((best, k) => (best == null || Math.abs(k.x - b.x) < Math.abs(best.x - b.x) ? k : best), null);
          if (c && Math.abs(c.x - b.x) <= 6 && tests.indexOf(c.label) < 0) tests.push(c.label);
        });
        if (!dateIso) warnings.push(lab.str + ": no sampling date found in the receipt block");
        if (!idText) warnings.push(lab.str + ": no client sample ID found in the receipt block");
        else if (!/^[A-Za-z0-9._\-\/ ]{1,30}$/.test(idText)) warnings.push(lab.str + ": client sample ID looks odd: " + idText.slice(0, 40));
        samples.push({ labNo: lab.str, type: type, date: dateIso, clientId: idText, tests: tests, page: pg });
      });
    });
    const seen = {}; samples.forEach(s => { if (seen[s.labNo]) warnings.push("Lab number appears twice in the receipt: " + s.labNo); seen[s.labNo] = 1; });
    return { samples: samples, warnings: warnings };
  }
  /* poppler `pdftotext -bbox` output -> items (y is the top of the word) */
  function itemsFromPopplerBbox(html) {
    const out = []; const pages = String(html).split(/<page\b/).slice(1);
    pages.forEach((p, i) => {
      const re = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g; let m;
      while ((m = re.exec(p))) out.push({ page: i + 1, str: m[5].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"), x: parseFloat(m[1]), y: parseFloat(m[2]), w: parseFloat(m[3]) - parseFloat(m[1]), h: parseFloat(m[4]) - parseFloat(m[2]) });
    });
    return out;
  }

  /* ---------- field samples ---------- */
  function ms(v) { if (v == null || v === "") return null; const t = typeof v === "number" ? v : Date.parse(v); return Number.isFinite(t) ? t : null; }
  /* an app train payload (public.envss_trains.payload) -> flat field sample */
  function normaliseTrain(p) {
    const person = p.person || {};
    const analyses = (p.analyses || []).map(a => (a && a.code) || a).filter(Boolean);
    return {
      trainId: p.id || "", eventId: p.eventId || "", fieldId: String(p.mediaId || "").trim(), sampleNo: p.sampleNo != null ? String(p.sampleNo) : "",
      mode: p.mode || "", status: p.status || "", shiftDate: p.shiftDate || "", startMs: ms(p.startAt), endMs: ms(p.endAt),
      startFlow: num(p.startFlow), endFlow: num(p.endFlow), pump: p.pumpSerial || "", head: p.headId || "", contaminant: p.contaminantId || "",
      analyses: analyses, occupation: person.occupation || "", location: p.location || "", locationCode: p.locationCode || "",
      shiftHours: num(person.hours), daysOn: num(person.daysOn), daysOff: num(person.daysOff), seg: p.seg || "", comments: p.comments || ""
    };
  }
  function parseTsv(text) {
    const lines = clean(text).split(/\r?\n/).filter(l => l.length); const head = lines[0].split("\t");
    return lines.slice(1).map(l => { const c = l.split("\t"), o = {}; head.forEach((h, i) => { o[h] = c[i] == null ? "" : c[i]; }); return o; });
  }
  /* flat table (tab separated export of the trains; see work/v48-19-lab-sync/README.md) -> field samples */
  function fieldFromTable(rows) {
    return rows.map(r => ({
      trainId: r.train_id || "", eventId: r.event_id || "", fieldId: String(r.media_id || "").trim(), sampleNo: r.sample_no || "", mode: r.mode || "", status: r.status || "",
      shiftDate: r.shift_date || "", startMs: ms(r.start_utc), endMs: ms(r.end_utc), startFlow: num(r.start_flow), endFlow: num(r.end_flow), pump: r.pump || "", head: r.head || "",
      contaminant: r.contam || "", analyses: String(r.analyses || "").split("+").map(s => s.trim()).filter(Boolean), occupation: r.occupation || "", location: r.location || "",
      locationCode: r.loc_code || "", shiftHours: num(r.hours), daysOn: num(r.days_on), daysOff: num(r.days_off), seg: r.seg || "", comments: r.comments || ""
    }));
  }
  /* a sample that was actually taken and sent: a pump run with times, or a field blank that went to the lab. "prepped" with no times = not used */
  function fieldKind(f) {
    if (f.mode === "blank") return "blank";
    if (f.startMs != null && f.endMs != null) return "sample";
    return "unused";
  }

  /* ---------- matching ---------- */
  /* Field <-> receipt by client sample ID, receipt <-> ESDAT by lab number, ESDAT <-> field by Field_ID as a cross-check. Nothing is guessed: an ID that differs is listed, not forced. */
  function matchAll(field, sra, esdat) {
    const fieldSent = field.filter(f => fieldKind(f) !== "unused"), fieldUnused = field.filter(f => fieldKind(f) === "unused");
    const sraBy = {}, dupSra = []; sra.samples.forEach(s => { const k = normId(s.clientId); if (sraBy[k]) dupSra.push(s.clientId); sraBy[k] = s; });
    const esBy = {}; esdat.samples.forEach(s => { esBy[s.labNo] = s; });
    const esByField = {}; esdat.samples.forEach(s => { esByField[normId(s.fieldId)] = s; });
    const links = [], fieldNoReceipt = [], matchedSra = {}, matchedEs = {}, conflicts = [];
    fieldSent.forEach(f => {
      const s = sraBy[normId(f.fieldId)];
      const e = s ? esBy[s.labNo] : null;
      if (!s) fieldNoReceipt.push(f.fieldId);
      if (s) matchedSra[s.labNo] = 1;
      if (e) matchedEs[e.labNo] = 1;
      if (s && e && normId(e.fieldId) !== normId(f.fieldId)) conflicts.push(f.fieldId + ": receipt " + s.labNo + " has ESDAT Field_ID " + e.fieldId);
      const eAlt = !e && esByField[normId(f.fieldId)] ? esByField[normId(f.fieldId)] : null;
      links.push({ field: f, sra: s || null, esdat: e || eAlt || null, esdatVia: e ? "lab number" : (eAlt ? "Field_ID only" : "") });
      if (eAlt) matchedEs[eAlt.labNo] = 1;
    });
    const receiptNoField = sra.samples.filter(s => !matchedSra[s.labNo]).map(s => s.labNo + " (" + s.clientId + ")");
    const receiptNoEsdat = sra.samples.filter(s => !esBy[s.labNo]).map(s => s.labNo + " (" + s.clientId + ")");
    const esdatNoReceipt = esdat.samples.filter(s => !sra.samples.some(r => r.labNo === s.labNo)).map(s => s.labNo + " (" + s.fieldId + ")");
    const esdatNoField = esdat.samples.filter(s => !matchedEs[s.labNo]).map(s => s.labNo + " (" + s.fieldId + ")");
    const dateMismatch = [];
    links.forEach(l => { if (l.sra && l.esdat && l.sra.date && l.esdat.date && l.sra.date !== l.esdat.date) dateMismatch.push(l.field.fieldId + ": receipt " + l.sra.date + " vs ESDAT " + l.esdat.date); });
    const sraDateVsShift = [];
    links.forEach(l => { if (l.sra && l.sra.date && l.field.shiftDate && l.sra.date !== l.field.shiftDate) sraDateVsShift.push(l.field.fieldId + ": receipt " + l.sra.date + " vs app shift date " + l.field.shiftDate); });
    const gridGaps = [];
    links.forEach(l => {
      if (!l.sra) return;
      const nc = x => String(x).toLowerCase().replace(/[^a-z0-9]/g, "");   /* the rotated "&" is lost by some extractors */
      const want = Array.from(new Set(l.field.analyses.map(a => SRA_COLUMN_FOR[a]).filter(Boolean)));
      const have = l.sra.tests.map(nc), wantN = want.map(nc);
      const miss = want.filter(w => have.indexOf(nc(w)) < 0), extra = l.sra.tests.filter(t => wantN.indexOf(nc(t)) < 0);
      if (miss.length || extra.length) gridGaps.push(l.field.fieldId + ": app plan needs [" + want.join(", ") + "], receipt grid has [" + l.sra.tests.join(", ") + "]");
    });
    const stats = {
      fieldTotal: field.length, fieldSent: fieldSent.length, fieldUnused: fieldUnused.map(f => f.fieldId), receiptTotal: sra.samples.length, esdatTotal: esdat.samples.length,
      fieldToReceipt: links.filter(l => l.sra).length, fieldToEsdat: links.filter(l => l.esdat).length, fullChain: links.filter(l => l.sra && l.esdat).length
    };
    return { links: links, stats: stats, unmatched: { fieldNoReceipt: fieldNoReceipt, receiptNoField: receiptNoField, receiptNoEsdat: receiptNoEsdat, esdatNoReceipt: esdatNoReceipt, esdatNoField: esdatNoField, fieldUnused: fieldUnused.map(f => f.fieldId) },
      checks: { conflicts: conflicts, dateMismatch: dateMismatch, sraDateVsShift: sraDateVsShift, gridGaps: gridGaps, duplicateReceiptIds: dupSra } };
  }

  /* ---------- calcs ---------- */
  function sampleVolume(f) {
    if (f.startMs == null || f.endMs == null) return null;
    const minutes = (f.endMs - f.startMs) / 60000, sf = f.startFlow, ef = f.endFlow;
    if (!(minutes > 0)) return { minutes: minutes, flow: null, litres: null, m3: null, problem: "stop is not after start" };
    if (sf == null && ef == null) return { minutes: minutes, flow: null, litres: null, m3: null, problem: "no flow rate" };
    const flow = sf != null && ef != null ? (sf + ef) / 2 : (sf != null ? sf : ef);
    const litres = flow * minutes;
    return { minutes: minutes, flow: flow, startFlow: sf, endFlow: ef, litres: litres, m3: litres / 1000, problem: "" };
  }
  function massMg(value, unit) {
    if (value == null) return null; const u = String(unit || "").toLowerCase().replace("µ", "u").replace("μ", "u");
    if (u === "mg" || u === "mg/sample") return value; if (u === "ug" || u === "ug/sample") return value / 1000; if (u === "ng" || u === "ng/sample") return value / 1e6; if (u === "g") return value * 1000;
    return null;
  }
  /* DMIRS 2019, Adjustment of atmospheric contaminant exposure standards (modified Quebec model): cat 1 none; cat 2 Fa = 8/Hd; cat 3 Fa = 40/Hwk;
     cat 4 the lower of the two; never above 1; only for shifts of 4 to 16 h. Hwk = hours per shift x days on x 7 / (days on + days off) (repeating roster cycle). */
  function dmirsFactor(cat, hoursPerShift, daysOn, daysOff) {
    const out = { cat: cat, hd: hoursPerShift, daysOn: daysOn, daysOff: daysOff, hwk: null, faDaily: null, faWeekly: null, faRaw: null, fa: 1, capped: false, applicable: true, flags: [], text: "" };
    const needWk = cat === 3 || cat === 4, needDay = cat === 2 || cat === 4;
    if (cat === 1) { out.text = "category 1: no adjustment, Fa = 1"; return out; }
    if (hoursPerShift == null) { out.applicable = false; out.fa = 1; out.flags.push("shift hours missing: limit not adjusted"); out.text = "shift hours missing, Fa = 1 (not adjusted)"; return out; }
    if (hoursPerShift < CFG.shiftMinH || hoursPerShift > CFG.shiftMaxH) { out.applicable = false; out.fa = 1; out.flags.push("shift of " + hoursPerShift + " h is outside 4 to 16 h: guide does not apply, review by hand"); out.text = "shift " + hoursPerShift + " h outside 4 to 16 h, Fa = 1 (not adjusted)"; return out; }
    if (needWk && (daysOn == null || daysOff == null || daysOn + daysOff <= 0)) { out.applicable = false; out.fa = 1; out.flags.push("roster days on/off missing: weekly adjustment not possible, limit not adjusted"); out.text = "roster missing, Fa = 1 (not adjusted)"; return out; }
    const parts = [];
    if (needDay) { out.faDaily = 8 / hoursPerShift; parts.push("daily 8/" + hoursPerShift + " = " + sig(out.faDaily, 4)); }
    if (needWk) { out.hwk = hoursPerShift * daysOn * 7 / (daysOn + daysOff); out.faWeekly = 40 / out.hwk; parts.push("weekly 40/" + sig(out.hwk, 4) + " h/wk = " + sig(out.faWeekly, 4)); }
    out.faRaw = Math.min.apply(null, [out.faDaily, out.faWeekly].filter(v => v != null));
    out.fa = Math.min(1, out.faRaw); out.capped = out.faRaw > 1;
    out.text = "category " + cat + ": " + parts.join(", ") + (cat === 4 ? ", lower taken" : "") + " -> Fa " + sig(out.fa, 4) + (out.capped ? " (capped at 1)" : "");
    return out;
  }
  /* The factor in the issued report's Table 2 (legacy IRSST monthly-hours method used in the ENVSS sheet): cat 2 = 8/Hd; cat 3 = 1 up to 174 h/month else 170/(h/month);
     h/month = shift hours x on/(on+off) x 30.4; cat 4 = lower of the two; capped at 1. Kept only to explain differences from the DMIRS 2019 weekly method. */
  function legacyFa(cat, h, on, off) {
    if (cat === 1 || h == null) return 1;
    const daily = 8 / h, monthly = on != null && off != null && on + off > 0 ? h * on / (on + off) * 30.4 : null, weekly = monthly == null ? null : (monthly <= 174 ? 1 : 170 / monthly);
    const v = cat === 2 ? daily : cat === 3 ? (weekly == null ? 1 : weekly) : Math.min(daily, weekly == null ? 1 : weekly);
    return Math.min(1, v);
  }
  /* which limits apply for a sample date: before welFrom both WES and WEL, from welFrom WEL only */
  function basesForDate(dateIso) { return dateIso && dateIso >= CFG.welFrom ? ["WEL"] : ["WES", "WEL"]; }
  function riskClass(pct) { return pct == null ? "" : pct > 100 ? "High" : pct > CFG.actionLevelPct ? "Medium" : "Low"; }
  function pctText(pct, lessThan) { if (pct == null) return ""; if (pct < CFG.pctBinLow) return "<" + CFG.pctBinLow + "%"; return (lessThan ? "<" : "") + Math.round(pct) + "%"; }

  function compareOne(key, twa, lessThan, dateIso, fa) {
    const a = ANALYTES[key], out = {};
    ["WES", "WEL"].forEach(basis => {
      const lim = basis === "WES" ? a.wes : a.wel;
      const applies = basesForDate(dateIso).indexOf(basis) >= 0;
      const o = { basis: basis, applies: applies, limit: lim.value, official: lim.official !== false, source: lim.note, adjusted: null, pct: null, risk: "", text: "" };
      if (!applies) o.text = basis + " not compared: sample date is from " + CFG.welFrom + " (WEL only)";
      else if (a.info) o.text = "information row, no limit applied";
      else if (lim.value == null) o.text = basis + ": no numeric limit (" + lim.note.replace(/^.*?: /, "") + ")";
      else if (twa == null) o.text = "no concentration";
      else {
        o.adjusted = lim.value * fa; o.pct = twa / o.adjusted * 100; o.risk = riskClass(o.pct);
        o.text = basis + " " + lim.value + (o.official ? "" : " (benchmark, not an SWA list value)") + " x Fa " + sig(fa, 4) + " = " + sig(o.adjusted, 4) + " mg/m3 -> " + (lessThan ? "<" : "") + sig(o.pct, 3) + "% (" + o.risk + (lessThan ? ", at the reporting limit" : "") + ")";
      }
      out[basis] = o;
    });
    return out;
  }

  /* ---------- the sheet table: one row per sample x analyte ---------- */
  const COLUMNS = [
    "Job", "Sample date (shift)", "Lab sampling date", "Field ID", "Lab number", "Matrix / type", "Occupation", "Location", "Pump", "Head / pouch",
    "Start (AWST)", "Stop (AWST)", "Minutes", "Start flow L/min", "Stop flow L/min", "Avg flow L/min", "Volume L", "Volume m3",
    "Shift h", "Days on", "Days off", "Hours/week",
    "Analyte", "Lab method", "Lab result", "Lab unit", "Below LOR?", "LOR", "Mass mg", "Conc mg/m3 (TWA)",
    "DMIRS cat", "Fa (cap 1)", "WES mg/m3", "WES adj", "% WES adj", "WES risk", "WEL mg/m3", "WEL adj", "% WEL adj", "WEL risk",
    "Calc note", "Flags"
  ];
  function buildRows(job, matched, esdat) {
    const resBy = {}; esdat.results.forEach(r => { (resBy[r.labNo] = resBy[r.labNo] || []).push(r); });
    const rows = [];
    matched.links.forEach(l => {
      const f = l.field, kind = fieldKind(f), vol = sampleVolume(f);
      const labNo = (l.sra && l.sra.labNo) || (l.esdat && l.esdat.labNo) || "";
      const results = labNo ? (resBy[labNo] || []) : [];
      const planned = []; f.analyses.forEach(a => (FIELD_ANALYSES[a] || []).forEach(k => { if (planned.indexOf(k) < 0) planned.push(k); }));
      const keys = planned.slice(); results.forEach(r => { if (r.key && keys.indexOf(r.key) < 0) keys.push(r.key); });
      const hasUnmapped = results.filter(r => !r.key);
      const rosterHrs = f.shiftHours != null && f.daysOn != null && f.daysOff != null && f.daysOn + f.daysOff > 0 ? f.shiftHours * f.daysOn * 7 / (f.daysOn + f.daysOff) : null;
      keys.forEach(key => {
        const a = ANALYTES[key], r = results.find(x => x.key === key) || null, flags = [];
        if (!l.sra) flags.push("no receipt entry");
        if (!labNo) flags.push("no lab number");
        if (labNo && !r) flags.push(results.length ? "no ESDAT result for this analyte" : (l.esdat ? "no ESDAT chemistry rows" : "no ESDAT sample"));
        if (!planned.includes(key)) flags.push("lab extra: not in the app analysis plan");
        let mg = null, twa = null, lt = false, note = "", coverNote = "", cmp = { WES: null, WEL: null }, fac = null;
        if (r && r.value != null) { mg = massMg(r.value, r.unit); lt = r.lessThan; if (mg == null) flags.push("unit not understood: " + r.unit); }
        if (kind === "blank") {
          note = r ? "Field blank: " + (lt ? "<" : "") + r.value + " " + r.unit + " (reporting limit " + (r.eql != null ? r.eql : "?") + "). No volume, no TWA, no limit comparison." : "Field blank: no lab result.";
        } else {
          if (!vol) flags.push("no sampling times"); else if (vol.problem) flags.push(vol.problem);
          if (vol && vol.m3 && mg != null) twa = mg / vol.m3;
          const cat = a.cat;
          fac = dmirsFactor(cat, f.shiftHours, f.daysOn, f.daysOff);
          fac.flags.forEach(x => flags.push(x));
          const cover = vol && f.shiftHours ? vol.minutes / (f.shiftHours * 60) * 100 : null;
          if (cover != null && cover < CFG.coverageWarnPct) coverNote = "Sampled " + round(vol.minutes / 60, 1) + " h of the " + f.shiftHours + " h shift (" + Math.round(cover) + "%); the TWA assumes the unsampled time had the same exposure";
          if (cover != null && cover < CFG.coverageFlagPct) flags.push("sampled only " + Math.round(cover) + "% of the shift");
          if (twa != null) cmp = compareOne(key, twa, lt, f.shiftDate, fac.fa);
          else cmp = compareOne(key, null, lt, f.shiftDate, fac.fa);
          const m = [];
          if (r && r.value != null) {
            m.push((lt ? "Lab result below the reporting limit: " : "Lab result: ") + (lt ? "<" : "") + r.value + " " + r.unit + (mg != null && /^u/i.test(String(r.unit).replace("µ", "u")) ? " = " + sig(mg, 5) + " mg" : ""));
            if (vol && vol.m3) m.push("Volume: " + sig(vol.flow, 3) + " L/min x " + round(vol.minutes, 0) + " min = " + sig(vol.litres, 5) + " L (" + sig(vol.m3, 5) + " m3)" + (vol.startFlow != null && vol.endFlow != null && vol.startFlow !== vol.endFlow ? ", average of start and stop flow" : ""));
            if (twa != null) m.push("Concentration: " + sig(mg, 5) + " mg / " + sig(vol.m3, 5) + " m3 = " + (lt ? "<" : "") + sig(twa, 4) + " mg/m3" + (lt ? " (reporting limit over volume; true value is lower)" : ""));
          } else m.push("No lab result for this analyte.");
          if (coverNote) m.push(coverNote);
          m.push("Roster: " + (f.shiftHours != null ? f.shiftHours + " h shift" : "shift hours missing") + (f.daysOn != null && f.daysOff != null ? ", " + f.daysOn + " on / " + f.daysOff + " off" : "") + (rosterHrs != null ? " = " + sig(rosterHrs, 4) + " h/wk" : "") + "; " + fac.text);
          if (!a.info) { ["WES", "WEL"].forEach(b => { if (cmp[b] && cmp[b].text) m.push(cmp[b].text); }); }
          else m.push("Information row, no limit applied");
          note = m.map(x => String(x).replace(/\.\s*$/, "")).join(". ") + ".";
        }
        rows.push({
          job: job, date: f.shiftDate, fieldId: f.fieldId, labNo: labNo, kind: kind, matrixType: (l.sra && l.sra.type) || "", occupation: f.occupation, location: f.location, pump: f.pump, headPouch: [f.head, f.pouch || f.sampleNo].filter(Boolean).join(" / "),
          startAwst: perthStr(f.startMs), stopAwst: perthStr(f.endMs), minutes: vol ? round(vol.minutes, 0) : null, startFlow: f.startFlow, endFlow: f.endFlow, flow: vol ? vol.flow : null, litres: vol ? round(vol.litres, 1) : null, m3: vol ? round(vol.m3, 5) : null,
          shiftHours: f.shiftHours, daysOn: f.daysOn, daysOff: f.daysOff, hoursWeek: rosterHrs != null ? round(rosterHrs, 2) : null,
          key: key, analyte: a.label, method: r ? r.method : "", labValue: r ? r.value : null, labUnit: r ? r.unit : "", lessThan: lt, lor: r ? r.eql : null, massMg: mg, twa: twa,
          cat: a.cat, fa: fac ? fac.fa : null, faInfo: fac, cmp: cmp, note: note, flags: flags, labDate: (l.esdat && l.esdat.date) || (l.sra && l.sra.date) || ""
        });
      });
      if (hasUnmapped.length) rows.push({ job: job, date: f.shiftDate, fieldId: f.fieldId, labNo: labNo, kind: kind, key: "", analyte: "(lab analyte not mapped)", note: hasUnmapped.map(x => x.chemName + " " + x.value + " " + x.unit).join("; "), flags: ["unmapped lab analyte"], cmp: { WES: null, WEL: null } });
    });
    return rows;
  }
  function rowToCells(r) {
    const c = (x) => x == null ? "" : x, w = r.cmp && r.cmp.WES, l = r.cmp && r.cmp.WEL;
    const lim = o => o && o.applies && o.limit != null ? o.limit : (o && !o.applies ? "n/a (WEL only)" : (o && o.limit == null && r.kind !== "blank" ? "none" : ""));
    return [r.job, c(r.date), c(r.labDate), r.fieldId, c(r.labNo), c(r.matrixType) + (r.kind === "blank" ? " (field blank)" : ""), c(r.occupation), c(r.location), c(r.pump), c(r.headPouch),
      c(r.startAwst), c(r.stopAwst), c(r.minutes), c(r.startFlow), c(r.endFlow), c(r.flow), c(r.litres), c(r.m3), c(r.shiftHours), c(r.daysOn), c(r.daysOff), c(r.hoursWeek),
      r.analyte, c(r.method), c(r.labValue), c(r.labUnit), r.lessThan ? "yes" : (r.labValue != null ? "no" : ""), r.lessThan ? c(r.lor) : "", c(r.massMg == null ? null : round(r.massMg, 6)), r.twa == null ? "" : (r.lessThan ? "<" : "") + sig(r.twa, 4),
      c(r.cat), r.fa == null ? "" : round(r.fa, 4), lim(w), w && w.adjusted != null ? round(w.adjusted, 5) : "", w && w.pct != null ? (r.lessThan ? "<" : "") + round(w.pct, 1) : "", w ? c(w.risk) : "",
      lim(l), l && l.adjusted != null ? round(l.adjusted, 5) : "", l && l.pct != null ? (r.lessThan ? "<" : "") + round(l.pct, 1) : "", l ? c(l.risk) : "",
      r.note || "", (r.flags || []).join("; ")];
  }
  function rowsToTable(rows) { return [COLUMNS].concat(rows.map(rowToCells)); }

  /* ---------- issued report (tables 5 to 8) from pdftotext -layout ---------- */
  /* the label must be followed only by spaces and then a number, "<" or the end of the line: "Quality & Gypsum Operator 1" is an occupation, not an analyte */
  const REPORT_ANALYTE_RE = /\b(Inhalable Dust|Respirable Dust|Crystalline Silica|Welding Fumes|Gypsum|Chromium|Copper|Iron Oxide|Manganese|Nickel|Zinc Oxide)[ \t]*(?=<|\d|$)/;
  const FIRST_OF_GROUP = { "Inhalable Dust": 1, "Respirable Dust": 1, "Welding Fumes": 1 };
  function parseReportText(text) {
    const lines = clean(text).split(/\r?\n/), rows = [], warnings = [];
    let i0 = lines.findIndex(l => /^\s*6\.0\s+Results\s*&\s*Comments\s*$/.test(l)); if (i0 < 0) { warnings.push("results section not found"); return { rows: rows, warnings: warnings }; }
    let table = 0; const groups = []; let cur = null; const sampleLines = []; const dpm = [], pending = [], usedNum = {}, usedPct = {};
    const numTok = /(<?\s?\d+\.\d+)/, pctTok = /(<\s?\d+%|\d+%)/;
    for (let i = i0; i < lines.length; i++) {
      const L = lines[i]; if (/^\s*6\.2\s+Personal Noise/.test(L) || /^\s*Table 9:/.test(L)) break;
      const tm = /^\s*Table\s+(\d+):/.exec(L); if (tm) { table = Number(tm[1]); continue; }
      if (table < 5 || table > 8) continue;
      const sm = /^\s*(\d{2}\/\d{2}\/\d{4})\s+([A-Z]{2,5}\d+)\b(.*)$/.exec(L);
      if (table === 7) {
        if (sm) { const rest = sm[3], r = numTok.exec(rest), p = pctTok.exec(rest); dpm.push({ date: isoFromDmy(sm[1]), sampleId: sm[2], label: "Diesel Particulate Matter", resultText: r ? r[1].replace(/\s/g, "") : "", pctText: p ? p[1].replace(/\s/g, "") : "", table: 7 }); }
        continue;
      }
      if (sm) sampleLines.push({ idx: groups.length, date: isoFromDmy(sm[1]), sampleId: sm[2], table: table, line: i });
      const am = REPORT_ANALYTE_RE.exec(L);
      if (am) {
        if (FIRST_OF_GROUP[am[1]] || !cur || cur.table !== table) { cur = { table: table, items: [] }; groups.push(cur); }
        const after = L.slice(am.index + am[0].length), r = numTok.exec(after), p = pctTok.exec(after);
        const it = { label: am[1], resultText: r ? r[1].replace(/\s/g, "") : "", pctText: p ? p[1].replace(/\s/g, "") : "", line: i };
        if (r) usedNum[i] = 1; if (p) usedPct[i] = 1;
        pending.push(it);
        cur.items.push(it);
      }
    }
    /* layout quirk: a number or % can be printed on the line above or below, next to a wrapped location word. Fill from the nearest unused neighbour line. */
    pending.forEach(it => {
      const near = [-1, 1, -2, 2];
      if (!it.resultText) for (const d of near) { const o = lines[it.line + d]; if (o == null || usedNum[it.line + d] || REPORT_ANALYTE_RE.test(o)) continue; const m = numTok.exec(o); if (m) { it.resultText = m[1].replace(/\s/g, ""); usedNum[it.line + d] = 1; break; } }
      if (!it.pctText) for (const d of near) { const o = lines[it.line + d]; if (o == null || usedPct[it.line + d] || REPORT_ANALYTE_RE.test(o)) continue; const m = pctTok.exec(o); if (m) { it.pctText = m[1].replace(/\s/g, ""); usedPct[it.line + d] = 1; break; } }
    });
    const perTable = {}; sampleLines.forEach(s => { (perTable[s.table] = perTable[s.table] || []).push(s); });
    const gPer = {}; groups.forEach(g => { (gPer[g.table] = gPer[g.table] || []).push(g); });
    Object.keys(gPer).forEach(t => {
      const gs = gPer[t], ss = perTable[t] || [];
      if (gs.length !== ss.length) warnings.push("Table " + t + ": " + gs.length + " analyte groups but " + ss.length + " sample lines");
      gs.forEach((g, k) => { const s = ss[k]; if (!s) return; g.items.forEach(it => rows.push({ date: s.date, sampleId: s.sampleId, label: it.label, resultText: it.resultText, pctText: it.pctText, table: Number(t) })); });
    });
    dpm.forEach(d => rows.push(d));
    rows.forEach(r => { r.lessThan = /^</.test(r.resultText); r.value = num(r.resultText.replace("<", "")); r.decimals = (/\.(\d+)$/.exec(r.resultText) || [0, ""])[1].length; if (r.value == null) warnings.push("No number parsed: " + r.sampleId + " " + r.label); if (!r.pctText) warnings.push("No %WES parsed: " + r.sampleId + " " + r.label); });
    return { rows: rows, warnings: warnings };
  }
  function pctNum(t) { const m = /(\d+)%/.exec(t || ""); return m ? Number(m[1]) : null; }

  /* ---------- report vs ours ---------- */
  function compareReport(report, ourRows) {
    const idx = {}; ourRows.forEach(r => { if (r.fieldId && r.key) idx[normId(r.fieldId) + "|" + r.key] = r; });
    const diffs = [], matched = [], seen = {};
    report.rows.forEach(rr => {
      const map = REPORT_LABELS[rr.label.toLowerCase()];
      if (!map) { diffs.push({ sampleId: rr.sampleId, analyte: rr.label, type: "unmapped report label", report: rr.resultText + " " + rr.pctText, ours: "", cause: "Report label not known to the comparer" }); return; }
      const on = idx[normId(rr.sampleId) + "|" + map.numeric], op = idx[normId(rr.sampleId) + "|" + map.pct];
      if (!on) { diffs.push({ sampleId: rr.sampleId, analyte: rr.label, type: "report row not in ours", report: rr.resultText + " " + rr.pctText, ours: "", cause: "No lab result / field sample for this ID and analyte in our table" }); return; }
      seen[normId(rr.sampleId) + "|" + map.numeric] = 1; if (op) seen[normId(rr.sampleId) + "|" + map.pct] = 1;
      const entry = { sampleId: rr.sampleId, date: rr.date, analyte: rr.label, report: rr.resultText, reportPct: rr.pctText, ours: on.twa == null ? "" : (on.lessThan ? "<" : "") + sig(on.twa, 4), oursPct: "", diffs: [] };
      /* sample date */
      if (rr.date && on.date && rr.date !== on.date) entry.diffs.push({ type: "sample date", cause: "Report date " + rr.date + " vs app shift date " + on.date + (on.labDate && on.labDate !== on.date ? "; the lab receipt and ESDAT carry " + on.labDate + " (the CoC date), so the report follows " + (rr.date === on.labDate ? "the lab/CoC date" : "neither") : "") });
      /* concentration */
      if (on.twa == null) entry.diffs.push({ type: "no concentration", cause: (on.flags || []).join("; ") || "no result" });
      else {
        const dec = rr.decimals, tol = Math.max(0.5 * Math.pow(10, -dec) * 1.0001, Math.abs(rr.value) * CFG.numTolRel);
        const implV = on.massMg != null && rr.value ? on.massMg / rr.value : null, vr = implV != null && on.litres ? implV * 1000 / on.litres - 1 : null;
        if (rr.lessThan !== on.lessThan) entry.diffs.push({ type: "< LOR flag", cause: "Report " + (rr.lessThan ? "prints a '<'" : "prints a plain number") + " where the lab ESDAT " + (on.lessThan ? "has Prefix '<' (below the reporting limit; the number is the limit over the volume)" : "has a detected value") + ". " + (on.lessThan && !rr.lessThan ? "Looks like the '<' was dropped when the report table was filled: other rows with the same lab flag keep it." : "") });
        if (Math.abs(on.twa - rr.value) > tol) {
          let cause;
          if (vr != null && Math.abs(vr) <= 0.02) cause = "Small volume difference: report concentration implies " + sig(implV * 1000, 5) + " L, ours " + sig(on.litres, 5) + " L (" + sig(vr * 100, 2) + "%); likely times or flow rounded differently";
          else if (vr != null) cause = "Not a rounding or time difference: report concentration implies " + sig(implV * 1000, 5) + " L, ours " + sig(on.litres, 5) + " L (" + sig(vr * 100, 3) + "%) from lab mass " + sig(on.massMg, 4) + " mg. Report value looks mistyped or taken from another result";
          else cause = "Different mass or volume basis";
          if (map.basisNote && on.key === "iron_oxide_fe2o3") cause += " (" + map.basisNote + ")";
          entry.diffs.push({ type: "concentration", cause: cause });
        }
      }
      /* % of WES (the issued report compares to the WES only) */
      const w = op && op.cmp && op.cmp.WES;
      if (w && w.pct != null && rr.pctText) {
        entry.oursPct = pctText(w.pct, op.lessThan) + " (" + sig(w.pct, 3) + "%)";
        const rp = pctNum(rr.pctText), reportBin = /^</.test(rr.pctText) && rp === CFG.pctBinLow;
        const printed = (pctv, mode) => pctv < CFG.pctBinLow ? "<10" : String(mode === "ceil" ? Math.ceil(pctv - 1e-9) : Math.round(pctv));
        const target = reportBin ? "<10" : String(rp), conc = on.twa, lim = w.limit;
        const fa0 = op.fa, fl = op.faInfo ? legacyFa(op.faInfo.cat, op.faInfo.hd, op.faInfo.daysOn, op.faInfo.daysOff) : fa0;
        if (printed(w.pct, "round") !== target) {
          const hyp = [["round", fl, "legacy"], ["ceil", fl, "legacy"], ["ceil", fa0, "ours"]].find(h => printed(conc / (lim * h[1]) * 100, h[0]) === target);
          let cause;
          if (!hyp) cause = "not explained by rounding or the legacy factor";
          else if (hyp[2] === "ours" || Math.abs(fl - fa0) < 1e-9) cause = "the report rounds % up (" + sig(w.pct, 5) + "% printed as " + rp + "%); ours rounds to nearest";
          else cause = "the report uses the legacy monthly-hours factor " + sig(fl, 4) + " (Table 2, 170 / h per month) where DMIRS 2019 weekly hours give Fa " + sig(fa0, 4) + " (" + op.faInfo.text + ")" + (hyp[0] === "ceil" ? "; it also rounds % up" : "");
          if (map.basisNote && op.key === "iron_fe") cause += "; " + map.basisNote + " (as-Fe concentration " + sig(op.twa, 3) + " mg/m3)";
          entry.diffs.push({ type: "% of WES", cause: cause });
        }
        /* risk class: the report puts a printed 50% in "medium" (its executive summary says so); ours follows the action-level rule, medium only above 50% of the adjusted limit */
        const repClass = reportBin ? "Low" : (rp > 100 ? "High" : (rp >= CFG.actionLevelPct ? "Medium" : "Low")), ourClass = w.risk;
        if (repClass !== ourClass) entry.diffs.push({ type: "risk class", cause: "Report class " + repClass + " (printed " + rr.pctText + "), ours " + ourClass + " (" + sig(w.pct, 3) + "% of the DMIRS 2019 adjusted limit " + sig(w.adjusted, 4) + " mg/m3)" });
      }
      if (entry.diffs.length) diffs.push(Object.assign({}, entry, { type: entry.diffs.map(d => d.type).join(" + "), cause: entry.diffs.map(d => d.cause).join(" | ") }));
      else matched.push(entry);
    });
    const missingInReport = ourRows.filter(r => r.key && r.kind === "sample" && r.twa != null && !ANALYTES[r.key].info && !seen[normId(r.fieldId) + "|" + r.key]).map(r => ({ sampleId: r.fieldId, analyte: r.analyte, type: "ours not in report", report: "", ours: (r.lessThan ? "<" : "") + sig(r.twa, 4), cause: "Sample/analyte has a lab result and field data but no row in the issued report tables" }));
    return { matched: matched, diffs: diffs, missingInReport: missingInReport };
  }

  /* ---------- report Table 2 (adjusted limits per roster) ---------- */
  function parseReportTable2(text) {
    const lines = clean(text).split(/\r?\n/), out = { rosters: [], rows: [], warnings: [] };
    const i0 = lines.findIndex((l, i) => /^\s*Table 2:\s*TWA WES/.test(l) && /TWA\s+\d:\d/.test(lines.slice(i + 1, i + 4).join(" ")));   /* skips the table of contents line */ if (i0 < 0) { out.warnings.push("Table 2 not found"); return out; }
    const hdr = lines.slice(i0 + 1, i0 + 4).join(" "); const rr = []; let m; const re = /TWA\s+(\d):(\d)(\d{1,2})\s*hr/g;
    while ((m = re.exec(hdr))) rr.push({ label: m[1] + ":" + m[2] + " " + m[3] + "h", on: Number(m[1]), off: Number(m[2]), hours: Number(m[3]) });
    out.rosters = rr; let prev = "";
    for (let i = i0 + 1; i < Math.min(lines.length, i0 + 60); i++) {
      if (/^\s*5\.2\s/.test(lines[i])) break;
      const mm = /^\s*(.*?)\s+(IV|III|II|I)\s+((?:\d+(?:\.\d+)?\s+){5}\d+(?:\.\d+)?)\s*$/.exec(lines[i]);
      if (!mm) { if (lines[i].trim() && !/^\s*(Contaminant|ENVSS_Report|TWA|IRSST|Category)/.test(lines[i])) prev = lines[i].trim(); continue; }
      let name = mm[1].trim(); const known = Object.keys(REPORT_LABELS).concat(["calcium sulfate", "diesel particulate", "welding fumes", "copper", "manganese", "zinc oxide", "iron oxide"]);
      if (!name || !known.some(k => name.toLowerCase().indexOf(k) === 0)) name = (prev + " " + name).trim();
      out.rows.push({ name: name, cat: { I: 1, II: 2, III: 3, IV: 4 }[mm[2]], values: mm[3].split(/\s+/).map(Number) }); prev = "";
    }
    return out;
  }
  const T2_KEYS = [["inhalable dust", "inhalable_dust"], ["calcium sulfate", "gypsum"], ["respirable dust", "respirable_dust"], ["crystalline silica", "quartz"], ["diesel particulate", "dpm_ec"], ["welding fumes", "welding_fume"],
    ["chromium", "chromium"], ["copper", "copper_fume"], ["iron oxide", "iron_fe"], ["manganese", "manganese"], ["nickel", "nickel"], ["zinc oxide", "zinc_oxide"]];
  /* the report's adjusted limits vs WES x our DMIRS 2019 factor, per roster */
  function compareReportTable2(t2) {
    const diffs = [];
    t2.rows.forEach(row => {
      const k = (T2_KEYS.find(x => row.name.toLowerCase().indexOf(x[0]) === 0) || [])[1];
      if (!k) { diffs.push({ analyte: row.name, roster: "", report: "", ours: "", cause: "analyte not known to the comparer" }); return; }
      const a = ANALYTES[k], wes = a.wes.value;
      if (row.cat !== a.cat) diffs.push({ analyte: row.name, roster: "(category)", report: "category " + row.cat, ours: "category " + a.cat, cause: "IRSST category differs: " + a.catNote });
      t2.rosters.forEach((ro, j) => {
        const f = dmirsFactor(a.cat, ro.hours, ro.on, ro.off), ours = wes * f.fa, rep = row.values[j], lg = wes * legacyFa(row.cat, ro.hours, ro.on, ro.off);
        const tol = Math.max(Math.abs(rep) * 0.0005, 6e-5);   /* the report prints 4 decimals */
        if (Math.abs(ours - rep) > tol) diffs.push({ analyte: row.name, roster: ro.label, report: rep, ours: sig(ours, 5), cause: Math.abs(lg - rep) <= tol ? "report uses the legacy monthly-hours IRSST factor (" + sig(legacyFa(row.cat, ro.hours, ro.on, ro.off), 4) + ", 170 / (" + ro.hours + " h x " + ro.on + "/" + (ro.on + ro.off) + " x 30.4 days)); DMIRS 2019 uses weekly hours " + sig(ro.hours * ro.on * 7 / (ro.on + ro.off), 4) + " -> Fa " + sig(f.fa, 4) : "different factor, not explained by the legacy method" });
      });
    });
    return diffs;
  }

  const api = { VERSION: VERSION, CFG: CFG, ANALYTES: ANALYTES, ESDAT_MAP: ESDAT_MAP, FIELD_ANALYSES: FIELD_ANALYSES, SRA_COLUMN_FOR: SRA_COLUMN_FOR, REPORT_LABELS: REPORT_LABELS, COLUMNS: COLUMNS,
    parseCsv: parseCsv, csvOut: csvOut, parseEsdat: parseEsdat, parseSraHeader: parseSraHeader, parseSraItems: parseSraItems, itemsFromPopplerBbox: itemsFromPopplerBbox,
    normaliseTrain: normaliseTrain, parseTsv: parseTsv, fieldFromTable: fieldFromTable, fieldKind: fieldKind, matchAll: matchAll,
    sampleVolume: sampleVolume, massMg: massMg, dmirsFactor: dmirsFactor, legacyFa: legacyFa, parseReportTable2: parseReportTable2, compareReportTable2: compareReportTable2, basesForDate: basesForDate, riskClass: riskClass, pctText: pctText, compareOne: compareOne,
    buildRows: buildRows, rowToCells: rowToCells, rowsToTable: rowsToTable, parseReportText: parseReportText, compareReport: compareReport, normId: normId, perthStr: perthStr, isoFromDmy: isoFromDmy, isoFromEsdat: isoFromEsdat };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.ENVSS_LABSYNC = api;
})(typeof window !== "undefined" ? window : globalThis);

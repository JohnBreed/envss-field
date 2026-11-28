/* ENVSS Field — vent survey module (vent.js). v48.19 vent (John, 28 Nov 2026 AWST: "Vent apps working today").
   Loaded by field.html straight after noise.js; cached by sw-field.js and re-checked with the server when online (like noise.js).
   Hooks sit beside the noise.js hooks, never through them: every wrapper below only acts on a vent event / vent measurement
   and otherwise calls straight on to whatever was there before (core, noise.js or a later layer).

   What it does
     · A vent event is a hygiene event made from the Podio Vent Survey Event app (podioEventKind "vent"; or type "vent").
       Its code stays {job}-NNN. On it, Add sample becomes Add measurement and offers only vent types.
     · Anemometer make / model / serial is entered once per event (ev.ventEquip) on the event screen.
     · One vent measurement = one sample record (trainKind "vent"), so it is saved on the device and synced exactly like
       every other sample (envss_trains, same offline queue). Fields live in t.vent:
         type (face | capture | other | visual), unit, hood, condition   ← the extraction unit
         location, distanceCm, readings[] (m/s, numbered), below05 (distance where velocity < 0.5 m/s, optional),
         comments, photos[] (envss-photo refs, same IndexedDB / Drive photo queue as other samples)
       Average, lowest and highest are worked out from the readings (never typed). t.location / t.comments mirror the
       vent values so the existing location and export code sees them.
     · Complete = unit + location + at least one reading (a visual check needs a comment instead of readings).
     · Vent surveys have no lab samples, so a pure vent event has no COC; Mark event complete checks the measurements.
     · Export vent survey CSV (event ☰ menu) uses the Drive "Ventilation Survey Sampling" sheet columns, for pasting.
   Not done here: no Podio writes, no Drive sheet fill. Existing records are never rewritten. */
(function (g) {
  "use strict";
  const VENT_VERSION = "48.19";
  const C = () => g.envssCore || {};
  const esc = v => { const f = C().esc || g.esc; return f ? f(v == null ? "" : v) : String(v == null ? "" : v); };
  const str = v => (v == null ? "" : String(v));

  const TYPES = [
    ["grid", "Fume cupboard audit", "Guided AS/NZS 2243.8:2014 audit: unit details, smoke test (Appendix A) first, then the face velocity grid (Appendix B) and the Figure A1 record."],
    ["face", "Face velocity", "At the extraction face, hood opening or sash."],
    ["capture", "Capture velocity", "At the source or work position, a set distance from the face."],
    ["other", "Other velocity reading", "e.g. edge of a table, breathing zone, booth length, duct."],
    ["visual", "Visual check only", "No readings possible (e.g. fully enclosed). Describe what was seen."]
  ];
  /* the Add measurement list: the grid replaces the single-location face reading (kept only so older records still open) */
  const PICK = ["grid", "face", "capture", "other", "visual"];
  const typeName = k => (TYPES.find(a => a[0] === k) || [])[1] || "Vent measurement";
  /* type picker images: freely licensed, credited in the app and in assets/vent/ATTRIBUTION.md; SVG icon if an image fails */
  const TYPE_IMG = {
    grid: { src: "assets/vent/fume-cupboard.jpg", alt: "Fume cupboard", credit: "Photo: Hey Paul from Sacramento, CA, USA, CC BY 2.0", page: "https://commons.wikimedia.org/wiki/File:Fume_Hood.jpg" },
    face: { src: "assets/vent/spray-booth.jpg", alt: "Spray booth", credit: "Photo: Chrysler Restorers SA, CC0 1.0", page: "https://commons.wikimedia.org/wiki/File:Spray_booth.jpg" },
    capture: { src: "assets/vent/capture-hood.jpg", alt: "Capture hood on an extraction arm", credit: "Photo: Borderlands Roomba, CC BY-SA 4.0", page: "https://commons.wikimedia.org/wiki/File:Welding_booth_with_local_exhaust_system.jpg" },
    other: { src: "assets/vent/downdraft-table.jpg", alt: "Downdraft table", credit: "Photo: akarmy (Flickr), CC BY 2.0", page: "https://www.flickr.com/photos/50868481@N00/11281325085" },
    visual: { src: "assets/vent/biosafety-cabinet.jpg", alt: "Enclosed cabinet", credit: "Photo: Ca.garcia.s, CC BY-SA 4.0", page: "https://commons.wikimedia.org/wiki/File:Biological_Safety_Cabinet_(Class_II,_Type_A2)_Front_view.jpg" }
  };
  const SMOKE_IMG = { src: "assets/vent/smoke-airflow.jpg", alt: "Smoke released to show airflow", credit: "Photo: NIOSH, public domain", page: "https://commons.wikimedia.org/wiki/File:Smoke_generator_to_visualize_airflow.jpg" };
  const TYPE_SVG = {
    grid: '<rect x="8" y="8" width="48" height="48" rx="3"/><rect x="14" y="14" width="36" height="22"/><path d="M14 26h36M20 42h24"/>',
    face: '<path d="M10 54V18l22-10 22 10v36"/><path d="M18 54V28h28v26M24 36h16"/>',
    capture: '<path d="M10 10h14v10M24 20l14 14M38 34l6 6"/><path d="M40 36l12 0 4 10H36z"/><path d="M14 56h40"/>',
    other: '<rect x="8" y="30" width="48" height="8" rx="2"/><path d="M12 38v16M52 38v16M16 30v-6h32v6M20 34h24"/>',
    visual: '<circle cx="32" cy="32" r="10"/><path d="M6 32c8-12 16-18 26-18s18 6 26 18c-8 12-16 18-26 18S14 44 6 32z"/>'
  };
  function typeSvg(k) { return `<svg class="vt-thumb" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TYPE_SVG[k] || TYPE_SVG.visual}</svg>`; }
  function imgWithFallback(im, k, cls) {
    if (!im) return typeSvg(k);
    return `<span class="vt-tw"><img class="${cls || "vt-thumb"}" src="${im.src}" alt="${esc(im.alt)}" loading="lazy" onerror="this.style.display='none';var n=this.nextElementSibling;if(n)n.style.display='block'"><span style="display:none">${typeSvg(k)}</span></span>`;
  }
  const FC_TYPES = ["Bench-type fume cupboard", "Walk-in fume cupboard", "Downdraught fume cupboard", "Variable air volume fume cupboard"];
  const HOODS = ["Booth", "Canopy hood", "Downdraft table", "Fume cupboard", "Slot / lip extraction", "Captor hood", "Enclosure", "On-tool extraction", "Extraction hood", "Local exhaust ventilation"];

  const isVentEvent = ev => !!ev && (ev.podioEventKind === "vent" || ev.type === "vent");
  const isVent = t => !!t && t.trainKind === "vent";
  const evOf = t => (t && C().eventById ? C().eventById(t.eventId) : null);
  const view = () => (C().view ? C().view() : (g.view || {}));
  const curEvent = () => { try { return C().eventById(view().eventId); } catch (e) { return null; } };
  const curVent = () => { const v = view(); if (!v || v.page !== "vent") return null; return (C().db().trains || []).find(x => x.id === v.trainId) || null; };

  /* ---------- the record ---------- */
  let pendingType = "";
  function vt(t, create) {
    if (!t.vent && create) t.vent = { v: 1, type: pendingType || "face", unit: "", hood: "", condition: "", location: "", distanceCm: "", readings: ["", "", ""], below05: "", comments: "", photos: [] };
    const x = t.vent || {};
    if (create) { if (!Array.isArray(x.readings)) x.readings = []; if (!Array.isArray(x.photos)) x.photos = []; }
    if (create && x.type === "grid" && !x.grid) x.grid = { basis: "standard", widthMm: "", heightMm: "", cols: 0, rows: 0, gapX: 0, gapY: 0, reason: "", v: {}, d: {}, label: {} };
    if (x.grid) { ["v", "d", "label", "lo", "hi"].forEach(k => { if (!x.grid[k] || typeof x.grid[k] !== "object") x.grid[k] = {}; }); }
    if (create && x.grid && !x.grid.scheme) {
      /* AS/NZS 2243.8 Figure A1 note 4: points A, B, C... from top left, across rows. Older grids were numbered 1, 2, 3...
         down each column. Nothing is moved or deleted: the readings stay on the same physical point; the old number is kept
         alongside the new letter (prevNumbering) so earlier sheets still match. */
      const had = gridHasData(x.grid);
      x.grid.scheme = "as2243.8-A1";
      if (had) { x.grid.prevNumbering = "down-columns"; note(t, "Grid point labels", "now A, B, C… across rows per AS/NZS 2243.8 Figure A1 note 4; previous numbers (down each column) kept beside each letter; no readings moved"); }
    }
    if (create && x.type === "grid" && !x.smoke) x.smoke = {};
    if (create && x.type === "grid") { if (!Array.isArray(x.equipPhotos)) x.equipPhotos = []; if (!x.smokePhotos || typeof x.smokePhotos !== "object") x.smokePhotos = {}; }
    return x;
  }
  const numOf = s => { const v = String(s == null ? "" : s).trim().replace(",", "."); if (v === "" || !/^-?\d*\.?\d+$/.test(v)) return null; const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
  /* ---------- face velocity grid (AS/NZS 2243.8:2014 Appendix B, B4.2(c)) ----------
     "Measure the air velocity perpendicular to the plane of the sash at positions 100 mm in from the edges of the sash opening,
      and then equally spaced, not more than 250 mm apart vertically, nor more than 500 mm apart horizontally."
     Fewest lines that meet that: n = ceil((size - 200) / maxGap) + 1 (a single centre line when the opening is 200 mm or less).
     Points are numbered down each column, then across (as on the 0019340 field sheet: 1 = top left corner). */
  const STD = { edge: 100, maxX: 500, maxY: 250, ref: "AS/NZS 2243.8:2014 Appendix B, B4.2(c)", pass: "AS/NZS 2243.8:2014 cl. 3.1.2" };
  const MANUAL_DEFAULT = { cols: 4, rows: 7 };
  function linesFor(size, maxGap) {
    const span = size - 2 * STD.edge;
    if (!(span > 0)) return { n: 1, gap: 0 };
    const n = Math.ceil(span / maxGap - 1e-9) + 1;
    return { n, gap: span / (n - 1) };
  }
  function gridFor(widthMm, heightMm) {
    const W = numOf(widthMm), H = numOf(heightMm);
    if (W == null || H == null || W <= 0 || H <= 0 || W > 50000 || H > 50000) return null;
    const c = linesFor(W, STD.maxX), r = linesFor(H, STD.maxY);
    return { cols: c.n, rows: r.n, gapX: Math.round(c.gap), gapY: Math.round(r.gap), points: c.n * r.n };
  }
  const ptKey = i => "point " + (i + 1);
  const ptDKey = i => "point " + (i + 1) + " below 0.5";
  const ptLKey = i => "point " + (i + 1) + " label";
  /* AS/NZS 2243.8 Figure A1 note 4 / Figure B1: label points A, B, C... starting top left and working across rows.
     Storage keys stay "point N" in the original down-the-column order, so no existing reading ever moves. */
  function letters(n) { let s = ""; n = n + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  const ordOf = (i, cols, rows) => (i % rows) * cols + Math.floor(i / rows);
  const idxOf = (o, cols, rows) => (o % cols) * rows + Math.floor(o / cols);
  function defaultLabel(i, cols, rows) { return letters(ordOf(i, cols, rows)); }
  function gridHasData(q) { return !!q && ["v", "d", "label", "lo", "hi"].some(k => q[k] && Object.keys(q[k]).some(j => str(q[k][j]).trim() !== "")); }
  function gridOf(t) { const x = (t && t.vent) || {}; return x.type === "grid" && x.grid ? x.grid : null; }
  const gridN = q => (q && q.cols > 0 && q.rows > 0 ? q.cols * q.rows : 0);
  const pointId = (q, i) => defaultLabel(i, q.cols, q.rows);
  const customLabel = (q, i) => str(q.label[ptLKey(i)]).trim();
  const legacyNo = (q, i) => (q.prevNumbering === "down-columns" || (!q.scheme && gridHasData(q)) ? i + 1 : null);
  function pointLabel(q, i) { const c = customLabel(q, i); return pointId(q, i) + (c ? " - " + c : ""); }
  const ptLoKey = i => "point " + (i + 1) + " min";
  const ptHiKey = i => "point " + (i + 1) + " max";
  /* calibration correction (Figure A1 "Calibration correction factor: … m/s at … m/s"; notes 3: reported figures include it).
     Applied to the face velocity audit only, as an offset added to each raw reading: corrected = reading + correction. */
  /* John 28 Nov 2026 (t750u, t751u): anemometers are hired (Airmet); last calibration, due date, correction and a certificate photo.
     Warnings only, never a block. B3: calibration certificate issued within the past 12 months. */
  function calWarnings(ev) {
    const e = (ev && ev.ventEquip) || {}, w = [];
    const day = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(d).trim()); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; };
    const survey = day(ev && ev.date) != null ? day(ev.date) : day(new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10));
    const last = day(e.calDate), due = day(e.calDue);
    if (!str(e.calDate).trim()) w.push("Last calibration date missing");
    else if (last == null) w.push("Last calibration date is not a date (use YYYY-MM-DD)");
    if (!str(e.calDue).trim()) w.push("Calibration due date missing");
    else if (due == null) w.push("Calibration due date is not a date (use YYYY-MM-DD)");
    else if (survey != null && due < survey) w.push("Calibration was due " + e.calDue + ", before the survey date (" + (ev && ev.date || "today") + ")");
    if (last != null && survey != null && survey - last > 365 * 864e5) w.push("Last calibration is more than 12 months before the survey (AS/NZS 2243.8 B3)");
    if (!str(e.calCorr).trim()) w.push("Calibration correction factor missing (readings are reported uncorrected)");
    else if (calNum(e.calCorr) == null) w.push("Calibration correction factor is not a number (e.g. +0.02, -0.01 or 0); readings are reported uncorrected");
    if (!((e.certPhotos || []).length)) w.push("Take a photo of the calibration certificate");
    return w;
  }
  function calSummary(ev) {
    const e = (ev && ev.ventEquip) || {};
    const own = e.ownership === "hired" ? "Hired" + (str(e.supplier).trim() ? " from " + str(e.supplier).trim() : "") : e.ownership === "owned" ? "Owned" : "";
    const bits = [[e.make, e.model].filter(Boolean).join(" "), str(e.serial).trim() ? "SN " + str(e.serial).trim() : "", own,
      str(e.calDate).trim() ? "calibrated " + str(e.calDate).trim() : "", str(e.calDue).trim() ? "due " + str(e.calDue).trim() : "",
      str(e.calCorr).trim() ? "correction " + str(e.calCorr).trim() + " m/s" + (str(e.calAt).trim() ? " at " + str(e.calAt).trim() + " m/s" : "") : "",
      (e.certPhotos || []).length ? "certificate photo" : ""].filter(Boolean);
    const w = calWarnings(ev);
    return { text: bits.join(" · "), status: w.length ? "Check: " + w.join("; ") : "OK", warnings: w };
  }
  function calNum(v) { return numOf(str(v).trim().replace(/^\+\s*/, "").replace(/\s*m\/s$/i, "")); }
  function calOf(t) { const ev = evOf(t) || {}, e = ev.ventEquip || {}; const k = calNum(e.calCorr); return { k: k == null ? 0 : k, set: k != null, at: str(e.calAt).trim(), raw: str(e.calCorr).trim(), date: str(e.calDate).trim() }; }
  const r2 = n => Math.round(n * 100) / 100;
  function corrected(q, i, k) { const n = numOf(q.v[ptKey(i)]); return n == null ? null : r2(n + (k || 0)); }
  function gridVals(q, k) { const out = []; for (let i = 0; i < gridN(q); i++) { const n = corrected(q, i, k); if (n != null) out.push(n); } return out; }
  /* AS/NZS 2243.8 cl. 3.1.2: average not less than 0.5 m/s, individual measurements not less than 0.3 m/s (indicator only) */
  function stdCheck(t) {
    const s = stats(t); if (!s.n) return null;
    const low = gridOf(t) ? gridVals(gridOf(t), calOf(t).k).filter(n => n < 0.3).length : 0;
    return { ok: s.avg >= 0.5 && s.min >= 0.3, avgOk: s.avg >= 0.5, minOk: s.min >= 0.3, low, s };
  }
  function below05Range(t) {
    const q = gridOf(t), x = t.vent || {};
    if (!q) return str(x.below05).trim();
    const raw = q ? Array.from({ length: gridN(q) }, (_, i) => str(q.d[ptDKey(i)]).trim()).filter(Boolean) : (str(x.below05).trim() ? [str(x.below05).trim()] : []);
    if (!raw.length) return "";
    const nums = [], odd = [];
    raw.forEach(r => { const m = /(\d+(?:[.,]\d+)?)/.exec(r); if (!m) { odd.push(r); return; } let n = parseFloat(m[1].replace(",", ".")); if (/mm/i.test(r)) n /= 1000; else if (/cm/i.test(r)) n /= 100; nums.push(n); });
    let out = "";
    if (nums.length) { const lo = Math.min.apply(null, nums), hi = Math.max.apply(null, nums); const fm = n => String(Math.round(n * 100) / 100); out = lo === hi ? "~" + fm(lo) + " m" : "~" + fm(lo) + " to " + fm(hi) + " m"; }
    if (odd.length) out = [out].concat(odd).filter(Boolean).join("; ");
    return out;
  }
  /* ---------- smoke test (AS/NZS 2243.8:2014 Appendix A) ---------- */
  const SMOKE = [
    { k: "b", q: "With the sash at its maximum working opening, does smoke released around the whole face perimeter flow smoothly into the cupboard without escaping?", step: "A4.2(b)", name: "Face opening airflow pattern", how: "Sash at the maximum working aperture (A4.2(a)). Release smoke in line with the face opening around the whole perimeter of the entry. It should flow smoothly in and through; looping or eddying points to room turbulence or a containment problem." },
    { k: "c", q: "Inside the cupboard, around any equipment, tanks, sinks or sump, does the smoke move to the exhaust without being carried forward or out?", step: "A4.2(c)", name: "Cupboard airflow pattern", how: "Release smoke around any equipment, tanks or sinks inside. Watch for eddies carrying smoke to the front or out. If a removable base sits over a sump, check there is no reverse flow out of the sump and that the sump is exhausted." },
    { k: "d", q: "When smoke is released along the floor of the cupboard, front to back, does it stay inside without eddies carrying it forward or out?", step: "A4.2(d)", name: "Containment along bottom of cupboard", how: "Release smoke progressively along the floor, starting at the front. Watch the sides of the base for eddies carrying smoke forward or out; if found, move the smoke source around to investigate." },
    { k: "e", q: "When smoke is released along the inside walls, does it stay inside without eddies carrying it forward or out?", step: "A4.2(e)", name: "Containment along walls of cupboard", how: "Release smoke along the internal walls. Watch for eddies carrying smoke to the front or out." },
    { k: "f", q: "With the sash fully open, does smoke released just behind the sash at several points across the opening stay inside, with no eddies at the sash or handles?", step: "A4.2(f)", name: "Containment with sash fully open", how: "Release smoke behind and close to the sash at several points across the opening. Watch for eddies forming in line with or in front of the sash or its handles, fed from inside." },
    { k: "h", q: "With the sash lowered to half open, does smoke released just behind the sash across the opening stay inside?", step: "A4.2(g)–(h)", name: "Containment with sash half open", how: "Lower the sash to halfway (g), then release smoke behind and close to the sash at several points across the opening (h)." },
    { k: "i", q: "With the sash at its minimum opening, does the smoke stay inside without eddies?", step: "A4.2(i)", name: "Containment with sash at minimum opening", how: "Move the sash to its minimum opening and watch for eddies." },
    { k: "j", q: "With nearby cupboards running, doors and windows opening, air-conditioning and people moving past, does the cupboard still hold the smoke?", step: "A4.2(j)", name: "Containment under abnormal conditions", how: "Spot-check nearby fume cupboards, doors and windows opening, air-conditioning, ventilation, traffic and other equipment. If any affect containment, repeat steps (d) to (k) under those conditions and record them. Record any equipment inside on a plan or photo." },
    { k: "k", q: "If the cupboard is built into the wall, does smoke along joints, service penetrations and around the sash show no air jets leaking in from the wall cavity or ceiling space?", step: "A4.2(k)", name: "Leaks at joints and service penetrations (built-in cupboards)", how: "Only if the cupboard is built into the laboratory walls: release smoke along all joints and service penetrations, around the sash and the opening, looking for air jets leaking in from the wall cavity or ceiling space. Otherwise mark N/A.", na: true }
  ];
  const RATE = { G: "Good", S: "Satisfactory", D: "Dangerous", NA: "N/A" };
  const RATE_HOW = { G: "smoke goes straight to the exhaust, no reverse flow or eddies", S: "some eddies or reverse flow, but the smoke stays inside the cupboard", D: "smoke escapes the cupboard (the unit fails)", NA: "this position doesn't apply to this unit (give a reason)" };
  /* "Help me decide" (John, call 28 Nov 2026): A5 defines G / S / D by what the smoke does, so rows are observations and the cell picks the rating */
  const OBS = [["G", "Smoke goes straight to the exhaust"], ["S", "Eddies or reverse flow, but the smoke stays inside"], ["D", "Smoke escapes past the sash or face"], ["NA", "This position isn't on this unit"]];
  const helpOpen = new Set();
  const smokeCK = row => row.name + " comment";
  /* A4.2(l) record: the general observations plus each position's note */
  function smokeObs(t) { const x = t.vent || {}, sm = smokeOf(t); return [str(x.smokeComments).trim()].concat(sm.rows.filter(z => z.c).map(z => z.row.name + ": " + z.c)).filter(Boolean).join("; "); }
  function smokeOf(t) {
    const x = t.vent || {}, sm = x.smoke || {};
    const rows = SMOKE.map(row => ({ row, r: str(sm[row.name]).trim(), c: str(sm[smokeCK(row)]).trim(), photos: ((x.smokePhotos || {})[row.name] || []) }));
    const rated = rows.filter(z => z.r && z.r !== "NA");
    const order = { G: 0, S: 1, D: 2 };
    const worst = rated.length ? rated.reduce((a, z) => (order[z.r] > order[a] ? z.r : a), "G") : "";
    const unrated = rows.filter(z => !z.r);
    const naNoReason = rows.filter(z => z.r === "NA" && !z.c);   /* John 28 Nov 2026: N/A always needs a reason */
    const done = !unrated.length && !naNoReason.length && rated.length > 0;
    return { rows, worst, unrated, naNoReason, done, compliant: done ? worst !== "D" : null, dangerous: worst === "D" };
  }
  /* Figure A1 "Max. variation of readings from average: %" and cl. 3.1.2 note 3 (investigate points more than 20% from the average) */
  function variation(t) {
    const q = gridOf(t); const s = stats(t); if (!q || !s.n || !s.avg) return { pct: null, over: [] };
    const k = calOf(t).k; let pct = 0; const over = [];
    for (let i = 0; i < gridN(q); i++) { const v = corrected(q, i, k); if (v == null) continue; const d = Math.abs(v - s.avg) / s.avg * 100; if (d > pct) pct = d; if (d > 20 + 1e-9) over.push(pointId(q, i)); }
    over.sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
    return { pct: Math.round(pct), over };
  }
  function unstable(t) {
    const q = gridOf(t); if (!q) return [];
    const out = [];
    for (let i = 0; i < gridN(q); i++) { const m = numOf(q.v[ptKey(i)]), lo = numOf(q.lo[ptLoKey(i)]), hi = numOf(q.hi[ptHiKey(i)]); if (m == null || !m || lo == null || hi == null) continue; if (hi > m * 1.2 + 1e-9 || lo < m * 0.8 - 1e-9) out.push(pointId(q, i)); }
    return out;
  }
  function fvResult(t) { const q = gridOf(t), c = stdCheck(t); if (!q || !gridN(q) || !c) return null; return c.ok; }
  function overall(t) {
    const sm = smokeOf(t), fv = fvResult(t);
    if (sm.dangerous || fv === false) return "Non-compliant";
    if (sm.done && fv === true && !missing(t).length) return "Compliant";
    return "Incomplete";
  }
  function geomText(q) {
    if (!gridN(q)) return "";
    const pts = q.cols + " × " + q.rows + " = " + gridN(q) + " points";
    if (q.basis === "manual") return pts;
    return pts + " · horizontal spacing " + (q.cols > 1 ? q.gapX + " mm" : "single centre line") + " · vertical spacing " + (q.rows > 1 ? q.gapY + " mm" : "single centre line");
  }
  function stats(t) {
    const q0 = gridOf(t);
    const x = t.vent || {}; const vals = q0 ? gridVals(q0, calOf(t).k) : (x.readings || []).map(numOf).filter(n => n != null);
    if (!vals.length) return { n: 0, avg: null, min: null, max: null };
    const sum = vals.reduce((a, b) => a + b, 0);
    return { n: vals.length, avg: sum / vals.length, min: Math.min.apply(null, vals), max: Math.max.apply(null, vals) };
  }
  const f2 = n => (n == null ? "" : (Math.round(n * 100) / 100).toFixed(2));
  function missing(t) {
    const x = t.vent || {}, m = [];
    if (!str(x.unit).trim()) m.push("Extraction unit");
    const q = gridOf(t);
    if (q) { m.length = 0; return missingBy(t).map(z => z[1]); }
    if (!str(x.location).trim()) m.push("Measurement location");
    if (x.type === "visual") { if (!str(x.comments).trim()) m.push("Comments (what was seen)"); }
    else if (!stats(t).n) m.push("At least one velocity reading");
    return m;
  }
  /* what each step of the audit still needs: [step, text] */
  function missingBy(t) {
    const x = t.vent || {}, q = gridOf(t), m = [];
    if (!str(x.location).trim()) m.push([1, "Location"]);
    if (!str(x.unit).trim()) m.push([1, "F/C number / unit"]);
    if (!str(x.hood).trim()) m.push([1, "Type"]);
    if (!x.install) m.push([1, "New installation or existing"]);
    if (!x.empty) m.push([1, "Fume cupboard empty? (Yes / No)"]);
    else if (x.empty === "no" && !(x.equipPhotos || []).length && !str(x.equipNote).trim()) m.push([1, "Photo or plan of the equipment inside (A5)"]);
    if (!str(x.smokeSource).trim()) m.push([1, "Smoke source used"]);
    const sm = smokeOf(t);
    sm.unrated.forEach(z => m.push([2, "Smoke " + z.row.step + " " + z.row.name + ": G, S or D"]));
    sm.naNoReason.forEach(z => m.push([2, "Smoke " + z.row.step + " " + z.row.name + ": reason for N/A"]));
    if (q) {
      if (!gridN(q)) m.push([3, "Opening width and height (or a manual grid)"]);
      if (!stats(t).n) m.push([3, "Face velocity readings"]);
      /* anemometer details are warnings, not blocks (John t750u "Don't block for now") */
    }
    return m;
  }
  const complete = t => isVent(t) && !!t.vent && !missing(t).length;
  const started = t => { const x = t.vent || {}; return !!(str(x.unit).trim() || str(x.location).trim() || stats(t).n || str(x.comments).trim() || (x.photos || []).length || (x.smoke && Object.keys(x.smoke).length)); };
  function warnings(t) {
    const x = t.vent || {}, w = [];
    const q = gridOf(t);
    if (q) {
      const N = gridN(q); let blank = 0;
      for (let i = 0; i < N; i++) { const r = str(q.v[ptKey(i)]).trim(); if (r === "") { blank++; continue; } const n = numOf(r); if (n == null) w.push("Point " + pointId(q, i) + " is not a number"); else if (n < 0 || n > 50) w.push("Point " + pointId(q, i) + " (" + r + " m/s) looks wrong. Check it"); }
      if (N && blank && blank < N) w.push(blank + " of " + N + " points still blank");
      if (N > 150) w.push("Large grid (" + N + " points). Check the opening size");
      if (x.install === "new" && x.empty === "no") w.push("New installations are tested with the cupboard empty (A4.1.3 / B4.1.3)");
      if (x.fvEarly && !smokeOf(t).done) w.push("Face velocity recorded before the smoke test was finished (A4.1.1 / B4.1.1: smoke test first)");
      const va = variation(t); if (va.over.length) w.push("Point" + (va.over.length === 1 ? " " : "s ") + va.over.join(", ") + " more than 20% from the average: investigate (cl. 3.1.2 note 3)");
      const us = unstable(t); if (us.length) w.push("Readings cycled over ±20% at " + us.join(", ") + ": record the instability in Comments (B4.2(e), B5)");
      calWarnings(evOf(t)).forEach(z => w.push("Anemometer: " + z));
      return w;
    }
    (x.readings || []).forEach((r, i) => { if (str(r).trim() === "") return; const n = numOf(r); if (n == null) w.push("Reading " + (i + 1) + " is not a number"); else if (n < 0 || n > 50) w.push("Reading " + (i + 1) + " (" + r + " m/s) looks wrong. Check it"); });
    if (str(x.distanceCm).trim() && numOf(x.distanceCm) == null) w.push("Distance from face is not a number");
    return w;
  }
  /* keep status, location and comments in step so the core screens, filters and exports read a vent measurement correctly */
  function sync(t) {
    const x = t.vent || {};
    const st = complete(t) ? "ended" : "prepped";
    if (t.status !== st && (t.status === "prepped" || t.status === "ended" || !t.status)) t.status = st;
    if (t.location !== str(x.location)) t.location = str(x.location);
    if (t.comments !== str(x.comments)) t.comments = str(x.comments);
  }
  function note(t, action, detail) { try { if (C().audit) C().audit(t, action, detail); else (t.audit = t.audit || []).push({ at: new Date().toISOString(), action, detail }); } catch (e) {} }
  function evNote(ev, action, detail) { try { if (typeof g.v42EvLog === "function") g.v42EvLog(ev, action, detail, "vent"); } catch (e) {} }
  const save = () => { try { C().saveQuiet(); } catch (e) { console.warn("vent.js save", e); } };

  /* ---------- labels ---------- */
  const dn = t => "Measurement " + (Number(t.sampleNo || t.pouch) || "");
  function titleOf(t) { const x = t.vent || {}; const bits = [dn(t), typeName(x.type), str(x.unit).trim() || "—"]; if (gridOf(t) && str(x.condition).trim()) bits.push(str(x.condition).trim()); return bits.join(" · "); }
  function summaryOf(t) {
    const x = t.vent || {}, s = stats(t), q = gridOf(t);
    if (q) {
      const sm = smokeOf(t);
      const b = [sm.done ? "smoke " + RATE[sm.worst] : "smoke test " + (sm.rows.some(z => z.r) ? "in progress" : "not started")];
      b.push(gridN(q) ? q.cols + " × " + q.rows + " grid" + (q.basis === "manual" ? " (manual)" : " (" + str(q.widthMm) + " × " + str(q.heightMm) + " mm)") : "grid not set");
      if (s.n) { b.push(s.n + " of " + gridN(q) + " points", "avg " + f2(s.avg) + " m/s (" + f2(s.min) + "–" + f2(s.max) + ")"); const c = stdCheck(t); b.push(c.ok ? "meets 2243.8" : "below 2243.8"); }
      else b.push("no readings yet");
      b.push(overall(t));
      if ((x.photos || []).length) b.push(x.photos.length + " photo" + (x.photos.length === 1 ? "" : "s"));
      return b.join(" · ");
    }
    const bits = [str(x.location).trim() || "—"];
    if (str(x.distanceCm).trim()) bits.push(x.distanceCm + " cm");
    if (x.type === "visual") bits.push("visual check");
    else if (s.n) bits.push(s.n + " reading" + (s.n === 1 ? "" : "s"), "avg " + f2(s.avg) + " m/s (" + f2(s.min) + "–" + f2(s.max) + ")");
    else bits.push("no readings yet");
    if ((x.photos || []).length) bits.push(x.photos.length + " photo" + (x.photos.length === 1 ? "" : "s"));
    return bits.join(" · ");
  }

  /* ---------- Add measurement ---------- */
  function pickHtml() {
    const ev = curEvent(), id = view().eventId;
    return `<div class="wrap">
    <button class="btn ghost" onclick="openEvent('${esc(id)}')">← ${ev ? esc(ev.code) : "Event"}</button>
    <h2 class="brand-type" style="color:var(--navy)">Add measurement</h2>
    ${TYPES.filter(a => PICK.includes(a[0])).sort((a, b) => PICK.indexOf(a[0]) - PICK.indexOf(b[0])).map(([k, name, blurb]) => `<div class="card vt-type-img" style="cursor:pointer" data-vt-add="${k}" onclick="ENVSS_VENT.addMeasurement('${esc(id)}','${k}')">
      ${imgWithFallback(TYPE_IMG[k], k)}<div><strong>Vent · ${esc(name)}</strong><div class="muted">${esc(blurb)}</div>${TYPE_IMG[k] ? `<div class="vt-credit">${esc(TYPE_IMG[k].credit)}</div>` : ""}</div></div>`).join("")}
    <p class="help">Photo credits and licences: assets/vent/ATTRIBUTION.md. The pictures are examples only.</p>
  </div>`;
  }
  function addMeasurement(eventId, type, copyFrom) {
    const c = C(); const before = new Set((c.db().trains || []).map(x => x.id));
    pendingType = type || "grid";
    try { g.addTrain(eventId, "vent"); } finally { pendingType = ""; }
    const t = (c.db().trains || []).find(x => !before.has(x.id) && x.eventId === eventId);
    if (!t) return null;   // the person said no to the confirmation
    const x = vt(t, true); x.type = type || x.type || "grid"; vt(t, true);
    /* airborne defaults the shared add code fills in are not used on a vent measurement */
    delete t.rotameter; delete t.v44Equip; t.contaminantId = ""; t.mode = "static";
    if (copyFrom && copyFrom.vent && x.type === "grid") {
      /* another condition on the same unit: same unit, hood and opening; a new condition and an empty grid */
      ["unit", "hood", "hoodMake", "hoodModel", "hoodSerial", "location", "install", "empty", "equipNote", "smokeSource", "testedBy"].forEach(k => { if (copyFrom.vent[k] != null) x[k] = str(copyFrom.vent[k]); });
      const q0 = copyFrom.vent.grid;
      if (q0) Object.assign(x.grid, { basis: q0.basis || "standard", widthMm: str(q0.widthMm), heightMm: str(q0.heightMm), cols: q0.cols || 0, rows: q0.rows || 0, gapX: q0.gapX || 0, gapY: q0.gapY || 0, reason: str(q0.reason) });
    } else if (copyFrom && copyFrom.vent) { ["unit", "hood", "condition"].forEach(k => { x[k] = str(copyFrom.vent[k]); }); }
    if (x.type === "grid") {
      if (!str(x.smokeSource).trim()) x.smokeSource = "Air current tubes";
      if (!str(x.testedBy).trim()) { try { const o = typeof g.getOperator === "function" ? g.getOperator() : null; if (o && o.name) x.testedBy = o.name; } catch (e) {} }
    }
    note(t, "Vent measurement added", typeName(x.type) + (copyFrom ? " · same unit as " + dn(copyFrom) : ""));
    sync(t); save(); openVent(t.id);
    return t;
  }
  function openVent(id) { const v = view(); const t = (C().db().trains || []).find(x => x.id === id); v.page = "vent"; v.trainId = id; if (t) v.eventId = t.eventId; if (t) { vt(t, true); } C().render(); try { g.scrollTo(0, 0); } catch (e) {} }

  /* ---------- the measurement screen ---------- */
  function usedUnits(t) {
    const out = new Map();
    (C().trainsOf(t.eventId) || []).forEach(x => { if (!isVent(x) || x === t || !x.vent) return; const u = str(x.vent.unit).trim(); if (u && !out.has(u.toLowerCase())) out.set(u.toLowerCase(), x); });
    return [...out.values()];
  }
  function lastFor(t, unit) { const u = str(unit).trim().toLowerCase(); if (!u) return null; const l = (C().trainsOf(t.eventId) || []).filter(x => isVent(x) && x !== t && x.vent && str(x.vent.unit).trim().toLowerCase() === u); return l[l.length - 1] || null; }
  function field(key, label, value, ph, extra) { return `<label for="vt-${key}">${label}</label><input id="vt-${key}" data-vt="${key}" value="${esc(value)}" placeholder="${esc(ph || "")}" autocomplete="off" ${extra || ""}>`; }
  function statsHtml(t) {
    const s = stats(t);
    return s.n ? `<div class="vt-stats" id="vtStats"><div><span>Readings</span><b>${s.n}</b></div><div><span>Average</span><b>${f2(s.avg)}</b></div><div><span>Lowest</span><b>${f2(s.min)}</b></div><div><span>Highest</span><b>${f2(s.max)}</b></div><div class="vt-unit">m/s</div></div>`
      : `<div class="vt-stats vt-empty" id="vtStats">Average, lowest and highest are worked out as you enter readings.</div>`;
  }
  function checksHtml(t) {
    const m = missing(t), w = warnings(t);
    if (!m.length && !w.length) return `<div class="vt-checks vt-ok" id="vtChecks">✓ Measurement complete</div>`;
    return `<div class="vt-checks" id="vtChecks">${m.length ? `<div class="vt-miss">Still needed: ${m.map(esc).join(", ")}</div>` : ""}${w.map(x => `<div class="vt-warn">⚠ ${esc(x)}</div>`).join("")}</div>`;
  }
  function readingsHtml(t) {
    const x = t.vent;
    return x.readings.map((r, i) => `<div class="vt-read"><span class="vt-n">${i + 1}</span><input data-vt-r="${i}" id="vt-r${i}" value="${esc(r)}" inputmode="decimal" placeholder="m/s" autocomplete="off" aria-label="Reading ${i + 1} (m/s)"></div>`).join("");
  }
  function photosHtml(t) {
    const ph = C().photos, list = t.vent.photos || [];
    return `<div class="vt-photos">${list.map((ref, i) => `<div class="vt-photo">${ph && ph.imgTag ? ph.imgTag(ref, "Vent photo " + (i + 1)) : ""}<button type="button" class="btn ghost" data-vt-delphoto="${i}">Remove</button></div>`).join("")}</div>
      <label class="btn mid vt-take">Add photo<input type="file" accept="image/*" capture="environment" data-vt-take="1" hidden></label>`;
  }
  function pageHtml(t) {
    const ev = evOf(t), x = vt(t, true), eq = (ev && ev.ventEquip) || {};
    const units = usedUnits(t);
    if (gridOf(t)) return gridPageHtml(t);
    const typeOpts = TYPES.filter(a => PICK.includes(a[0]) || a[0] === x.type).map(([k, n]) => `<option value="${k}" ${k === x.type ? "selected" : ""}>${esc(n)}</option>`).join("");
    const visual = x.type === "visual";
    return `<div class="wrap vt-page" id="vtPage" data-vt-id="${esc(t.id)}">
      <button class="btn ghost" onclick="openEvent('${esc(t.eventId)}')">← Event ${ev ? esc(ev.code) : ""}</button>
      <div class="row" style="margin-top:10px;align-items:center;gap:10px"><h2 class="brand-type" style="margin:0;color:var(--navy)">${esc(dn(t))}</h2><span id="vtBadge">${badgeHtml(t)}</span></div>
      <p class="muted">${esc(typeName(x.type))}${eq.serial || eq.model ? " · anemometer " + esc([eq.make, eq.model].filter(Boolean).join(" ")) + (eq.serial ? " SN " + esc(eq.serial) : "") : ` · <span class="vt-warn">no anemometer on the event yet</span>`}</p>
      ${checksHtml(t)}
      <div class="card vt-card"><h3 class="vt-h">Extraction unit</h3>
        <label for="vt-type">Measurement type</label><select id="vt-type" data-vt="type">${typeOpts}</select>
        <label for="vt-unit">Extraction unit / equipment</label>
        <input id="vt-unit" data-vt="unit" value="${esc(x.unit)}" placeholder="e.g. Spray booth 1, southern end" autocomplete="off" list="vtUnits">
        <datalist id="vtUnits">${units.map(u => `<option value="${esc(u.vent.unit)}"></option>`).join("")}</datalist>
        ${units.length ? `<p class="help">Units already on this event: ${units.map(u => `<button type="button" class="chip" data-vt-unit="${esc(u.id)}">${esc(u.vent.unit)}</button>`).join(" ")}</p>` : ""}
        <label for="vt-hood">LEV / hood type <span class="muted">(optional)</span></label>
        <input id="vt-hood" data-vt="hood" value="${esc(x.hood)}" placeholder="e.g. Downdraft table" autocomplete="off" list="vtHoods">
        <datalist id="vtHoods">${HOODS.map(h => `<option value="${esc(h)}"></option>`).join("")}</datalist>
        ${field("condition", "Operating condition", x.condition, "e.g. 2 of 4 fans running, sash at 500 mm")}
      </div>
      <div class="card vt-card"><h3 class="vt-h">Location</h3>
        ${field("location", "Measurement location", x.location, "e.g. Across the sash opening, at the work position")}
        <div class="vt-grid2"><div>${field("distanceCm", "Distance from face (cm)", x.distanceCm, "e.g. 35", 'inputmode="decimal"')}</div>
        <div>${field("below05", "Distance where velocity &lt; 0.5 m/s <span class=\"muted\">(optional)</span>", x.below05, "e.g. ~1 m")}</div></div>
      </div>
      <div class="card vt-card" ${visual ? 'data-vt-visual="1"' : ""}><h3 class="vt-h">Velocity readings (m/s)</h3>
        ${visual ? `<p class="help">Visual check: no readings needed. Say what was seen in Comments.</p>` : ""}
        <div class="vt-reads" id="vtReads">${readingsHtml(t)}</div>
        <button type="button" class="btn ghost" id="vtAddRead" data-vt-addread="1">+ Add reading</button>
        <p class="help">Numbered in the order taken, e.g. top left to bottom right. Blank boxes are ignored.</p>
        ${statsHtml(t)}
      </div>
      <div class="card vt-card"><h3 class="vt-h">Comments and photos</h3>
        <label for="vt-comments">Comments</label><textarea id="vt-comments" data-vt="comments" rows="3" placeholder="Observations, obstructions, how readings were taken">${esc(x.comments)}</textarea>
        ${photosHtml(t)}
      </div>
      <div class="row vt-actions" style="gap:10px;flex-wrap:wrap;margin-top:12px">
        <button type="button" class="btn mid" data-vt-again="1">+ Another location on this unit</button>
        <button type="button" class="btn ghost" onclick="openEvent('${esc(t.eventId)}')">Done</button>
        ${typeof g.isAdmin === "function" && g.isAdmin() ? `<button type="button" class="btn ghost vt-del" data-vt-delete="1">Delete measurement</button>` : ""}
      </div>
      ${auditHtml(t)}
      <p class="help">ENVSS Field v${esc(C().appVersion || "")} · vent.js ${VENT_VERSION}</p>
    </div>`;
  }

  /* ---------- face velocity grid screen ---------- */
  const FANS = ["One extraction fan in operation", "Two extraction fans in operation", "Three extraction fans in operation", "Four extraction fans in operation"];
  const band = n => (n == null ? "" : n < 0.3 ? "vg-low" : n < 0.5 ? "vg-mid" : "vg-ok");
  function geomHtml(t) {
    const q = gridOf(t), N = gridN(q);
    const manual = q.basis === "manual";
    const info = N ? `<b>${esc(geomText(q))}</b>` : `<span class="vt-warn">Enter the opening width and height to set out the grid${manual ? "" : ", or use a manual grid"}.</span>`;
    return `<div id="vgGeom" class="vg-geom">${info}${!manual && N ? `<div class="muted">First and last lines ${STD.edge} mm in from each edge of the ${esc(q.widthMm)} × ${esc(q.heightMm)} mm opening.</div>` : ""}</div>`;
  }
  function stdHtml(t) {
    const c = stdCheck(t);
    if (!c) return `<div class="vg-std" id="vgCheck"><span class="muted">${STD.pass} check (average ≥ 0.5 m/s, no point &lt; 0.3 m/s) shows once readings are in. Indicator only.</span></div>`;
    const parts = [`average ${f2(c.s.avg)} m/s ${c.avgOk ? "≥" : "&lt;"} 0.5`, c.minOk ? "no point below 0.3 m/s" : `${c.low} point${c.low === 1 ? "" : "s"} below 0.3 m/s (lowest ${f2(c.s.min)})`];
    return `<div class="vg-std ${c.ok ? "vg-pass" : "vg-fail"}" id="vgCheck"><b>${c.ok ? "✓ Meets" : "✗ Does not meet"} ${STD.pass}</b> · ${parts.join(" · ")}<div class="muted">Indicator only: it never blocks saving or completing.</div></div>`;
  }
  function gridStatsHtml(t) {
    const q = gridOf(t), s = stats(t), N = gridN(q);
    return s.n ? `<div class="vt-stats" id="vtStats"><div><span>Points</span><b>${s.n}<small> / ${N}</small></b></div><div><span>Average</span><b>${f2(s.avg)}</b></div><div><span>Lowest</span><b>${f2(s.min)}</b></div><div><span>Highest</span><b>${f2(s.max)}</b></div><div class="vt-unit">m/s</div></div>`
      : `<div class="vt-stats vt-empty" id="vtStats">n, average, lowest and highest are worked out across the grid as you enter velocities.</div>`;
  }
  function cellsHtml(t) {
    const q = gridOf(t), N = gridN(q), k = calOf(t).k;
    if (!N) return `<div id="vgCells"></div>`;
    let h = `<div class="vg-scroll" id="vgCells"><div class="vg-grid" style="grid-template-columns:repeat(${q.cols},minmax(84px,1fr))">`;
    for (let r = 0; r < q.rows; r++) for (let c = 0; c < q.cols; c++) {
      const i = c * q.rows + r, v = str(q.v[ptKey(i)]), id = pointId(q, i), cl = customLabel(q, i), was = legacyNo(q, i), cv = corrected(q, i, k);
      h += `<div class="vg-cell ${band(cv)}" data-vg-cell="${i}" title="${esc(pointLabel(q, i))}"><div class="vg-num">${cellHead(q, i)}</div>
        <input id="vg-v${i}" data-vg-v="${i}" value="${esc(v)}" inputmode="decimal" placeholder="m/s" autocomplete="off" aria-label="Point ${esc(id)}${cl ? " " + esc(cl) : ""} velocity (m/s)">
        <div class="vg-cor" data-vg-cor="${i}">${cv != null && k ? "→ " + f2(cv) : ""}</div>
        <input id="vg-d${i}" class="vg-d" data-vg-d="${i}" value="${esc(q.d[ptDKey(i)])}" placeholder="&lt;0.5 (m)" autocomplete="off" aria-label="Point ${esc(id)} distance where velocity drops below 0.5 m/s (m)"></div>`;
      void was;
    }
    h += `</div></div>`;
    return h;
  }
  function cellHead(q, i) { const cl = customLabel(q, i), was = legacyNo(q, i); return `<b>${esc(pointId(q, i))}</b>${cl ? ` <span>${esc(cl)}</span>` : ""}${was ? ` <span class="vg-was">was ${was}</span>` : ""}`; }
  function labelsHtml(t) {
    const q = gridOf(t), N = gridN(q); if (!N) return "";
    const ords = Array.from({ length: N }, (_, o) => idxOf(o, q.cols, q.rows));
    let h = `<details class="vg-labels"><summary>Point notes (optional)</summary><p class="help">Points are A, B, C… from top left, across each row (Figure A1 note 4). Add a note to a point if useful, e.g. "behind sash stop".</p><div class="vg-lablist">`;
    ords.forEach(i => { h += `<label class="vg-lab"><span>${esc(pointId(q, i))}</span><input id="vg-l${i}" data-vg-l="${i}" value="${esc(q.label[ptLKey(i)])}" placeholder="Note for ${esc(pointId(q, i))}" autocomplete="off"></label>`; });
    h += `</div></details><details class="vg-labels" id="vgRange"><summary>Fluctuation during each 15 s reading (optional)</summary><p class="help">B4.2(e): read each point for at least 15 s. If the reading cycles more than ±20% of its mean or fluctuates rapidly, record the lowest and highest seen; it is flagged for Comments.</p><div class="vg-lablist">`;
    ords.forEach(i => { h += `<div class="vg-lab vg-lohi"><span>${esc(pointId(q, i))}</span><input id="vg-lo${i}" data-vg-lo="${i}" value="${esc(q.lo[ptLoKey(i)])}" inputmode="decimal" placeholder="lowest" autocomplete="off" aria-label="Point ${esc(pointId(q, i))} lowest during reading"><input id="vg-hi${i}" data-vg-hi="${i}" value="${esc(q.hi[ptHiKey(i)])}" inputmode="decimal" placeholder="highest" autocomplete="off" aria-label="Point ${esc(pointId(q, i))} highest during reading"></div>`; });
    return h + `</div></details>`;
  }

  /* ---------- guided audit (AS/NZS 2243.8:2014): 1 unit, 2 smoke (App. A), 3 face velocity (App. B), 4 summary (Fig. A1) ---------- */
  const STEPS = [[1, "Unit"], [2, "Smoke test"], [3, "Face velocity"], [4, "Summary"]];
  const stepOf = new Map();
  function curStep(t) {
    if (stepOf.has(t.id)) return stepOf.get(t.id);
    const m = missingBy(t); const first = m.length ? Math.min.apply(null, m.map(z => z[0])) : 4;
    return Math.min(first, 4);
  }
  const stepDone = (t, n) => (n === 4 ? !missingBy(t).length : !missingBy(t).some(z => z[0] === n));
  function stepNavHtml(t, cur) {
    return `<nav class="va-steps" id="vaSteps">${STEPS.map(([n, name]) => `<button type="button" class="va-step ${n === cur ? "on" : ""} ${stepDone(t, n) ? "done" : ""}" data-vt-step="${n}" aria-current="${n === cur ? "step" : "false"}"><span>${stepDone(t, n) ? "✓" : n}</span>${esc(name)}</button>`).join("")}</nav>`;
  }
  function stepChecksHtml(t, n) {
    const m = missingBy(t).filter(z => n === 4 || z[0] === n).map(z => (n === 4 ? "Step " + z[0] + ": " : "") + z[1]);
    const w = n === 1 || n === 4 ? warnings(t).filter(x => n === 4 || /A4\.1\.3/.test(x)) : n === 3 ? warnings(t).filter(x => !/A4\.1\.3/.test(x)) : [];
    if (n === 3 && !warnings(t).some(x => /^Anemometer/.test(x))) { /* nothing extra */ }
    if (!m.length && !w.length) return `<div class="vt-checks vt-ok" id="vtChecks">✓ ${n === 4 ? "Audit complete" : "Step " + n + " complete"}</div>`;
    return `<div class="vt-checks" id="vtChecks">${m.length ? `<div class="vt-miss">Still needed: ${m.map(esc).join(", ")}</div>` : ""}${w.map(x => `<div class="vt-warn">⚠ ${esc(x)}</div>`).join("")}</div>`;
  }
  const cite = s => `<span class="va-cite">${esc(s)}</span>`;
  function choice(key, val, label, cur) { return `<button type="button" class="chip va-choice ${cur === val ? "on" : ""}" data-vt-set="${key}" data-vt-val="${val}" aria-pressed="${cur === val}">${esc(label)}</button>`; }
  function photoSetHtml(t, set, label) {
    const ph = C().photos, x = t.vent, list = set === "1" ? x.photos || [] : set === "equip" ? x.equipPhotos || [] : ((x.smokePhotos || {})[set.slice(6)] || []);
    return `<div class="vt-photos">${list.map((ref, i) => `<div class="vt-photo">${ph && ph.imgTag ? ph.imgTag(ref, label + " " + (i + 1)) : ""}<button type="button" class="btn ghost" data-vt-delphoto="${i}" data-vt-pset="${esc(set)}">Remove</button></div>`).join("")}</div>
      <label class="btn ghost vt-take">📷 ${esc(label)}<input type="file" accept="image/*" capture="environment" data-vt-take="${esc(set)}" hidden></label>`;
  }
  function ruleHtml(x) {
    if (x.install === "new") return `<p class="va-rule">New installation: smoke test and face velocity with the cupboard <b>empty</b> (no apparatus) ${cite("A4.1.3, B4.1.3, cl. 4.2.2, 4.2.3")}</p>`;
    if (x.install === "existing") return `<p class="va-rule">Existing installation: test at <b>normal working conditions</b>, with any bulky apparatus that normally sits inside left in place ${cite("A4.1.2, B4.1.2")}</p>`;
    return "";
  }
  function step1Html(t) {
    const x = t.vent, units = usedUnits(t);
    const sib = (C().trainsOf(t.eventId) || []).filter(y => isVent(y) && y !== t && gridOf(y) && str(y.vent.unit).trim() && str(y.vent.unit).trim().toLowerCase() === str(x.unit).trim().toLowerCase());
    return `<div class="card vt-card" id="vaStep1"><h3 class="vt-h">1 · Unit details ${cite("Figure A1, A4.1, A5")}</h3>
      ${field("location", "Where is the unit? (building, room)", x.location, "e.g. Chemistry Lab 2.14, Building C")}
      <label for="vt-unit">What is the fume cupboard number or ID?</label>
      <input id="vt-unit" data-vt="unit" value="${esc(x.unit)}" placeholder="e.g. FC-2" autocomplete="off" list="vtUnits">
      <datalist id="vtUnits">${units.map(u => `<option value="${esc(u.vent.unit)}"></option>`).join("")}</datalist>
      ${units.length ? `<p class="help">Units already on this event: ${units.map(u => `<button type="button" class="chip" data-vt-unit="${esc(u.id)}">${esc(u.vent.unit)}</button>`).join(" ")}</p>` : ""}
      <label for="vt-hood">What type of fume cupboard is it?</label>
      <input id="vt-hood" data-vt="hood" value="${esc(x.hood)}" placeholder="e.g. Bench-type fume cupboard" autocomplete="off" list="vtHoods">
      <datalist id="vtHoods">${FC_TYPES.concat(HOODS).map(h => `<option value="${esc(h)}"></option>`).join("")}</datalist>
      <p class="help">Fume cupboard types: bench-type, walk-in, downdraught, variable air volume ${cite("cl. 2.1")}. The standard covers ducted fume cupboards only, not recirculating cabinets ${cite("cl. 1.1")}.</p>
      <div class="vt-grid3"><div>${field("hoodMake", "Make <span class=\"muted\">(optional)</span>", x.hoodMake, "e.g. Dynaflow")}</div><div>${field("hoodModel", "Model <span class=\"muted\">(optional)</span>", x.hoodModel, "Model")}</div><div>${field("hoodSerial", "Serial <span class=\"muted\">(optional)</span>", x.hoodSerial, "Serial number")}</div></div>
      <label>Is this a new installation or an existing one?</label>
      <div class="va-choices">${choice("install", "new", "New (commissioning)", x.install)}${choice("install", "existing", "Existing", x.install)}</div>
      ${ruleHtml(x)}
      <label>Is the fume cupboard empty?</label>
      <div class="va-choices">${choice("empty", "yes", "Yes, empty", x.empty)}${choice("empty", "no", "No, equipment inside", x.empty)}</div>
      ${x.empty === "no" ? `<div class="va-sub"><p class="help">Attach a photo or plan showing the size, shape and position of everything inside during the tests ${cite("A5, A4.2(j)")}.</p>
        ${photoSetHtml(t, "equip", "Equipment photo / plan")}
        <label for="vt-equipNote">Or describe the plan <span class="muted">(size, shape, position)</span></label><textarea id="vt-equipNote" data-vt="equipNote" rows="2" placeholder="e.g. Rotary evaporator 400 × 300 mm, back left; water bath centre">${esc(x.equipNote)}</textarea></div>` : ""}
      ${field("smokeSource", "What are you using to make smoke?", x.smokeSource, "Air current tubes")}
      <p class="help">Smoke shall be generated with air current tubes ${cite("A3")}.</p>
      <label for="vt-condition">How many fans are running (operating condition)? <span class="muted">(optional)</span></label>
      <div class="vg-fans" aria-label="How many fans are running?">${FANS.map((f, i) => `<button type="button" class="chip ${str(x.condition) === f ? "on" : ""}" data-vt-fans="${i}">${i + 1} fan${i ? "s" : ""}</button>`).join("")}</div>
      <input id="vt-condition" data-vt="condition" value="${esc(x.condition)}" placeholder="e.g. Two extraction fans in operation" autocomplete="off">
      ${sib.length ? `<p class="help">Other conditions on this unit: ${sib.map(y => `<a href="#" onclick="openTrain('${esc(y.id)}');return false">${esc(dn(y))}${str(y.vent.condition).trim() ? " · " + esc(y.vent.condition) : ""}</a>`).join(", ")}</p>` : ""}
      <label>Photos of the unit <span class="muted">(optional)</span></label>
      ${photoSetHtml(t, "1", "Unit photo")}
    </div>`;
  }
  function step2Html(t) {
    const x = t.vent, sm = smokeOf(t);
    const rateBtns = z => ["G", "S", "D", "NA"].map(r => `<button type="button" class="chip va-rate va-r${r} ${z.r === r ? "on" : ""}" data-vt-rate="${z.row.k}:${r}" aria-pressed="${z.r === r}" title="${esc(RATE[r] + ": " + RATE_HOW[r])}">${r === "NA" ? "N/A" : r}</button>`).join("");
    const legend = `<div class="va-legend"><span><b>G</b> Good: ${RATE_HOW.G}</span><span><b>S</b> Satisfactory: ${RATE_HOW.S}</span><span><b>D</b> Dangerous: ${RATE_HOW.D}</span><span><b>N/A</b>: ${RATE_HOW.NA}</span></div>`;
    const matrix = z => `<details class="va-help" data-va-help="${z.row.k}" ${helpOpen.has(t.id + ":" + z.row.k) ? "open" : ""}><summary>Help me decide</summary>
        <table class="va-mx"><thead><tr><th>What did the smoke do?</th>${OBS.map(([r]) => `<th>${r === "NA" ? "N/A" : r}</th>`).join("")}</tr></thead><tbody>
        ${OBS.map(([r, obs]) => `<tr class="${z.r === r ? "on" : ""}"><th scope="row">${esc(obs)}</th>${OBS.map(([c]) => c === r ? `<td><button type="button" class="va-mxb va-r${r} ${z.r === r ? "on" : ""}" data-vt-rate="${z.row.k}:${r}:pick" aria-pressed="${z.r === r}">${r === "NA" ? "N/A" : r}</button></td>` : `<td></td>`).join("")}</tr>`).join("")}
        </tbody></table><p class="help">Pick the row that matches what you saw; it sets the rating above. N/A needs a reason in the note below.</p></details>`;
    return `<div class="card vt-card" id="vaStep2"><h3 class="vt-h">2 · Smoke test ${cite("Appendix A, cl. 3.1.1")}</h3>
      <div class="va-fig">${imgWithFallback(SMOKE_IMG, "visual", "va-figimg")}<div class="help">Smoke shows how air moves into and through the cupboard ${cite("A2")}. Use air current tubes ${cite("A3")}.<div class="vt-credit">${esc(SMOKE_IMG.credit)}. Example image, not from the standard.</div></div></div>
      <p class="va-rule">Do the smoke test and record it <b>before</b> the face velocity ${cite("A4.1.1")}. Containment is assessed by this test ${cite("cl. 3.1.1")}.</p>
      ${ruleHtml(x)}
      <p class="va-rule va-worst">Answer each question with one tap: <b>G</b>, <b>S</b>, <b>D</b> or <b>N/A</b>. <b>The worst rating sets the unit's smoke result</b>: one D and the unit fails ${cite("A5, A6")}.</p>
      <ol class="va-proc"><li value="1"><b>(a)</b> First, open the sash to the maximum working aperture ${cite("A4.2(a)")}.</li></ol>
      ${sm.rows.map(z => `<div class="va-row ${z.r ? "rated va-x" + z.r : ""}" id="vaRow-${z.row.k}" data-va-row="${z.row.k}">
        <div class="va-q" id="va-q-${z.row.k}">${esc(z.row.q)}</div>
        <div class="va-rowh muted">(${z.row.step.replace(/^A4\.2\(|\)$/g, "").replace(")–(", "–")}) ${esc(z.row.name)} ${cite(z.row.step)}</div>
        <p class="help">How: ${esc(z.row.how)}</p>
        <div class="va-rates" role="group" aria-label="${esc(z.row.q)}">${rateBtns(z)}</div>
        ${legend}
        ${matrix(z)}
        <label for="va-c-${z.row.k}" class="va-cl">What did you see? <span class="muted">${z.r === "NA" ? "(reason required for N/A)" : "(optional; goes in the A4.2(l) observations)"}</span></label>
        <input id="va-c-${z.row.k}" data-va-c="${z.row.k}" value="${esc(z.c)}" placeholder="${z.r === "NA" ? "Why doesn't this position apply?" : "e.g. slight eddy at the left sash handle, contained"}" autocomplete="off">
        ${photoSetHtml(t, "smoke:" + z.row.name, "Photo")}
      </div>`).join("")}
      <label for="vt-smokeComments">(l) Anything else you saw about where smoke spread well or badly? <span class="muted">(optional)</span> ${cite("A4.2(l)")}</label>
      <textarea id="vt-smokeComments" data-vt="smokeComments" rows="2" placeholder="General observations; the notes under each question are added to this record">${esc(x.smokeComments)}</textarea>
      <div id="vaSmokeRes">${smokeResHtml(t)}</div>
    </div>`;
  }
  function smokeResHtml(t) {
    const sm = smokeOf(t);
    if (!sm.rows.some(z => z.r)) return `<div class="vg-std"><span class="muted">Smoke result: worst score across the rows; compliant if all are S or better ${cite("A6")}.</span></div>`;
    const cls = sm.dangerous ? "vg-fail" : sm.done ? "vg-pass" : "";
    return `<div class="vg-std ${cls}" id="vaSmoke"><b>Smoke result: ${sm.worst ? RATE[sm.worst] : "—"}${sm.done ? (sm.compliant ? " · Compliant" : " · Non-compliant") : sm.dangerous ? " · Non-compliant" : " · not finished"}</b> ${cite("A6: worst score; any D is non-compliant")}</div>`;
  }
  function eqField(id, key, label, val, ph, extra) { return `<div><label for="${id}">${label}</label><input id="${id}" data-vt-eq="${key}" value="${esc(val)}" placeholder="${esc(ph)}" autocomplete="off" ${extra || ""}></div>`; }
  function step3Html(t) {
    const x = t.vent, q = gridOf(t), manual = q.basis === "manual", ev = evOf(t) || {}, e = ev.ventEquip || {}, sm = smokeOf(t);
    const gate = !sm.done && !x.fvEarly && !stats(t).n;
    return `<div class="card vt-card" id="vaStep3"><h3 class="vt-h">3 · Face velocity ${cite("Appendix B, cl. 3.1.2")}</h3>
      ${ruleHtml(x)}
      <h4 class="va-h4">Anemometer ${cite("B3, Figure A1")}</h4>
      <p class="help">Calibrated within the past 12 months by an accredited laboratory; reads 0.1–1.0 m/s at 0.05 m/s resolution or better. A thermal anemometer is preferred. Do not use a glowing hot-wire anemometer in a combustible atmosphere ${cite("B3")}. Entered once for the event; each reading is shown corrected (→) ${cite("B4.2(e), Figure A1 note 3")}.</p>
      <div class="va-anem">${anemFieldsHtml(ev, "vaEq")}</div>
      <h4 class="va-h4">Opening and grid ${cite("B4.2(a)–(c), Figure B1")}</h4>
      <p class="help">(a) Open the sash to the maximum face opening, then measure it.</p>
      <div class="vt-grid2"><div><label for="vg-w">How wide is the face opening? (mm)</label><input id="vg-w" data-vg="widthMm" value="${esc(q.widthMm)}" inputmode="numeric" placeholder="e.g. 1500" autocomplete="off"></div>
      <div><label for="vg-h">How high is the face opening, sash at maximum? (mm)</label><input id="vg-h" data-vg="heightMm" value="${esc(q.heightMm)}" inputmode="numeric" placeholder="e.g. 500" autocomplete="off"></div></div>
      ${geomHtml(t)}
      <p class="help">Grid per ${STD.ref}: points ${STD.edge} mm in from the edges of the opening, then equally spaced, not more than ${STD.maxY} mm apart vertically nor more than ${STD.maxX} mm apart horizontally, using the fewest lines that meet this.</p>
      ${manual ? `<div class="vg-manual"><b>Manual grid</b> <span class="muted">(not set out from the opening size)</span>
        <div class="vt-grid2"><div><label for="vg-cols">Columns (across)</label><input id="vg-cols" data-vg="cols" value="${esc(q.cols)}" inputmode="numeric" autocomplete="off"></div><div><label for="vg-rows">Rows (down)</label><input id="vg-rows" data-vg="rows" value="${esc(q.rows)}" inputmode="numeric" autocomplete="off"></div></div>
        <label for="vg-reason">Reason for the manual grid <span class="muted">(optional)</span></label><input id="vg-reason" data-vg="reason" value="${esc(q.reason)}" placeholder="e.g. opening size unknown, obstruction, site requirement" autocomplete="off">
        <button type="button" class="btn ghost" data-vg-standard="1">Use the standard grid from the opening size</button></div>`
      : `<button type="button" class="btn ghost vg-manbtn" data-vg-manual="1">Manual grid instead (${MANUAL_DEFAULT.cols}×${MANUAL_DEFAULT.rows} = ${MANUAL_DEFAULT.cols * MANUAL_DEFAULT.rows})</button>`}
      <h4 class="va-h4">Readings (m/s) ${cite("B4.2(b), (d), (e)")}</h4>
      <p class="help">(b) Stand back about 0.5 m from the face and to one side. (d) Hold the probe steady, normal to the plane of the sash (highest reading). (e) Read for at least 15 s at each point and enter the reading. Points go A, B, C… from top left, across each row (Figure A1 note 4); Enter moves to the next letter. Optionally note the distance from the face where velocity drops below 0.5 m/s (metres).</p>
      ${gate ? `<div class="va-gate" id="vaGate"><b>Finish the smoke test first.</b> The standard requires the smoke test before face velocity ${cite("A4.1.1, B4.1.1")}.<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px"><button type="button" class="btn mid" data-vt-step="2">Go to the smoke test</button><button type="button" class="btn ghost" data-vt-fvearly="1">Record face velocity anyway</button></div></div>` : cellsHtml(t) + labelsHtml(t)}
      ${gridStatsHtml(t)}
      ${stdHtml(t)}
    </div>`;
  }
  function a1Html(t) {
    const x = t.vent, q = gridOf(t), sm = smokeOf(t), s = stats(t), va = variation(t), cal = calOf(t), ev = evOf(t) || {}, e = ev.ventEquip || {}, N = gridN(q);
    const ords = Array.from({ length: N }, (_, o) => idxOf(o, q.cols, q.rows));
    const chunks = []; for (let j = 0; j < ords.length; j += 8) chunks.push(ords.slice(j, j + 8));
    const cv = i => { const v = corrected(q, i, cal.k); return v == null ? "" : f2(v); };
    const lohi = (i, w) => { const n = numOf((w === "lo" ? q.lo[ptLoKey(i)] : q.hi[ptHiKey(i)])); return n == null ? "" : f2(r2(n + cal.k)); };
    return `<div class="va-a1" id="vaA1"><h4 class="va-h4">Record ${cite("Figure A1: reporting of velocity and smoke test results")}</h4>
      <table class="va-kv"><tbody>
        <tr><th>Location</th><td>${esc(x.location)}</td></tr><tr><th>F/C number</th><td>${esc(x.unit)}</td></tr><tr><th>Type</th><td>${esc(x.hood)}</td></tr>
        <tr><th>Installation</th><td>${x.install === "new" ? "New (commissioning)" : x.install === "existing" ? "Existing" : ""}</td></tr>
      </tbody></table>
      <h5>Smoke test</h5>
      <table class="va-kv"><tbody><tr><th>Fume cupboard empty</th><td>${x.empty === "yes" ? "Yes" : x.empty === "no" ? "No (plan / photo attached: " + ((x.equipPhotos || []).length + (str(x.equipNote).trim() ? " + description" : "")) + ")" : ""}</td></tr><tr><th>Smoke source used</th><td>${esc(x.smokeSource)}</td></tr></tbody></table>
      <div class="vg-scroll"><table class="vg-sum va-smoke"><thead><tr><th>Test position</th><th>Result</th><th>Comments</th></tr></thead><tbody>
        ${sm.rows.map(z => `<tr><td>${esc(z.row.name)}</td><td class="va-res va-x${esc(z.r)}">${z.r === "NA" ? "N/A" : esc(z.r)}</td><td>${esc(z.c)}${z.photos.length ? ` <span class="muted">(${z.photos.length} photo${z.photos.length === 1 ? "" : "s"})</span>` : ""}</td></tr>`).join("")}
      </tbody></table></div>
      <table class="va-kv"><tbody><tr><th>Observations of smoke distribution ${cite("A4.2(l)")}</th><td id="vaA1Obs">${esc(smokeObs(t))}</td></tr></tbody></table>
      <p class="help">G Good · S Satisfactory · D Dangerous ${cite("A5")}. Result: <b>${sm.worst ? RATE[sm.worst] : "—"}</b>${sm.done ? " · " + (sm.compliant ? "Compliant" : "Non-compliant") : ""}.</p>
      <h5>Face velocity</h5>
      <table class="va-kv"><tbody>
        <tr><th>Face opening</th><td>${q.basis === "manual" ? "Manual grid" + (str(q.reason).trim() ? " (" + esc(q.reason) + ")" : "") : "Width " + esc(q.widthMm) + " mm · Height " + esc(q.heightMm) + " mm"}</td></tr>
        <tr><th>No. of readings</th><td>${N ? s.n + " of " + N + " (" + q.cols + " × " + q.rows + ")" : ""}</td></tr>
        <tr><th>Instrument</th><td>${esc([e.make, e.model].filter(Boolean).join(" "))}</td></tr><tr><th>Serial no.</th><td>${esc(e.serial)}</td></tr>
        <tr><th>Calibration correction factor</th><td>${cal.set ? esc((cal.k > 0 && !/^\+/.test(cal.raw) ? "+" : "") + cal.raw) + " m/s at " + esc(cal.at || "—") + " m/s" : ""}</td></tr>
        <tr><th>Owned / hired</th><td>${e.ownership === "hired" ? "Hired" + (str(e.supplier).trim() ? " (" + esc(e.supplier) + ")" : "") : e.ownership === "owned" ? "Owned" : ""}</td></tr>
        <tr><th>Last calibration / due</th><td>${esc(e.calDate || "")}${e.calDue ? " / due " + esc(e.calDue) : ""}${(e.certPhotos || []).length ? " · certificate photo" : ""}</td></tr>
        <tr><th>Calibration check</th><td>${(() => { const w = calWarnings(ev); return w.length ? `<span class="vt-warn">${esc(w.join("; "))}</span>` : "OK"; })()}</td></tr>
      </tbody></table>
      ${chunks.map(ch => `<div class="vg-scroll"><table class="vg-sum va-res-t"><thead><tr><th>Results</th>${ch.map(i => `<th>${esc(pointId(q, i))}</th>`).join("")}</tr></thead><tbody>
        <tr><th>Reading</th>${ch.map(i => `<td>${cv(i)}</td>`).join("")}</tr>
        ${ch.some(i => lohi(i, "hi")) ? `<tr><th>Maximum</th>${ch.map(i => `<td>${lohi(i, "hi")}</td>`).join("")}</tr>` : ""}
        ${ch.some(i => lohi(i, "lo")) ? `<tr><th>Minimum</th>${ch.map(i => `<td>${lohi(i, "lo")}</td>`).join("")}</tr>` : ""}
      </tbody></table></div>`).join("")}
      <table class="va-kv"><tbody>
        <tr><th>Total mean value / average face velocity</th><td>${s.n ? f2(s.avg) + " m/s" : ""}</td></tr>
        <tr><th>Maximum / minimum reading</th><td>${s.n ? f2(s.max) + " / " + f2(s.min) + " m/s" : ""}</td></tr>
        <tr><th>No. of points</th><td>${N || ""}</td></tr>
        <tr><th>Max. variation of readings from average</th><td>${va.pct != null ? va.pct + " %" : ""}</td></tr>
      </tbody></table>
      <p class="help">All readings in m/s. Average to two decimal places. All figures include the calibration correction factor ${cite("Figure A1 notes 1–3")}.</p>
    </div>`;
  }
  function step4Html(t) {
    const x = t.vent, sm = smokeOf(t), fv = fvResult(t), ov = overall(t), s = stats(t);
    const pill = (ok, txt) => `<span class="va-pill ${ok === true ? "ok" : ok === false ? "bad" : ""}">${esc(txt)}</span>`;
    return `<div class="card vt-card" id="vaStep4"><h3 class="vt-h">4 · Summary ${cite("A6, cl. 3.1.2, Figure A1")}</h3>
      <div class="va-sum" id="vaSum">
        <div><span>Smoke test</span>${pill(sm.done ? sm.compliant : sm.dangerous ? false : null, sm.done ? RATE[sm.worst] + " · " + (sm.compliant ? "compliant" : "non-compliant") : sm.dangerous ? "Dangerous · non-compliant" : "not finished")}</div>
        <div><span>Face velocity</span>${pill(fv, fv == null ? "not finished" : (fv ? "meets" : "does not meet") + " cl. 3.1.2 · avg " + f2(s.avg) + " m/s, max " + f2(s.max) + ", min " + f2(s.min))}</div>
        <div><span>Overall</span>${pill(ov === "Compliant" ? true : ov === "Non-compliant" ? false : null, ov)}</div>
      </div>
      <p class="help">Overall = smoke test compliant (all S or better, A6) and face velocity meets cl. 3.1.2 (average ≥ 0.5 m/s, every point ≥ 0.3 m/s). These two tests are not the full compliance testing for commissioning or annual inspection ${cite("B5 note 2; cl. 4.2, 5.5.4")}.</p>
      ${a1Html(t)}
      <label for="vt-comments">Comments / conclusions ${cite("Figure A1, B5 note 1")}</label><textarea id="vt-comments" data-vt="comments" rows="3" placeholder="Conclusions; record any unstable readings here">${esc(x.comments)}</textarea>
      <div class="vt-grid2"><div>${field("testedBy", "Tested by (print)", x.testedBy, "Name")}</div><div><label>Date</label><input value="${esc((evOf(t) || {}).date || "")}" disabled></div></div>
      <p class="help">Testing shall be carried out by a competent person ${cite("cl. 4.2.7")}. Results go to the person in charge of the laboratory ${cite("B5")}.</p>
    </div>`;
  }
  function gridPageHtml(t) {
    const ev = evOf(t), x = vt(t, true), eq = (ev && ev.ventEquip) || {};
    const typeOpts = TYPES.filter(a => PICK.includes(a[0]) || a[0] === x.type).map(([k, n]) => `<option value="${k}" ${k === x.type ? "selected" : ""}>${esc(n)}</option>`).join("");
    const n = curStep(t);
    const body = n === 1 ? step1Html(t) : n === 2 ? step2Html(t) : n === 3 ? step3Html(t) : step4Html(t);
    return `<div class="wrap vt-page" id="vtPage" data-vt-id="${esc(t.id)}" data-vt-grid="1" data-vt-stepno="${n}">
      <button class="btn ghost" onclick="openEvent('${esc(t.eventId)}')">← Event ${ev ? esc(ev.code) : ""}</button>
      <div class="row" style="margin-top:10px;align-items:center;gap:10px"><h2 class="brand-type" style="margin:0;color:var(--navy)">${esc(dn(t))}</h2><span id="vtBadge">${badgeHtml(t)}</span></div>
      <p class="muted">${esc(typeName(x.type))}${str(x.unit).trim() ? " · " + esc(x.unit) : ""} · AS/NZS 2243.8:2014${eq.serial || eq.model ? " · anemometer " + esc([eq.make, eq.model].filter(Boolean).join(" ")) + (eq.serial ? " SN " + esc(eq.serial) : "") : ""}</p>
      <label for="vt-type" class="va-typel">Measurement type</label><select id="vt-type" data-vt="type">${typeOpts}</select>
      ${stepNavHtml(t, n)}
      ${stepChecksHtml(t, n)}
      ${body}
      <div class="row va-nav" style="gap:10px;flex-wrap:wrap;margin-top:12px">
        ${n > 1 ? `<button type="button" class="btn ghost" data-vt-step="${n - 1}">← Back</button>` : ""}
        ${n < 4 ? `<button type="button" class="btn mid" data-vt-step="${n + 1}" id="vaNext">Next: ${esc(STEPS[n][1])} →</button>` : `<button type="button" class="btn mid" onclick="openEvent('${esc(t.eventId)}')">Done</button>`}
      </div>
      <div class="row vt-actions" style="gap:10px;flex-wrap:wrap;margin-top:12px">
        <button type="button" class="btn ghost" data-vt-again="1">+ Another condition on this unit</button>
        ${n < 4 ? `<button type="button" class="btn ghost" onclick="openEvent('${esc(t.eventId)}')">Done for now</button>` : ""}
        ${typeof g.isAdmin === "function" && g.isAdmin() ? `<button type="button" class="btn ghost vt-del" data-vt-delete="1">Delete measurement</button>` : ""}
      </div>
      ${auditHtml(t)}
      <p class="help">ENVSS Field v${esc(C().appVersion || "")} · vent.js ${VENT_VERSION}</p>
    </div>`;
  }
  /* reshape the grid without losing anything: points keep their column/row; a shape that would drop a filled point is refused */
  function reshape(t, cols, rows, why) {
    const q = gridOf(t), oc = q.cols, or = q.rows;
    if (cols === oc && rows === or) return true;
    const nv = {}, nd = {}, nl = {}, nlo = {}, nhi = {}, lost = [];
    for (let i = 0; i < gridN(q); i++) {
      const has = [q.v[ptKey(i)], q.d[ptDKey(i)], q.label[ptLKey(i)], q.lo[ptLoKey(i)], q.hi[ptHiKey(i)]].some(v => str(v).trim() !== "");
      if (!has) continue;
      const c = Math.floor(i / or), r = i % or;
      if (c >= cols || r >= rows) { lost.push(pointId(q, i)); continue; }
      const j = c * rows + r;
      if (str(q.v[ptKey(i)]).trim()) nv[ptKey(j)] = q.v[ptKey(i)];
      if (str(q.d[ptDKey(i)]).trim()) nd[ptDKey(j)] = q.d[ptDKey(i)];
      if (str(q.label[ptLKey(i)]).trim()) nl[ptLKey(j)] = q.label[ptLKey(i)];
      if (str(q.lo[ptLoKey(i)]).trim()) nlo[ptLoKey(j)] = q.lo[ptLoKey(i)];
      if (str(q.hi[ptHiKey(i)]).trim()) nhi[ptHiKey(j)] = q.hi[ptHiKey(i)];
    }
    if (lost.length) {
      alert("That would change the grid to " + cols + " × " + rows + " and drop the readings already entered at point" + (lost.length === 1 ? " " : "s ") + lost.join(", ") + ".\n\nNothing has been changed. Clear those points first if the grid really is smaller.");
      return false;
    }
    const moved = gridN(q) && Object.keys(q.v).length && rows !== or;
    q.v = nv; q.d = nd; q.label = nl; q.lo = nlo; q.hi = nhi; q.cols = cols; q.rows = rows;
    note(t, "Grid " + (oc && or ? oc + " × " + or : "not set") + " → " + cols + " × " + rows, why + (moved ? "; entered points kept their column and row" : ""));
    return true;
  }
  function applyStandard(t) {
    const q = gridOf(t), gg = gridFor(q.widthMm, q.heightMm);
    if (!gg) return false;
    if (!reshape(t, gg.cols, gg.rows, STD.ref + " from " + q.widthMm + " × " + q.heightMm + " mm")) return null;
    q.gapX = gg.gapX; q.gapY = gg.gapY; q.basis = "standard";
    return true;
  }
  function gridSoft(t) {
    const q = gridOf(t); if (!q) return;
    const set = (id, html) => { const el = document.getElementById(id); if (el) el.outerHTML = html; };
    set("vtStats", gridStatsHtml(t)); set("vgCheck", stdHtml(t));
    const n0 = +((document.getElementById("vtPage") || {}).dataset || {}).vtStepno || 0;
    if (n0) { set("vtChecks", stepChecksHtml(t, n0)); set("vaSteps", stepNavHtml(t, n0)); }
    const sr = document.getElementById("vaSmokeRes"); if (sr) sr.innerHTML = smokeResHtml(t);
    const k = calOf(t).k;
    document.querySelectorAll("[data-vg-cell]").forEach(el => { const i = +el.dataset.vgCell, num = el.querySelector(".vg-num"); if (num) num.innerHTML = cellHead(q, i); el.title = pointLabel(q, i); const n = corrected(q, i, k); el.classList.remove("vg-low", "vg-mid", "vg-ok"); const b = band(n); if (b) el.classList.add(b); const co = el.querySelector(".vg-cor"); if (co) co.textContent = n != null && k ? "→ " + f2(n) : ""; });
  }
  function gridInput(t, el) {
    const q = gridOf(t); if (!q) return false;
    const d = el.dataset;
    if (d.vgV != null) { const k = ptKey(+d.vgV), v = el.value.trim(); if (v) q.v[k] = v; else delete q.v[k]; return true; }
    if (d.vgD != null) { const k = ptDKey(+d.vgD), v = el.value.trim(); if (v) q.d[k] = v; else delete q.d[k]; return true; }
    if (d.vgL != null) { const k = ptLKey(+d.vgL), v = el.value.trim(); if (v) q.label[k] = v; else delete q.label[k]; return true; }
    if (d.vgLo != null) { const k = ptLoKey(+d.vgLo), v = el.value.trim(); if (v) q.lo[k] = v; else delete q.lo[k]; return true; }
    if (d.vgHi != null) { const k = ptHiKey(+d.vgHi), v = el.value.trim(); if (v) q.hi[k] = v; else delete q.hi[k]; return true; }
    if (d.vg === "widthMm" || d.vg === "heightMm" || d.vg === "reason") { q[d.vg] = el.value.trim(); return true; }
    if (d.vg === "cols" || d.vg === "rows") return true; /* applied on change */
    return false;
  }
  function gridChange(t, el) {
    const q = gridOf(t); if (!q) return false;
    const d = el.dataset;
    if (d.vg === "widthMm" || d.vg === "heightMm") {
      const before = focusVal.has(el) ? str(focusVal.get(el)) : "";
      q[d.vg] = el.value.trim();
      if (q.basis === "manual") { focusVal.set(el, el.value); sync(t); save(); softPaint(t); return true; }
      const r = applyStandard(t);
      if (r === null) { q[d.vg] = before; el.value = before; }
      else if (r === false && str(q.widthMm) && str(q.heightMm)) alert("Enter the opening width and height in millimetres (numbers only).");
      else if (r === false && !Object.keys(q.v).length) { q.cols = 0; q.rows = 0; }
      focusVal.set(el, el.value); dirty = false; sync(t); save(); C().render();
      const nx = document.getElementById(d.vg === "widthMm" && !str(q.heightMm) ? "vg-h" : ""); if (nx) nx.focus();
      return true;
    }
    if (d.vg === "cols" || d.vg === "rows") {
      const n = Math.round(Number(el.value));
      if (!(n >= 1 && n <= 30)) { alert("Columns and rows must be whole numbers from 1 to 30."); el.value = q[d.vg]; return true; }
      const cols = d.vg === "cols" ? n : q.cols, rows = d.vg === "rows" ? n : q.rows;
      if (reshape(t, cols, rows, "manual grid")) { q.gapX = 0; q.gapY = 0; }
      dirty = false; sync(t); save(); C().render(); return true;
    }
    return false;
  }
  function gridClick(t, b) {
    const q = gridOf(t), x = t.vent;
    if (b.dataset.vtStep && q) { flushDirty(); stepOf.set(t.id, Math.max(1, Math.min(4, +b.dataset.vtStep))); C().render(); try { const pg = document.getElementById("vaSteps"); if (pg) pg.scrollIntoView({ block: "start" }); else g.scrollTo(0, 0); } catch (e) {} return true; }
    if (b.dataset.vtSet && x) {
      const key = b.dataset.vtSet, val = b.dataset.vtVal, before = str(x[key]);
      if (before === val) return true;
      x[key] = val; note(t, key === "install" ? "Installation" : "Fume cupboard empty", (before || "blank") + " → " + val); sync(t); save(); C().render(); return true;
    }
    if (b.dataset.vtRate && x) {
      const [k, r, how] = b.dataset.vtRate.split(":"), row = SMOKE.find(z => z.k === k); if (!row) return true;
      x.smoke = x.smoke || {}; const before = str(x.smoke[row.name]);
      if (before === r && how === "pick") return true;   /* matrix taps only select */
      if (before === r) { delete x.smoke[row.name]; note(t, "Smoke " + row.step, row.name + ": " + before + " → blank"); }
      else { x.smoke[row.name] = r; note(t, "Smoke " + row.step, row.name + ": " + (before || "blank") + " → " + r); }
      if (smokeOf(t).done && !x.smokeDoneAt) x.smokeDoneAt = new Date().toISOString();
      sync(t); save(); C().render(); return true;
    }
    if (b.dataset.vtFvearly && x) { x.fvEarly = new Date().toISOString(); note(t, "Face velocity before smoke test finished", "chosen on site (A4.1.1 asks for the smoke test first)"); sync(t); save(); C().render(); return true; }
    if (b.dataset.vtFans != null && x) {
      const before = str(x.condition); x.condition = FANS[+b.dataset.vtFans];
      note(t, "Condition", (before || "blank") + " → " + x.condition); sync(t); save(); C().render(); return true;
    }
    if (!q) return false;
    if (b.dataset.vgManual) {
      const cols = q.cols || MANUAL_DEFAULT.cols, rows = q.rows || MANUAL_DEFAULT.rows;
      if (!reshape(t, cols, rows, "manual grid")) return true;
      q.basis = "manual"; q.gapX = 0; q.gapY = 0; note(t, "Manual grid", cols + " × " + rows + " (reason to be recorded)");
      sync(t); save(); C().render(); const r = document.getElementById("vg-reason"); if (r) r.focus(); return true;
    }
    if (b.dataset.vgStandard) {
      if (!gridFor(q.widthMm, q.heightMm)) { alert("Enter the opening width and height (mm) first. The standard grid is set out from them."); const w = document.getElementById("vg-w"); if (w) w.focus(); return true; }
      if (applyStandard(t)) note(t, "Standard grid", STD.ref);
      sync(t); save(); C().render(); return true;
    }
    return false;
  }
  /* hood details belong to the unit: an edit flows to the other conditions on the same unit where they were blank or the same as before */
  function propagateUnit(t, key, before, after) {
    if (before.trim() === after) return;
    const u = str(t.vent.unit).trim().toLowerCase(); if (!u) return;
    (C().trainsOf(t.eventId) || []).forEach(y => {
      if (y === t || !isVent(y) || !gridOf(y) || str(y.vent.unit).trim().toLowerCase() !== u || y.status === "not_used") return;
      const cur = str(y.vent[key]).trim(); if (cur && cur !== before.trim()) return;
      y.vent[key] = after; note(y, "Unit detail from " + dn(t), key + ": " + (cur || "blank") + " → " + (after || "blank")); sync(y);
    });
  }
  function auditHtml(t) {
    const a = (t.audit || []).slice(-30).reverse();
    return `<details class="vt-audit"><summary>History (${(t.audit || []).length})</summary>${a.map(x => `<div class="muted">${esc(fmt(x.at))} · ${esc(x.who || "")} · ${esc(x.action || "")}${x.detail ? " · " + esc(x.detail) : ""}</div>`).join("")}</details>`;
  }
  function fmt(iso) { try { return new Date(iso).toLocaleString("en-AU", { timeZone: "Australia/Perth", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) + " AWST"; } catch (e) { return str(iso); } }
  function badgeHtml(t) { return complete(t) ? `<span class="badge s-sample_complete">Complete</span>` : started(t) ? `<span class="badge s-incomplete_blank">Complete fields</span>` : `<span class="badge s-prepped">New</span>`; }
  function softPaint(t) {
    const set = (id, html) => { const el = document.getElementById(id); if (el) el.outerHTML = html; };
    set("vtStats", statsHtml(t)); set("vtChecks", checksHtml(t));
    const b = document.getElementById("vtBadge"); if (b) b.innerHTML = badgeHtml(t);
    if (gridOf(t)) gridSoft(t);
  }

  /* ---------- edits (saved on every keystroke, audited once per field change) ---------- */
  const focusVal = new Map();
  let dirty = false;
  function flushDirty() { if (!dirty) return; dirty = false; const t = curVent(); if (t) sync(t); save(); }
  function onFocus(e) { const el = e.target; if (!el || !el.dataset || !curVent()) return; if (el.dataset.vt || el.dataset.vtR != null || el.dataset.vg || el.dataset.vgV != null || el.dataset.vgD != null || el.dataset.vgL != null || el.dataset.vgLo != null || el.dataset.vgHi != null || el.dataset.vaC != null) focusVal.set(el, el.value); }
  function onInput(e) {
    const el = e.target; if (!el || !el.dataset) return; const t = curVent(); if (!t) return;
    const x = vt(t, true);
    if (gridInput(t, el)) {}
    else if (el.dataset.vaC != null) { const row = SMOKE.find(z => z.k === el.dataset.vaC); if (!row) return; x.smoke = x.smoke || {}; const v = el.value.trim(); if (v) x.smoke[smokeCK(row)] = v; else delete x.smoke[smokeCK(row)]; }
    else if (el.dataset.vtR != null) { const i = +el.dataset.vtR; x.readings[i] = el.value.trim(); }
    else if (el.dataset.vt && el.dataset.vt !== "type") x[el.dataset.vt] = el.value;
    else return;
    /* not committed per keystroke: the shared change audit (v40) records one entry per field when the box is left,
       exactly like the other sample screens. Leaving the box, Enter, or the app going to the background commits. */
    dirty = true; sync(t); softPaint(t);
  }
  function anemEvent() { const v = view(); const ev = C().eventById(v.eventId); return isVentEvent(ev) ? ev : null; }
  function anemClick(b) {
    const ev = anemEvent(); if (!ev) return;
    ev.ventEquip = Object.assign({ make: "", model: "", serial: "" }, ev.ventEquip || {});
    const e = ev.ventEquip;
    if (b.dataset.vtEqset) {
      const before = str(e.ownership), val = b.dataset.vtVal; if (before === val) return;
      e.ownership = val; evNote(ev, "Anemometer owned / hired", (before || "blank") + " → " + val);
      if (val === "hired" && !str(e.supplier).trim()) { e.supplier = "Airmet"; evNote(ev, "Anemometer supplier", "blank → Airmet (default for hired)"); }
    } else {
      const i = +b.dataset.vtCertdel, list = e.certPhotos || [], ref = list[i]; if (!ref) return;
      if (!confirm("Remove this calibration certificate photo?")) return;
      list.splice(i, 1); try { const pid = String(ref).replace("envss-photo:", ""); if (C().photos && C().photos.discard) C().photos.discard(pid); } catch (err) {}
      evNote(ev, "Calibration certificate photo removed", "photo " + (i + 1));
    }
    (C().trainsOf(ev.id) || []).forEach(y => { if (isVent(y) && y.vent) sync(y); });
    save(); C().render();
  }
  async function onCert(el) {
    const ev = anemEvent(); const file = el.files && el.files[0]; if (!ev || !file) return;
    try {
      const ph = C().photos; if (!ph || !ph.attach) { alert("Photos are not available on this device."); return; }
      /* event-level photo: its own holder id so the shared photo queue stores and uploads it under the event */
      const holder = { id: "vent-cert-" + ev.id, eventId: ev.id };
      const ref = await ph.attach(file, holder, "ventCalCert"); if (!ref) return;
      ev.ventEquip = Object.assign({ make: "", model: "", serial: "" }, ev.ventEquip || {});
      (ev.ventEquip.certPhotos = ev.ventEquip.certPhotos || []).push(ref);
      if (holder.photoRefs) ev.ventEquip.certPhotoRefs = Object.assign({}, ev.ventEquip.certPhotoRefs, holder.photoRefs);
      evNote(ev, "Calibration certificate photo added", "photo " + ev.ventEquip.certPhotos.length);
      (C().trainsOf(ev.id) || []).forEach(y => { if (isVent(y) && y.vent) sync(y); });
      save(); C().render();
    } catch (err) { alert("The photo could not be saved on this device: " + (err && err.message || err)); }
  }
  function onChange(e) {
    const el0 = e.target; if (el0 && el0.dataset && el0.dataset.vtCert) { onCert(el0); return; }
    const el = e.target; if (!el || !el.dataset) return; const t = curVent(); if (!t) return;
    if (el.dataset.vtTake) { onFile(t, el); return; }
    const x = vt(t, true);
    if (el.dataset.vt === "type") {
      const before = x.type; x.type = el.value; vt(t, true); if (x.type === "grid" && !str(x.location).trim()) x.location = "Extraction face";
      note(t, "Measurement type", typeName(before) + " → " + typeName(x.type)); sync(t); save(); C().render(); return;
    }
    if (gridChange(t, el)) return;
    if (gridOf(t) && (el.dataset.vgV != null || el.dataset.vgD != null || el.dataset.vgL != null || el.dataset.vgLo != null || el.dataset.vgHi != null || el.dataset.vaC != null || el.dataset.vg === "reason")) {
      if (el.dataset.vaC != null && smokeOf(t).done && !t.vent.smokeDoneAt) t.vent.smokeDoneAt = new Date().toISOString();
      focusVal.set(el, el.value); dirty = false; sync(t); save(); softPaint(t); return;
    }
    if (gridOf(t) && /^hood/.test(el.dataset.vt || "")) propagateUnit(t, el.dataset.vt, focusVal.has(el) ? str(focusVal.get(el)) : "", el.value.trim());
    if (el.dataset.vt || el.dataset.vtR != null) {
      const nv = el.value.trim();
      if (el.dataset.vt === "unit" && nv && gridOf(t) && !str(x.hood).trim() && !str(x.hoodMake).trim()) { const l = lastFor(t, nv); if (l) { ["hood", "hoodMake", "hoodModel", "hoodSerial"].forEach(k => { x[k] = str(l.vent[k]); }); const q = gridOf(t), q0 = l.vent.grid; if (q0 && !gridN(q) && !Object.keys(q.v).length) Object.assign(q, { basis: q0.basis || "standard", widthMm: str(q0.widthMm), heightMm: str(q0.heightMm), cols: q0.cols || 0, rows: q0.rows || 0, gapX: q0.gapX || 0, gapY: q0.gapY || 0, reason: str(q0.reason) }); note(t, "Unit details copied", "hood and opening from " + dn(l)); sync(t); save(); C().render(); } }
      else if (el.dataset.vt === "unit" && nv && !str(x.hood).trim() && !str(x.condition).trim()) { const l = lastFor(t, nv); if (l) { x.hood = str(l.vent.hood); x.condition = str(l.vent.condition); note(t, "Unit details copied", "LEV / hood type and operating condition from " + dn(l)); sync(t); save(); C().render(); }
      }
      focusVal.set(el, el.value); dirty = false; sync(t); save(); softPaint(t);
    }
  }
  function onKey(e) {
    const el0 = e.target;
    if (el0 && el0.dataset && el0.dataset.vgV != null && e.key === "Enter") {
      const t0 = curVent(); if (!t0 || !gridOf(t0)) return; e.preventDefault(); flushDirty();
      const q0 = gridOf(t0), i0 = +el0.dataset.vgV, o = ordOf(i0, q0.cols, q0.rows) + 1;
      const nx = o < gridN(q0) ? document.getElementById("vg-v" + idxOf(o, q0.cols, q0.rows)) : null; if (nx) nx.focus(); else el0.blur();
      return;
    }
    const el = e.target; if (!el || !el.dataset || el.dataset.vtR == null || e.key !== "Enter") return; const t = curVent(); if (!t) return;
    e.preventDefault(); const i = +el.dataset.vtR;
    flushDirty();
    if (i === t.vent.readings.length - 1) addReading(t); else { const nx = document.getElementById("vt-r" + (i + 1)); if (nx) nx.focus(); }
  }
  function addReading(t) {
    const x = vt(t, true); x.readings.push(""); dirty = true; /* an empty box is committed with the next reading, so it is not its own history line */
    const box = document.getElementById("vtReads"); if (box) box.innerHTML = readingsHtml(t);
    const last = document.getElementById("vt-r" + (x.readings.length - 1)); if (last) last.focus();
  }
  function photoList(x, set, create) {
    if (set === "equip") { if (!Array.isArray(x.equipPhotos)) x.equipPhotos = []; return x.equipPhotos; }
    if (set.startsWith("smoke:")) { const k = set.slice(6); x.smokePhotos = x.smokePhotos || {}; if (!Array.isArray(x.smokePhotos[k])) { if (!create) return []; x.smokePhotos[k] = []; } return x.smokePhotos[k]; }
    return x.photos;
  }
  async function onFile(t, el) {
    const file = el.files && el.files[0]; if (!file) return;
    try {
      const ph = C().photos; if (!ph || !ph.attach) { alert("Photos are not available on this device."); return; }
      const set = String(el.dataset.vtTake || "1"), x = vt(t, true);
      const ref = await ph.attach(file, t, set === "equip" ? "ventEquipPhoto" : set.startsWith("smoke:") ? "ventSmokePhoto" : "ventPhoto");
      if (!ref) return;
      const list = photoList(x, set, true); list.push(ref);
      note(t, set === "equip" ? "Equipment photo / plan added" : set.startsWith("smoke:") ? "Smoke test photo added" : "Vent photo added", (set.startsWith("smoke:") ? set.slice(6) + " · " : "") + "photo " + list.length); sync(t); save(); C().render();
    } catch (err) { alert("The photo could not be saved on this device: " + (err && err.message || err)); }
  }
  function onClick(e) {
    const b = e.target.closest && e.target.closest("[data-vt-eqset],[data-vt-certdel],[data-vt-addread],[data-vt-again],[data-vt-delete],[data-vt-delphoto],[data-vt-unit],[data-vt-equip-save],[data-vt-export],[data-vt-fans],[data-vg-manual],[data-vg-standard],[data-vt-step],[data-vt-set],[data-vt-rate],[data-vt-fvearly]");
    if (!b) return false;
    if (b.dataset.vtExport) { exportCsv(b.dataset.vtExport); return true; }
    if (b.dataset.vtEquipSave) return true;
    if (b.dataset.vtEqset || b.dataset.vtCertdel != null) { anemClick(b); return true; }
    const t = curVent(); if (!t) return false;
    const x = vt(t, true);
    if (gridClick(t, b)) return true;
    if (b.dataset.vtAddread) { addReading(t); return true; }
    if (b.dataset.vtAgain) { addMeasurement(t.eventId, x.type === "visual" ? "capture" : x.type, t); return true; }
    if (b.dataset.vtUnit) {
      const src = (C().db().trains || []).find(y => y.id === b.dataset.vtUnit); if (!src || !src.vent) return true;
      const before = x.unit; x.unit = str(src.vent.unit); if (!str(x.hood).trim()) x.hood = str(src.vent.hood);
      if (gridOf(t)) { ["hoodMake", "hoodModel", "hoodSerial"].forEach(k => { if (!str(x[k]).trim()) x[k] = str(src.vent[k]); }); }
      else if (!str(x.condition).trim()) x.condition = str(src.vent.condition);
      note(t, "Unit picked", x.unit + " (from " + dn(src) + "; was " + (before || "blank") + ")"); sync(t); save(); C().render(); return true;
    }
    if (b.dataset.vtDelphoto != null) {
      const set = String(b.dataset.vtPset || "1"), list = photoList(x, set, false), i = +b.dataset.vtDelphoto, ref = list[i]; if (!ref) return true;
      if (!confirm("Remove this photo from the measurement?")) return true;
      list.splice(i, 1);
      try { const pid = String(ref).replace("envss-photo:", ""); if (C().photos && C().photos.discard) C().photos.discard(pid); } catch (err) {}
      note(t, "Vent photo removed", "photo " + (i + 1)); sync(t); save(); C().render(); return true;
    }
    if (b.dataset.vtDelete) {
      /* the shared delete: same confirm, same envss_deletions tombstone (no row DELETE), same event log */
      const v = view(); v.trainId = t.id;
      if (typeof g.deleteSample === "function") g.deleteSample(t.id);
      return true;
    }
    return false;
  }

  /* ---------- event screen: anemometer once per event + export ---------- */
  function anemFieldsHtml(ev, pfx) {
    const q = ev.ventEquip || {}, id = k => pfx + k.charAt(0).toUpperCase() + k.slice(1), ph = C().photos, certs = q.certPhotos || [];
    const ch = (val, label) => `<button type="button" class="chip va-choice ${q.ownership === val ? "on" : ""}" data-vt-eqset="ownership" data-vt-val="${val}" aria-pressed="${q.ownership === val}">${label}</button>`;
    const inp = (k, label, ph2, extra) => `<div><label for="${id(k)}">${label}</label><input id="${id(k)}" data-vt-eq="${k}" value="${esc(q[k])}" placeholder="${esc(ph2)}" autocomplete="off" ${extra || ""}></div>`;
    const w = calWarnings(ev);
    return `<label>Owned or hired?</label><div class="va-choices">${ch("owned", "Owned")}${ch("hired", "Hired")}</div>
      ${q.ownership === "hired" ? `<div class="vt-grid2">${inp("supplier", "Supplier", "Airmet")}</div>` : ""}
      <div class="vt-grid3">${inp("make", "Make", "e.g. TSI")}${inp("model", "Model", "e.g. 9545 VelociCalc")}${inp("serial", "Serial", "Serial number")}</div>
      <div class="vt-grid3">${inp("calDate", "Last calibration date", "YYYY-MM-DD", 'inputmode="numeric"')}${inp("calDue", "Calibration due date", "YYYY-MM-DD", 'inputmode="numeric"')}<div></div></div>
      <div class="va-cal">${inp("calCorr", "Calibration correction (m/s)", "e.g. +0.02 or 0", 'inputmode="decimal"')}<span>m/s at</span>${inp("calAt", "Reference (m/s)", "e.g. 0.50", 'inputmode="decimal"')}<span>m/s</span></div>
      <p class="help">Correction from the certificate: the amount to <b>add</b> to each reading (0 if none). Fume cupboard audit figures include it (AS/NZS 2243.8 Figure A1 notes 3). Calibrated within the past 12 months (B3).</p>
      <div class="va-cert ${certs.length ? "" : "va-cert-need"}"><b>📄 Photo of calibration certificate</b>${certs.length ? "" : ` <span class="vt-req">please take one</span>`}
        <div class="vt-photos">${certs.map((ref, i) => `<div class="vt-photo">${ph && ph.imgTag ? ph.imgTag(ref, "Calibration certificate " + (i + 1)) : ""}<button type="button" class="btn ghost" data-vt-certdel="${i}">Remove</button></div>`).join("")}</div>
        <label class="btn mid vt-take">📷 Photo of calibration certificate<input type="file" accept="image/*" capture="environment" data-vt-cert="${esc(ev.id)}" hidden></label></div>
      <div class="va-calwarn" data-vt-calwarn="1">${w.length ? w.map(x => `<div class="vt-warn">⚠ ${esc(x)}</div>`).join("") : `<div class="vt-okchip" style="display:inline-block">Calibration details complete</div>`}</div>`;
  }
  function equipHtml(ev) {
    const q = ev.ventEquip || {};
    const done = !!(str(q.serial).trim() || str(q.model).trim());
    return `<div class="card vt-equip" id="vtEquip"><h3 class="vt-h">Anemometer <span class="${done ? "vt-okchip" : "vt-req"}">${done ? "entered" : "enter once for this event"}</span></h3>
      ${anemFieldsHtml(ev, "vtEq")}
      <p class="help">Used for every measurement on this event. Typed in for now (a Podio pick list may come later). Warnings never block.</p></div>`;
  }
  const eqFocus = new Map();
  function eqInput(e) {
    const el = e.target; if (!el || !el.dataset || !el.dataset.vtEq) return false;
    const v = view(); const ev = C().eventById(v.eventId); if (!isVentEvent(ev)) return true;
    ev.ventEquip = Object.assign({ make: "", model: "", serial: "" }, ev.ventEquip || {});
    if (e.type === "focusin") { eqFocus.set(el, el.value); return true; }
    ev.ventEquip[el.dataset.vtEq] = el.value.trim();
    if (e.type === "change") {
      const old = eqFocus.has(el) ? eqFocus.get(el) : ""; if (str(old).trim() !== el.value.trim()) evNote(ev, "Anemometer " + el.dataset.vtEq, (str(old).trim() || "blank") + " → " + (el.value.trim() || "blank"));
      eqFocus.set(el, el.value);
      const chip = document.querySelector("#vtEquip h3 span"); const done = !!(ev.ventEquip.serial || ev.ventEquip.model);
      if (chip) { chip.className = done ? "vt-okchip" : "vt-req"; chip.textContent = done ? "entered" : "enter once for this event"; }
      (C().trainsOf(ev.id) || []).forEach(y => { if (isVent(y) && y.vent) sync(y); });
      document.querySelectorAll("[data-vt-calwarn]").forEach(box => { const w = calWarnings(ev); box.innerHTML = w.length ? w.map(x => `<div class="vt-warn">⚠ ${esc(x)}</div>`).join("") : `<div class="vt-okchip" style="display:inline-block">Calibration details complete</div>`; });
      save();
      if (v.page === "vent" && curVent()) C().render();
      return true;
    }
    save();
    if (v.page === "vent") { const t = curVent(); if (t) softPaint(t); }
    return true;
  }
  function summaryRows(eventId) {
    return ventsOf(eventId).filter(t => t.vent.type !== "visual").map(t => {
      const x = t.vent, s = stats(t), q = gridOf(t), c = stdCheck(t);
      return { t, unit: str(x.unit).trim(), condition: str(x.condition).trim() || (q ? "" : str(x.location).trim()), n: s.n, avg: s.n ? f2(s.avg) : "", min: s.n ? f2(s.min) : "", max: s.n ? f2(s.max) : "",
        range: below05Range(t), width: q ? str(q.widthMm) : "", height: q ? str(q.heightMm) : "",
        grid: q && gridN(q) ? q.cols + " × " + q.rows : "", gapX: q && gridN(q) && q.basis !== "manual" && q.cols > 1 ? String(q.gapX) : "", gapY: q && gridN(q) && q.basis !== "manual" && q.rows > 1 ? String(q.gapY) : "",
        basis: q ? (gridN(q) ? (q.basis === "manual" ? "Manual" + (str(q.reason).trim() ? ": " + str(q.reason).trim() : "") : STD.ref) : "") : typeName(x.type),
        check: q && c ? (c.ok ? "Meets" : "Does not meet") : "",
        smoke: q ? (() => { const sm = smokeOf(t); return sm.done ? RATE[sm.worst] + (sm.compliant ? " (compliant)" : " (non-compliant)") : sm.dangerous ? "Dangerous (non-compliant)" : ""; })() : "",
        overall: q ? overall(t) : "", fc: q ? str(x.location).trim() : "" };
    });
  }
  function summaryHtml(ev) {
    const rows = summaryRows(ev.id); if (!rows.length) return "";
    return `<div class="card vt-card" id="vtSummary"><h3 class="vt-h">Velocity summary</h3><div class="vg-scroll"><table class="vg-sum"><thead><tr><th>Unit</th><th>Condition</th><th>n</th><th>Avg</th><th>Min</th><th>Max</th><th>&lt;0.5 m/s at</th><th>Opening (mm)</th><th>Grid · spacing (mm)</th><th>2243.8</th><th>Smoke</th><th>Overall</th></tr></thead><tbody>`
      + rows.map(r => `<tr onclick="openTrain('${esc(r.t.id)}')"><td>${esc(r.unit || "—")}</td><td>${esc(r.condition || "—")}</td><td>${r.n || ""}</td><td>${r.avg}</td><td>${r.min}</td><td>${r.max}</td><td>${esc(r.range)}</td><td>${r.width && r.height ? esc(r.width + " × " + r.height) : ""}</td><td>${esc(r.grid)}${r.gapX || r.gapY ? " · " + esc((r.gapX || "–") + " × " + (r.gapY || "–")) : r.grid && gridOf(r.t).basis === "manual" ? " · manual" : ""}</td><td class="${r.check === "Meets" ? "vg-tpass" : r.check ? "vg-tfail" : ""}">${esc(r.check)}</td><td>${esc(r.smoke)}</td><td class="${r.overall === "Compliant" ? "vg-tpass" : r.overall === "Non-compliant" ? "vg-tfail" : ""}">${esc(r.overall)}</td></tr>`).join("")
      + `</tbody></table></div><p class="help">Velocities in m/s. Spacing is horizontal × vertical between grid lines (${STD.ref}). 2243.8 = ${STD.pass} indicator (average ≥ 0.5 m/s, no point &lt; 0.3 m/s). Smoke = AS/NZS 2243.8 Appendix A worst score (A6). Audit readings include the anemometer calibration correction.</p>${(() => { const cs = calSummary(ev); return `<p class="help" id="vtAnemSum"><b>Anemometer:</b> ${esc(cs.text || "not entered")} · <span class="${cs.warnings.length ? "vt-warn" : "vg-tpass"}">${esc(cs.status)}</span></p>`; })()}</div>`;
  }
  function ventsOf(eventId) { return (C().trainsOf(eventId) || []).filter(t => isVent(t) && t.vent && t.status !== "not_used").sort((a, b) => (Number(a.sampleNo) || 0) - (Number(b.sampleNo) || 0)); }
  function paintEvent() {
    const v = view(); if (!v || v.page !== "event") return;
    const ev = C().eventById(v.eventId); if (!isVentEvent(ev)) return;
    if (!document.getElementById("vtEquip")) {
      const btn = document.getElementById("btnAddSampleTop"); const row = btn && (btn.closest(".row") || btn.parentElement);
      if (row) row.insertAdjacentHTML("afterend", equipHtml(ev));
    }
    const ex = document.getElementById("vtSummary"); const sh = summaryHtml(ev);
    if (ex) ex.outerHTML = sh; else { const eq = document.getElementById("vtEquip"); if (eq && sh) eq.insertAdjacentHTML("afterend", sh); }
    const menu = document.getElementById("eventMenu");
    if (menu && !menu.querySelector("[data-vt-export]")) menu.insertAdjacentHTML("afterbegin", `<button type="button" data-vt-export="${esc(ev.id)}">Export vent survey CSV</button>`);
  }

  /* ---------- wording: measurements, not samples (display only, on vent events) ---------- */
  function meas(s) {
    return s.replace(/\bSAMPLES\b/g, "MEASUREMENTS").replace(/\bSAMPLE\b/g, "MEASUREMENT").replace(/\bSamples\b/g, "Measurements").replace(/\bSample\b/g, "Measurement")
      .replace(/\bsamples\b/g, "measurements").replace(/\bsample\b/g, "measurement");
  }
  function rewrite(root, keep) {
    if (!root) return;
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const todo = []; let nd;
    while ((nd = tw.nextNode())) {
      if (!/sample/i.test(nd.nodeValue)) continue;
      const p = nd.parentElement; if (!p || /^(SCRIPT|STYLE|TEXTAREA|INPUT)$/.test(p.tagName)) continue;
      if (keep && keep(p)) continue;
      todo.push(nd);
    }
    todo.forEach(x => { x.nodeValue = meas(x.nodeValue); });
  }
  function wording() {
    const v = view(); if (!v) return;
    const app = document.getElementById("app"); if (!app) return;
    if (v.page === "event" || v.page === "pickType" || v.page === "vent") {
      const ev = C().eventById(v.eventId); if (!isVentEvent(ev)) return;
      /* a non-vent sample on a vent event (made before vent.js, or by hand) keeps its sample wording */
      rewrite(app, p => { const row = p.closest(".train[onclick]"); if (!row) return false; const m = /openTrain\('([^']+)'\)/.exec(row.getAttribute("onclick") || ""); const t = m && (C().db().trains || []).find(x => x.id === m[1]); return !!t && !isVent(t); });
      const fab = document.querySelector(".fab"); if (fab && /Add sample/i.test(fab.textContent)) fab.innerHTML = "<b>+</b>Add measurement";
      const ns = document.querySelector('nav.bnav [data-go="add"] span'); if (ns && /^sample$/i.test(ns.textContent.trim())) ns.textContent = "Measure";
    } else if (v.page === "project") {
      app.querySelectorAll(".card[onclick*=\"openEvent(\"]").forEach(card => {
        const m = /openEvent\('([^']+)'\)/.exec(card.getAttribute("onclick") || ""); const ev = m && C().eventById(m[1]);
        if (isVentEvent(ev)) rewrite(card);
      });
    }
  }

  /* ---------- Mark event complete / COC on vent events ---------- */
  function ventOnly(ev) { const ts = C().trainsOf(ev.id) || []; return ts.length > 0 && ts.every(isVent); }
  function markComplete(id, inner) {
    const ev = C().eventById(id);
    if (!isVentEvent(ev) || !(C().trainsOf(id) || []).some(isVent)) return inner();
    const vents = (C().trainsOf(id) || []).filter(t => isVent(t) && t.status !== "not_used");
    const bad = vents.filter(t => !complete(t));
    if (bad.length) { alert("This event cannot be marked complete until every measurement is complete.\n\n" + bad.map(t => dn(t) + ": " + missing(t).join(", ")).join("\n")); return; }
    const q = ev.ventEquip || {};
    if (!str(q.serial).trim() && !str(q.model).trim() && !confirm("No anemometer is entered on this event.\n\nMark the event complete anyway?")) return;
    if (!ventOnly(ev)) return inner();   /* other samples on the event: the normal checks (and COC offer) carry on */
    ev.uploadReady = true;
    evNote(ev, "Marked event complete", vents.length + " vent measurement" + (vents.length === 1 ? "" : "s") + " complete");
    save(); C().render();
    alert("Event marked complete.\n\nVent surveys have no lab samples, so there is no COC. Use ☰ > Export vent survey CSV for the field sheet.");
  }

  /* ---------- export (Drive field sheet columns) ---------- */
  /* CSV laid out like the 0019340 field sheet (Sheet1 columns, stats and comments on the first row of each block),
     then a summary block like its Summary tab; app-only columns sit to the right so the sheet columns paste straight in. */
  const SHEET_COLS = ["Extraction Unit/Equipment", "Measurement Number", "Measured Velocity (m/s)", "Average Velocity (m/s)", "Lowest Recorded Velocity (m/s)", "Highest Recorded Velocity (m/s)", "Distance From Extraction Face at which velocity < 0.5 m/s (m)", "Comments"];
  const APP_COLS = ["Unit", "Operating Condition", "LEV/Hood Type", "Hood Make", "Hood Model", "Hood Serial", "Measurement Type", "Measurement Location", "Distance From Extraction Face (cm)", "Point Label", "Grid Basis", "Opening Width (mm)", "Opening Height (mm)", "Grid (columns x rows)", "Horizontal Spacing (mm)", "Vertical Spacing (mm)", "Manual Grid Reason", "AS/NZS 2243.8 cl 3.1.2", "Photos", "Anemometer", "Field app measurement", "Raw Reading (m/s)", "Calibration Correction (m/s)", "Point Min During Reading (m/s)", "Point Max During Reading (m/s)", "Previous Point No.", "Smoke Test Result (A6)", "Overall (Smoke + cl 3.1.2)", "Location", "Installation", "Fume Cupboard Empty", "Anemometer Owned/Hired", "Anemometer Supplier", "Last Calibration", "Calibration Due", "Calibration Check"];
  const SUM_COLS = ["Extraction Unit", "Number of Measurements", "Average Velocity (m/s)", "Lowest Recorded Velocity (m/s)", "Highest Recorded Velocity (m/s)", "Distance From Extraction Face at which velocity < 0.5 m/s (m)", "Operating Condition", "Opening Width (mm)", "Opening Height (mm)", "Grid (columns x rows)", "Horizontal Spacing (mm)", "Vertical Spacing (mm)", "Grid Basis", "AS/NZS 2243.8 cl 3.1.2", "Smoke Test Result (A6)", "Overall (Smoke + cl 3.1.2)"];
  function csvRows(eventId) {
    const ev = C().eventById(eventId); if (!ev) return [];
    const qe = ev.ventEquip || {}; const anem = [qe.make, qe.model].filter(Boolean).join(" ") + (qe.serial ? " SN " + qe.serial : "");
    const rows = [SHEET_COLS.concat(APP_COLS)], blank = n => Array(n).fill("");
    const sums = summaryRows(eventId); const sumOf = t => sums.find(r => r.t === t);
    ventsOf(eventId).forEach(t => {
      const x = t.vent, s = stats(t), q = gridOf(t), r = sumOf(t), c = stdCheck(t);
      const unitCell = [str(x.unit).trim(), str(x.condition).trim()].filter(Boolean).join(" – ");
      const statCells = [s.n ? f2(s.avg) : "", s.n ? f2(s.min) : "", s.n ? f2(s.max) : ""];
      const cal = calOf(t);
      const pt = i => q && i != null ? [str(q.v[ptKey(i)]), cal.set ? cal.raw : "", str(q.lo[ptLoKey(i)]), str(q.hi[ptHiKey(i)]), legacyNo(q, i) || ""] : blank(5);
      const cs = calSummary(ev);
      const anemCols = [qe.ownership === "hired" ? "Hired" : qe.ownership === "owned" ? "Owned" : "", qe.ownership === "hired" ? (qe.supplier || "") : "", qe.calDate || "", qe.calDue || "", cs.status];
      const tail = () => (q ? [r ? r.smoke : "", r ? r.overall : "", x.location, x.install === "new" ? "New" : x.install === "existing" ? "Existing" : "", x.empty === "yes" ? "Yes" : x.empty === "no" ? "No" : ""] : blank(5)).concat(anemCols);
      const app = (label, first, i) => first ? [x.unit, x.condition, x.hood, x.hoodMake, x.hoodModel, x.hoodSerial, typeName(x.type), x.location, q ? "" : x.distanceCm, label,
        r ? r.basis : "", r ? r.width : "", r ? r.height : "", r ? r.grid : "", r ? r.gapX : "", r ? r.gapY : "", q && q.basis === "manual" ? q.reason : "", q && c ? (c.ok ? "Meets" : "Does not meet") : "", (x.photos || []).length || "", anem, dn(t)].concat(pt(i), tail())
        : blank(9).concat([label], blank(11), pt(i), blank(10));
      if (q) {
        const N = gridN(q);
        if (!N) { rows.push([unitCell, "", ""].concat(statCells, ["", x.comments], app("", true))); return; }
        /* A, B, C… across rows (Figure A1 note 4); Measured Velocity includes the calibration correction (note 3) */
        for (let o = 0; o < N; o++) {
          const i = idxOf(o, q.cols, q.rows), num = pointLabel(q, i), d = str(q.d[ptDKey(i)]), cv = corrected(q, i, cal.k), vv = cv == null ? str(q.v[ptKey(i)]) : f2(cv), lab = customLabel(q, i);
          rows.push(o === 0 ? [unitCell, num, vv].concat(statCells, [d, x.comments], app(lab, true, i)) : ["", num, vv, "", "", "", d, ""].concat(app(lab, false, i)));
        }
        return;
      }
      const reads = (x.readings || []).map(v => str(v).trim()).filter(v => v !== "");
      if (!reads.length) rows.push([unitCell, "", ""].concat(statCells, [x.below05, x.comments], app("", true)));
      reads.forEach((v, i) => rows.push(i === 0 ? [unitCell, "1", v].concat(statCells, [x.below05, x.comments], app("", true)) : ["", String(i + 1), v, "", "", "", "", ""].concat(app("", false))));
    });
    if (sums.length) {
      rows.push([]); rows.push(["Summary"]); rows.push(SUM_COLS);

      sums.forEach(r => rows.push([r.unit, r.n || "", r.avg, r.min, r.max, r.range, r.condition, r.width, r.height, r.grid, r.gapX, r.gapY, r.basis, r.check, r.smoke, r.overall]));
      const cs = calSummary(ev); rows.push(["Anemometer", cs.text, "Calibration check", cs.status]);
    }
    /* one Figure A1 record per fume cupboard audit (AS/NZS 2243.8:2014 "Reporting of velocity and smoke test results") */
    ventsOf(eventId).filter(t => gridOf(t)).forEach(t => {
      const x = t.vent, q = gridOf(t), sm = smokeOf(t), s = stats(t), va = variation(t), cal = calOf(t), N = gridN(q);
      rows.push([]); rows.push(["AS/NZS 2243.8:2014 Figure A1 record", dn(t) + (str(x.condition).trim() ? " · " + str(x.condition).trim() : "")]);
      rows.push(["Location", x.location]); rows.push(["F/C Number", x.unit]); rows.push(["Type", x.hood]);
      rows.push(["Installation", x.install === "new" ? "New (A4.1.3 / B4.1.3: tested empty)" : x.install === "existing" ? "Existing (A4.1.2 / B4.1.2: normal working conditions)" : ""]);
      rows.push(["SMOKE TEST"]); rows.push(["Fume cupboard empty", x.empty === "yes" ? "Yes" : x.empty === "no" ? "No (plan or photo attached)" : ""]);
      if (x.empty === "no" && str(x.equipNote).trim()) rows.push(["Equipment plan", x.equipNote]);
      rows.push(["Smoke source used", x.smokeSource]);
      rows.push(["Test position", "Result", "Comments", "Photos", "Clause"]);
      sm.rows.forEach(z => rows.push([z.row.name, z.r === "NA" ? "N/A" : z.r, z.c, z.photos.length || "", z.row.step]));
      rows.push(["Smoke observations (A4.2(l))", smokeObs(t)]);
      rows.push(["Smoke test result (A6, worst score)", sm.worst ? RATE[sm.worst] : "", sm.done ? (sm.compliant ? "Compliant" : "Non-compliant") : sm.dangerous ? "Non-compliant" : "Not finished"]);
      rows.push(["FACE VELOCITY"]);
      rows.push(["Face opening width (mm)", q.widthMm, "Height (mm)", q.heightMm, "No. of readings", s.n]);
      if (q.basis === "manual") rows.push(["Grid", "Manual " + q.cols + " × " + q.rows, "Reason", q.reason]);
      else rows.push(["Grid (B4.2(c))", N ? q.cols + " × " + q.rows : "", "Horizontal spacing (mm)", q.cols > 1 ? q.gapX : "", "Vertical spacing (mm)", q.rows > 1 ? q.gapY : ""]);
      rows.push(["Instrument", anem.replace(/ SN .*$/, ""), "Serial no.", qe.serial || ""]);
      rows.push(["Calibration correction factor", cal.set ? cal.raw + " m/s at " + (cal.at || "") + " m/s" : ""]);
      rows.push(["Anemometer", qe.ownership === "hired" ? "Hired" : qe.ownership === "owned" ? "Owned" : "", "Supplier", qe.ownership === "hired" ? (qe.supplier || "") : "", "Calibration certificate photo", (qe.certPhotos || []).length ? "Yes" : "No"]);
      rows.push(["Last calibration date", qe.calDate || "", "Calibration due date", qe.calDue || "", "Calibration check", calSummary(ev).status]);
      const ords = Array.from({ length: N }, (_, o) => idxOf(o, q.cols, q.rows));
      const lohi = (i, w) => { const n = numOf(w === "lo" ? q.lo[ptLoKey(i)] : q.hi[ptHiKey(i)]); return n == null ? "" : f2(r2(n + cal.k)); };
      rows.push(["Results"].concat(ords.map(i => pointId(q, i))));
      rows.push(["Reading (m/s)"].concat(ords.map(i => { const v = corrected(q, i, cal.k); return v == null ? "" : f2(v); })));
      if (ords.some(i => lohi(i, "hi"))) rows.push(["Maximum (m/s)"].concat(ords.map(i => lohi(i, "hi"))));
      if (ords.some(i => lohi(i, "lo"))) rows.push(["Minimum (m/s)"].concat(ords.map(i => lohi(i, "lo"))));
      if (ords.some(i => legacyNo(q, i))) rows.push(["Previous point no."].concat(ords.map(i => legacyNo(q, i) || "")));
      rows.push(["Total mean value / Average face velocity (m/s)", s.n ? f2(s.avg) : "", "Maximum (m/s)", s.n ? f2(s.max) : "", "Minimum (m/s)", s.n ? f2(s.min) : ""]);
      rows.push(["No. of points", N || "", "Max. variation of readings from average (%)", va.pct != null ? va.pct : ""]);
      rows.push(["Face velocity (cl 3.1.2: average >= 0.5 m/s, every point >= 0.3 m/s)", fvResult(t) == null ? "" : fvResult(t) ? "Meets" : "Does not meet"]);
      rows.push(["Overall (smoke test + face velocity)", overall(t)]);
      rows.push(["Comments/conclusions", x.comments]);
      rows.push(["Tested by (print)", x.testedBy, "Date", (ev && ev.date) || ""]);
      rows.push(["Notes", "All readings in m/s. Average to two decimal places. All figures reported include the calibration correction factor. Points A, B, C… start top left and work across rows."]);
    });
    return rows;
  }
  function exportCsv(eventId) {
    const ev = C().eventById(eventId); if (!ev) return;
    const csv = csvRows(eventId).map(r => r.map(v => `"${str(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const name = (ev.code || "event") + "_Ventilation_Survey.csv";
    if (typeof g.downloadText === "function") g.downloadText(name, csv);
    else { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
    evNote(ev, "Vent survey CSV exported", name); save();
    return csv;
  }

  /* ---------- install: wrappers beside noise.js (only vent events / vent measurements; everything else passes through) ---------- */
  function wrap(name, make) { const prev = g[name]; if (typeof prev !== "function") return; const w = make(prev); w.__vent = true; g[name] = w; }
  function install() {
    if (g.__vent4819) return; g.__vent4819 = true;
    wrap("pickTypeHtml", p => function () { return isVentEvent(curEvent()) ? pickHtml() : p.apply(this, arguments); });
    wrap("openTrain", p => function (id) { const t = (C().db().trains || []).find(x => x.id === id); if (isVent(t)) return openVent(id); return p.apply(this, arguments); });
    wrap("kindLabel", p => function (t) { return isVent(t) ? "Vent · " + typeName((t.vent || {}).type || pendingType) : p.apply(this, arguments); });
    wrap("displayNo", p => function (t) { return isVent(t) ? dn(t) : p.apply(this, arguments); });
    wrap("titleLine", p => function (t) { return isVent(t) ? esc(titleOf(t)) : p.apply(this, arguments); });
    wrap("summaryLine", p => function (t) { return isVent(t) ? esc(summaryOf(t)) : p.apply(this, arguments); });
    wrap("displayStatus", p => function (t) { if (t && typeof t === "object" && isVent(t) && t.status !== "not_used" && t.status !== "rejected") return complete(t) ? "sample_complete" : started(t) ? "incomplete_blank" : "prepped"; return p.apply(this, arguments); });
    wrap("sampleStage", p => function (t) { if (isVent(t) && t.status !== "not_used") return complete(t) ? "ev_complete" : started(t) ? "ev_needs" : "ev_prepped"; return p.apply(this, arguments); });
    wrap("startGaps", p => function (t) { return isVent(t) ? [] : p.apply(this, arguments); });
    wrap("followUpComplete", p => function (t) { return isVent(t) ? complete(t) : p.apply(this, arguments); });
    wrap("answerItems", p => function (t) { return isVent(t) ? [] : p.apply(this, arguments); });
    wrap("markEventUpload", p => function (id) { const self = this, args = arguments; return markComplete(id, () => p.apply(self, args)); });
    wrap("createCoc", p => async function () {
      const ev = curEvent();
      if (isVentEvent(ev) && ventOnly(ev)) { alert("Vent surveys have no lab samples, so there is no COC.\n\nUse ☰ > Export vent survey CSV for the field sheet."); return false; }
      g.__ventCocScope = true; try { return await p.apply(this, arguments); } finally { g.__ventCocScope = false; }
    });
    wrap("trainsOf", p => function () { const r = p.apply(this, arguments); return g.__ventCocScope && Array.isArray(r) ? r.filter(t => !isVent(t)) : r; });
    wrap("confirm", p => function (m) { try { if (typeof m === "string" && /add a new sample\?/i.test(m) && isVentEvent(curEvent())) m = m.replace(/sample/i, "measurement"); } catch (e) {} return p.call(g, m); });
    wrap("render", p => function () {
      try { flushDirty(); } catch (e) {}
      const v = view();
      const r = p.apply(this, arguments);
      try {
        if (v && v.page === "vent") {
          const t = curVent(); const app = document.getElementById("app");
          if (!t) { v.page = "event"; return p.apply(this, arguments); }
          if (app) app.innerHTML = pageHtml(t);
          const nav = document.querySelector('nav.bnav [data-go="event"]'); if (nav) { nav.disabled = false; nav.classList.add("on"); }
        } else paintEvent();
        wording();
      } catch (e) { console.warn("vent.js ui", e); }
      return r;
    });
    document.addEventListener("focusin", e => { if (!eqInput(e)) onFocus(e); }, true);
    document.addEventListener("input", e => { if (!eqInput(e)) onInput(e); }, true);
    document.addEventListener("change", e => { if (!eqInput(e)) onChange(e); }, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushDirty(); });
    g.addEventListener("pagehide", flushDirty);
    document.addEventListener("click", e => { onClick(e); });
    /* remember which "Help me decide" panels are open so a re-render after a tap keeps them open */
    document.addEventListener("toggle", e => { const d = e.target; if (!d || !d.dataset || !d.dataset.vaHelp) return; const t = curVent(); if (!t) return; const key = t.id + ":" + d.dataset.vaHelp; if (d.open) helpOpen.add(key); else helpOpen.delete(key); }, true);
    const st = document.createElement("style");
    st.textContent = ".vt-card{margin-top:12px}.vt-h{margin:0 0 6px;color:var(--navy)}.vt-grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}.vt-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 10px}"
      + "@media (max-width:599px){.vt-grid3{grid-template-columns:1fr}.vt-grid2{grid-template-columns:1fr}}"
      + ".vt-reads{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin:6px 0 10px}.vt-read{display:flex;align-items:center;gap:6px}.vt-read input{min-width:0;flex:1}"
      + ".vt-n{min-width:24px;text-align:right;font-weight:700;opacity:.8}"
      + ".vt-stats{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:flex-end;margin-top:10px;padding:10px;border-radius:10px;background:rgba(255,255,255,.06)}.vt-stats div{display:flex;flex-direction:column}.vt-stats span{font-size:12px;opacity:.75}.vt-stats b{font-size:20px}.vt-stats .vt-unit{opacity:.75}.vt-empty{display:block;opacity:.75}"
      + ".vt-checks{margin:10px 0;padding:10px;border-radius:10px;border:2px solid #FFB020}.vt-checks.vt-ok{border-color:#3BB273;font-weight:700}.vt-miss{font-weight:700}.vt-warn{color:#FFC861;font-weight:700}"
      + ".vt-req{font-size:11px;font-weight:700;background:#3A2A0E;color:#FFC861;border-radius:999px;padding:1px 8px;margin-left:6px}.vt-okchip{font-size:11px;font-weight:700;background:#123A22;color:#7BE0A4;border-radius:999px;padding:1px 8px;margin-left:6px}"
      + ".vt-photos{display:flex;flex-wrap:wrap;gap:10px;margin:8px 0}.vt-photo{max-width:180px}.vt-photo img{max-width:100%;border-radius:8px;display:block}.vt-take{display:inline-block;margin-top:8px}.vt-audit{margin-top:16px}.vt-audit summary{cursor:pointer;font-weight:700}.vt-del{color:var(--danger,#FF7A7A)}"
      + ".vg-scroll{overflow-x:auto;max-width:100%;-webkit-overflow-scrolling:touch}.vg-grid{display:grid;gap:6px;margin:6px 0 10px}.vg-colh{font-size:12px;font-weight:700;opacity:.75;text-align:center;text-transform:capitalize}"
      + ".vg-cell{border:2px solid rgba(255,255,255,.18);border-radius:10px;padding:5px;display:flex;flex-direction:column;gap:4px;min-width:0}.vg-cell input{min-width:0;width:100%;box-sizing:border-box;font-size:16px;padding:6px}.vg-cell .vg-d{font-size:13px;padding:4px 6px}"
      + ".vg-num{font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.vg-num span{font-weight:400;opacity:.75;font-size:11px}.vg-low{border-color:#FF6B6B}.vg-mid{border-color:#FFB020}.vg-ok{border-color:#3BB273}"
      + ".vg-geom{margin:6px 0}.vg-manual{margin-top:8px;padding:10px;border-radius:10px;border:1px dashed rgba(255,255,255,.35)}.vg-manbtn{white-space:nowrap}.vg-fans{display:flex;gap:8px;margin:4px 0 8px}.vg-fans .chip{min-width:44px;min-height:40px;font-weight:700}.vg-fans .chip.on{outline:2px solid #3BB273}"
      + ".vg-std{margin-top:10px;padding:10px;border-radius:10px;border:2px solid rgba(255,255,255,.2)}.vg-pass{border-color:#3BB273}.vg-fail{border-color:#FF6B6B}"
      + ".vg-labels{margin:6px 0}.vg-labels summary{cursor:pointer;font-weight:700}.vg-lablist{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px}.vg-lab{display:flex;align-items:center;gap:6px}.vg-lab span{min-width:24px;text-align:right;font-weight:700}.vg-lab input{flex:1;min-width:0}"
      + ".vg-sum{border-collapse:collapse;width:100%;font-size:13px}.vg-sum th,.vg-sum td{padding:5px 6px;border-bottom:1px solid rgba(255,255,255,.15);text-align:left;white-space:nowrap}.vg-sum tbody tr{cursor:pointer}.vg-tpass{color:#7BE0A4;font-weight:700}.vg-tfail{color:#FF8A8A;font-weight:700}"
      + ".va-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:10px 0 4px}.va-step{display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 2px;border-radius:10px;border:2px solid rgba(255,255,255,.18);background:transparent;color:inherit;font-size:12px;font-weight:700;cursor:pointer;min-height:52px}"
      + ".va-step span{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,.12);font-size:13px}.va-step.on{border-color:#5B8DEF;background:rgba(91,141,239,.16)}.va-step.done span{background:#3BB273;color:#06210f}"
      + ".va-cite{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.2px;color:#9FC1FF;background:rgba(91,141,239,.14);border-radius:6px;padding:0 6px;margin-left:2px;white-space:nowrap}.va-h4{margin:14px 0 4px;color:var(--navy)}.va-typel{margin-top:6px}"
      + ".va-rule{margin:8px 0;padding:8px 10px;border-left:4px solid #5B8DEF;background:rgba(91,141,239,.08);border-radius:6px}.va-choices{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 8px}.va-choice{min-height:42px;padding:0 14px;font-weight:700}.chip.on{outline:2px solid #3BB273}"
      + ".va-sub{margin:6px 0 10px;padding:8px 10px;border:1px dashed rgba(255,255,255,.3);border-radius:10px}.va-proc{margin:6px 0;padding-left:20px}"
      + ".va-row{margin:10px 0;padding:10px;border-radius:10px;border:2px solid rgba(255,255,255,.15)}.va-row.va-xG{border-color:#3BB273}.va-row.va-xS{border-color:#FFB020}.va-row.va-xD{border-color:#FF6B6B}.va-row.va-xNA{border-style:dashed}.va-rowh{margin-bottom:2px}"
      + ".va-rates{display:flex;gap:8px;margin:6px 0}.va-rate{min-width:52px;min-height:44px;font-weight:800;font-size:16px}.va-rG.on{background:#123A22;color:#7BE0A4}.va-rS.on{background:#3A2A0E;color:#FFC861}.va-rD.on{background:#3A1212;color:#FF8A8A}.va-rNA{font-size:13px}"
      + ".va-row input{width:100%;box-sizing:border-box}.va-row .vt-photos{margin:6px 0 0}.va-gate{margin:8px 0;padding:12px;border-radius:10px;border:2px solid #FFB020;background:rgba(255,176,32,.08)}"
      + ".va-cal{display:flex;flex-wrap:wrap;align-items:flex-end;gap:6px 10px}.va-cal>div{flex:1 1 120px}.va-cal>span{padding-bottom:12px;opacity:.8}.vg-cor{font-size:12px;opacity:.8;min-height:14px}.vg-was{opacity:.6;font-size:10px}.vg-lohi input{width:80px;flex:1}"
      + ".va-sum{display:grid;gap:8px;margin:6px 0}.va-sum>div{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.va-sum span:first-child{min-width:110px;font-weight:700}.va-pill{padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.1);font-weight:700}.va-pill.ok{background:#123A22;color:#7BE0A4}.va-pill.bad{background:#3A1212;color:#FF8A8A}"
      + ".va-a1{margin:12px 0;padding:10px;border-radius:10px;background:rgba(255,255,255,.04)}.va-a1 h5{margin:12px 0 4px}.va-kv{border-collapse:collapse;width:100%;font-size:13px}.va-kv th{text-align:left;padding:4px 8px 4px 0;width:45%;vertical-align:top;opacity:.85}.va-kv td{padding:4px 0}"
      + ".va-res{font-weight:800}.va-res.va-xG{color:#7BE0A4}.va-res.va-xS{color:#FFC861}.va-res.va-xD{color:#FF8A8A}.va-res-t td,.va-res-t th{text-align:center}.va-smoke td{white-space:normal}"
      + ".vt-type-img{display:flex;gap:12px;align-items:center}.vt-type-img .vt-thumb{flex:0 0 84px;width:84px;height:64px;border-radius:8px;object-fit:cover;background:#1B2440}.vt-type-img svg.vt-thumb{padding:8px;box-sizing:border-box}.vt-credit{font-size:10px;opacity:.65;margin-top:2px}.va-fig{display:flex;gap:10px;align-items:flex-start;margin:6px 0}.va-fig img,.va-fig .va-figimg{width:96px;height:72px;object-fit:cover;border-radius:8px;flex:0 0 96px}.vt-tw{display:contents}.va-q{font-weight:700;font-size:15px;line-height:1.35;margin-bottom:2px}.va-rowh.muted{font-weight:400;font-size:12px}.va-legend{display:grid;gap:2px;margin:6px 0 4px;font-size:12px;opacity:.85}.va-legend b{display:inline-block;min-width:26px}.va-worst{border-left-color:#FFB020}.va-help{margin:6px 0}.va-help summary{cursor:pointer;color:#7FB2FF;font-weight:600;padding:6px 0;min-height:32px}.va-mx{width:100%;border-collapse:collapse;font-size:13px}.va-mx th,.va-mx td{border:1px solid rgba(255,255,255,.15);padding:4px 6px;text-align:center}.va-mx tbody th{text-align:left;font-weight:500}.va-mx tr.on{background:rgba(127,178,255,.18)}.va-mx tr.on th{font-weight:700}.va-mxb{min-width:44px;min-height:36px;border-radius:8px;border:1px solid rgba(255,255,255,.35);background:transparent;color:inherit;font-weight:700}.va-mxb.on{background:#7FB2FF;color:#0b1530}.va-cl{margin-top:6px}.va-cert{margin:10px 0;padding:10px;border-radius:10px;border:2px solid rgba(255,255,255,.2)}.va-cert-need{border-color:#FFB020;background:rgba(255,176,32,.08)}.va-calwarn{margin:6px 0}";
    document.head.appendChild(st);
    try { g.render(); } catch (e) {}
  }
  if (document.readyState === "complete") setTimeout(install, 0); else g.addEventListener("load", install);

  g.ENVSS_VENT = { version: VENT_VERSION, loaded: true, isVentEvent, isVent, addMeasurement, openVent, stats, missing, complete, exportCsv, csvRows, summaryRows, gridFor, defaultLabel, letters, stdCheck, below05Range, smokeOf, overall, variation, calWarnings, missingBy, TYPES, PICK, STD, SMOKE, TYPE_IMG };
})(window);

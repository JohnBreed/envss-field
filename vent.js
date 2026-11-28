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
    ["grid", "Face velocity grid", "Grid of points across the extraction face, set out from the opening size (AS/NZS 2243.8 Appendix B). One per fan condition."],
    ["face", "Face velocity", "At the extraction face, hood opening or sash."],
    ["capture", "Capture velocity", "At the source or work position, a set distance from the face."],
    ["other", "Other velocity reading", "e.g. edge of a table, breathing zone, booth length, duct."],
    ["visual", "Visual check only", "No readings possible (e.g. fully enclosed). Describe what was seen."]
  ];
  /* the Add measurement list: the grid replaces the single-location face reading (kept only so older records still open) */
  const PICK = ["grid", "face", "capture", "other", "visual"];
  const typeName = k => (TYPES.find(a => a[0] === k) || [])[1] || "Vent measurement";
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
    if (x.grid) { ["v", "d", "label"].forEach(k => { if (!x.grid[k] || typeof x.grid[k] !== "object") x.grid[k] = {}; }); }
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
  function colName(c, cols) {
    if (cols <= 1) return "centre";
    if (c === 0) return "left"; if (c === cols - 1) return "right";
    if (cols === 3) return "centre";
    if (cols === 4) return c === 1 ? "left central" : "right central";
    return "column " + (c + 1);
  }
  function defaultLabel(i, cols, rows) {
    const c = Math.floor(i / rows), r = i % rows, cn = colName(c, cols);
    const edge = rows === 1 ? "" : r === 0 ? "Top" : r === rows - 1 ? "Bottom" : "";
    if (!edge) return rows === 1 ? cn.charAt(0).toUpperCase() + cn.slice(1) : "";
    return edge + " " + cn + (cn === "left" || cn === "right" ? " corner" : "");
  }
  function gridOf(t) { const x = (t && t.vent) || {}; return x.type === "grid" && x.grid ? x.grid : null; }
  const gridN = q => (q && q.cols > 0 && q.rows > 0 ? q.cols * q.rows : 0);
  function pointLabel(q, i) { return str(q.label[ptLKey(i)]).trim() || defaultLabel(i, q.cols, q.rows); }
  function gridVals(q) { const out = []; for (let i = 0; i < gridN(q); i++) { const n = numOf(q.v[ptKey(i)]); if (n != null) out.push(n); } return out; }
  /* AS/NZS 2243.8 cl. 3.1.2: average not less than 0.5 m/s, individual measurements not less than 0.3 m/s (indicator only) */
  function stdCheck(t) {
    const s = stats(t); if (!s.n) return null;
    const low = gridOf(t) ? gridVals(gridOf(t)).filter(n => n < 0.3).length : 0;
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
  function geomText(q) {
    if (!gridN(q)) return "";
    const pts = q.cols + " × " + q.rows + " = " + gridN(q) + " points";
    if (q.basis === "manual") return pts;
    return pts + " · horizontal spacing " + (q.cols > 1 ? q.gapX + " mm" : "single centre line") + " · vertical spacing " + (q.rows > 1 ? q.gapY + " mm" : "single centre line");
  }
  function stats(t) {
    const q0 = gridOf(t);
    const x = t.vent || {}; const vals = q0 ? gridVals(q0) : (x.readings || []).map(numOf).filter(n => n != null);
    if (!vals.length) return { n: 0, avg: null, min: null, max: null };
    const sum = vals.reduce((a, b) => a + b, 0);
    return { n: vals.length, avg: sum / vals.length, min: Math.min.apply(null, vals), max: Math.max.apply(null, vals) };
  }
  const f2 = n => (n == null ? "" : (Math.round(n * 100) / 100).toFixed(2));
  function missing(t) {
    const x = t.vent || {}, m = [];
    if (!str(x.unit).trim()) m.push("Extraction unit");
    const q = gridOf(t);
    if (q) {
      if (!str(x.condition).trim()) m.push("How many fans are running (condition)");
      if (!gridN(q)) m.push("Opening width and height (or a manual grid)");
      if (!stats(t).n) m.push("At least one grid point velocity");
      return m;
    }
    if (!str(x.location).trim()) m.push("Measurement location");
    if (x.type === "visual") { if (!str(x.comments).trim()) m.push("Comments (what was seen)"); }
    else if (!stats(t).n) m.push("At least one velocity reading");
    return m;
  }
  const complete = t => isVent(t) && !!t.vent && !missing(t).length;
  const started = t => { const x = t.vent || {}; return !!(str(x.unit).trim() || str(x.location).trim() || stats(t).n || str(x.comments).trim() || (x.photos || []).length); };
  function warnings(t) {
    const x = t.vent || {}, w = [];
    const q = gridOf(t);
    if (q) {
      const N = gridN(q); let blank = 0;
      for (let i = 0; i < N; i++) { const r = str(q.v[ptKey(i)]).trim(); if (r === "") { blank++; continue; } const n = numOf(r); if (n == null) w.push("Point " + (i + 1) + " is not a number"); else if (n < 0 || n > 50) w.push("Point " + (i + 1) + " (" + r + " m/s) looks wrong. Check it"); }
      if (N && blank && blank < N) w.push(blank + " of " + N + " points still blank");
      if (N > 150) w.push("Large grid (" + N + " points). Check the opening size");
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
      const b = [gridN(q) ? q.cols + " × " + q.rows + " grid" + (q.basis === "manual" ? " (manual)" : " (" + str(q.widthMm) + " × " + str(q.heightMm) + " mm)") : "grid not set"];
      if (s.n) { b.push(s.n + " of " + gridN(q) + " points", "avg " + f2(s.avg) + " m/s (" + f2(s.min) + "–" + f2(s.max) + ")"); const c = stdCheck(t); b.push(c.ok ? "meets 2243.8" : "below 2243.8"); }
      else b.push("no readings yet");
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
    ${TYPES.filter(a => PICK.includes(a[0])).sort((a, b) => PICK.indexOf(a[0]) - PICK.indexOf(b[0])).map(([k, name, blurb]) => `<div class="card" style="cursor:pointer" data-vt-add="${k}" onclick="ENVSS_VENT.addMeasurement('${esc(id)}','${k}')">
      <strong>Vent · ${esc(name)}</strong><div class="muted">${esc(blurb)}</div></div>`).join("")}
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
      ["unit", "hood", "hoodMake", "hoodModel", "hoodSerial", "location"].forEach(k => { if (copyFrom.vent[k] != null) x[k] = str(copyFrom.vent[k]); });
      const q0 = copyFrom.vent.grid;
      if (q0) Object.assign(x.grid, { basis: q0.basis || "standard", widthMm: str(q0.widthMm), heightMm: str(q0.heightMm), cols: q0.cols || 0, rows: q0.rows || 0, gapX: q0.gapX || 0, gapY: q0.gapY || 0, reason: str(q0.reason) });
    } else if (copyFrom && copyFrom.vent) { ["unit", "hood", "condition"].forEach(k => { x[k] = str(copyFrom.vent[k]); }); }
    if (x.type === "grid" && !str(x.location).trim()) x.location = "Extraction face";
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
    const q = gridOf(t), N = gridN(q);
    if (!N) return `<div id="vgCells"></div>`;
    let h = `<div class="vg-scroll" id="vgCells"><div class="vg-grid" style="grid-template-columns:repeat(${q.cols},minmax(84px,1fr))">`;
    for (let c = 0; c < q.cols; c++) h += `<div class="vg-colh">${esc(colName(c, q.cols))}</div>`;
    for (let r = 0; r < q.rows; r++) for (let c = 0; c < q.cols; c++) {
      const i = c * q.rows + r, v = str(q.v[ptKey(i)]), lab = pointLabel(q, i);
      h += `<div class="vg-cell ${band(numOf(v))}" data-vg-cell="${i}" title="${esc(lab)}"><div class="vg-num">${i + 1}${lab ? ` <span>${esc(lab)}</span>` : ""}</div>
        <input id="vg-v${i}" data-vg-v="${i}" value="${esc(v)}" inputmode="decimal" placeholder="m/s" autocomplete="off" aria-label="Point ${i + 1}${lab ? " " + esc(lab) : ""} velocity (m/s)">
        <input id="vg-d${i}" class="vg-d" data-vg-d="${i}" value="${esc(q.d[ptDKey(i)])}" placeholder="&lt;0.5 (m)" autocomplete="off" aria-label="Point ${i + 1} distance where velocity drops below 0.5 m/s (m)"></div>`;
    }
    h += `</div></div>`;
    return h;
  }
  function labelsHtml(t) {
    const q = gridOf(t), N = gridN(q); if (!N) return "";
    let h = `<details class="vg-labels"><summary>Point labels (optional)</summary><p class="help">Numbered down each column, then across, as on the field sheet. Leave blank to keep the default.</p><div class="vg-lablist">`;
    for (let i = 0; i < N; i++) h += `<label class="vg-lab"><span>${i + 1}</span><input id="vg-l${i}" data-vg-l="${i}" value="${esc(q.label[ptLKey(i)])}" placeholder="${esc(defaultLabel(i, q.cols, q.rows) || "Point " + (i + 1))}" autocomplete="off"></label>`;
    return h + `</div></details>`;
  }
  function gridPageHtml(t) {
    const ev = evOf(t), x = vt(t, true), q = gridOf(t), eq = (ev && ev.ventEquip) || {}, units = usedUnits(t);
    const manual = q.basis === "manual";
    const typeOpts = TYPES.filter(a => PICK.includes(a[0]) || a[0] === x.type).map(([k, n]) => `<option value="${k}" ${k === x.type ? "selected" : ""}>${esc(n)}</option>`).join("");
    const sib = (C().trainsOf(t.eventId) || []).filter(y => isVent(y) && y !== t && gridOf(y) && str(y.vent.unit).trim() && str(y.vent.unit).trim().toLowerCase() === str(x.unit).trim().toLowerCase());
    return `<div class="wrap vt-page" id="vtPage" data-vt-id="${esc(t.id)}" data-vt-grid="1">
      <button class="btn ghost" onclick="openEvent('${esc(t.eventId)}')">← Event ${ev ? esc(ev.code) : ""}</button>
      <div class="row" style="margin-top:10px;align-items:center;gap:10px"><h2 class="brand-type" style="margin:0;color:var(--navy)">${esc(dn(t))}</h2><span id="vtBadge">${badgeHtml(t)}</span></div>
      <p class="muted">${esc(typeName(x.type))}${eq.serial || eq.model ? " · anemometer " + esc([eq.make, eq.model].filter(Boolean).join(" ")) + (eq.serial ? " SN " + esc(eq.serial) : "") : ` · <span class="vt-warn">no anemometer on the event yet</span>`}</p>
      ${checksHtml(t)}
      <div class="card vt-card"><h3 class="vt-h">Extraction unit</h3>
        <label for="vt-type">Measurement type</label><select id="vt-type" data-vt="type">${typeOpts}</select>
        <label for="vt-unit">Extraction unit / equipment</label>
        <input id="vt-unit" data-vt="unit" value="${esc(x.unit)}" placeholder="e.g. Fume cupboard FC-2, Lab 1.04" autocomplete="off" list="vtUnits">
        <datalist id="vtUnits">${units.map(u => `<option value="${esc(u.vent.unit)}"></option>`).join("")}</datalist>
        ${units.length ? `<p class="help">Units already on this event: ${units.map(u => `<button type="button" class="chip" data-vt-unit="${esc(u.id)}">${esc(u.vent.unit)}</button>`).join(" ")}</p>` : ""}
        <label for="vt-hood">LEV / hood type <span class="muted">(optional)</span></label>
        <input id="vt-hood" data-vt="hood" value="${esc(x.hood)}" placeholder="e.g. Fume cupboard" autocomplete="off" list="vtHoods">
        <datalist id="vtHoods">${HOODS.map(h => `<option value="${esc(h)}"></option>`).join("")}</datalist>
        <div class="vt-grid3"><div>${field("hoodMake", "Hood make <span class=\"muted\">(optional)</span>", x.hoodMake, "e.g. Dynaflow")}</div><div>${field("hoodModel", "Model <span class=\"muted\">(optional)</span>", x.hoodModel, "Model")}</div><div>${field("hoodSerial", "Serial <span class=\"muted\">(optional)</span>", x.hoodSerial, "Serial number")}</div></div>
        ${sib.length ? `<p class="help">Other conditions on this unit: ${sib.map(y => `<a href="#" onclick="openTrain('${esc(y.id)}');return false">${esc(dn(y))}${str(y.vent.condition).trim() ? " · " + esc(y.vent.condition) : ""}</a>`).join(", ")}</p>` : ""}
      </div>
      <div class="card vt-card"><h3 class="vt-h">Condition</h3>
        <label for="vt-condition">How many fans are running?</label>
        <div class="vg-fans">${FANS.map((f, i) => `<button type="button" class="chip ${str(x.condition) === f ? "on" : ""}" data-vt-fans="${i}">${i + 1}</button>`).join("")}</div>
        <input id="vt-condition" data-vt="condition" value="${esc(x.condition)}" placeholder="e.g. Two extraction fans in operation, sash at 500 mm" autocomplete="off">
        ${field("location", "Measurement location <span class=\"muted\">(optional)</span>", x.location, "Extraction face")}
      </div>
      <div class="card vt-card" id="vgOpening"><h3 class="vt-h">Opening and grid</h3>
        <div class="vt-grid2"><div><label for="vg-w">Opening width (mm)</label><input id="vg-w" data-vg="widthMm" value="${esc(q.widthMm)}" inputmode="numeric" placeholder="e.g. 1500" autocomplete="off"></div>
        <div><label for="vg-h">Opening height (mm)</label><input id="vg-h" data-vg="heightMm" value="${esc(q.heightMm)}" inputmode="numeric" placeholder="e.g. 500" autocomplete="off"></div></div>
        ${geomHtml(t)}
        <p class="help">Grid per ${STD.ref}: points ${STD.edge} mm in from the edges of the opening, then equally spaced, not more than ${STD.maxY} mm apart vertically nor more than ${STD.maxX} mm apart horizontally, using the fewest lines that meet this.</p>
        ${manual ? `<div class="vg-manual"><b>Manual grid</b> <span class="muted">(not set out from the opening size)</span>
          <div class="vt-grid2"><div><label for="vg-cols">Columns (across)</label><input id="vg-cols" data-vg="cols" value="${esc(q.cols)}" inputmode="numeric" autocomplete="off"></div><div><label for="vg-rows">Rows (down)</label><input id="vg-rows" data-vg="rows" value="${esc(q.rows)}" inputmode="numeric" autocomplete="off"></div></div>
          <label for="vg-reason">Reason for the manual grid <span class="muted">(optional)</span></label><input id="vg-reason" data-vg="reason" value="${esc(q.reason)}" placeholder="e.g. opening size unknown, obstruction, site requirement" autocomplete="off">
          <button type="button" class="btn ghost" data-vg-standard="1">Use the standard grid from the opening size</button></div>`
        : `<button type="button" class="btn ghost vg-manbtn" data-vg-manual="1">Manual grid instead (${MANUAL_DEFAULT.cols}×${MANUAL_DEFAULT.rows} = ${MANUAL_DEFAULT.cols * MANUAL_DEFAULT.rows})</button>`}
      </div>
      <div class="card vt-card"><h3 class="vt-h">Face velocity grid (m/s)</h3>
        <p class="help">Velocity at each point, and optionally the distance from the face where it drops below 0.5 m/s (metres; any text is kept as typed).</p>
        ${cellsHtml(t)}
        ${labelsHtml(t)}
        ${gridStatsHtml(t)}
        ${stdHtml(t)}
      </div>
      <div class="card vt-card"><h3 class="vt-h">Comments and photos</h3>
        <label for="vt-comments">Comments for this condition</label><textarea id="vt-comments" data-vt="comments" rows="3" placeholder="Observations, obstructions, sash position, smoke test">${esc(x.comments)}</textarea>
        ${photosHtml(t)}
      </div>
      <div class="row vt-actions" style="gap:10px;flex-wrap:wrap;margin-top:12px">
        <button type="button" class="btn mid" data-vt-again="1">+ Another condition on this unit</button>
        <button type="button" class="btn ghost" onclick="openEvent('${esc(t.eventId)}')">Done</button>
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
    const nv = {}, nd = {}, nl = {}, lost = [];
    for (let i = 0; i < gridN(q); i++) {
      const has = [q.v[ptKey(i)], q.d[ptDKey(i)], q.label[ptLKey(i)]].some(v => str(v).trim() !== "");
      if (!has) continue;
      const c = Math.floor(i / or), r = i % or;
      if (c >= cols || r >= rows) { lost.push(i + 1); continue; }
      const j = c * rows + r;
      if (str(q.v[ptKey(i)]).trim()) nv[ptKey(j)] = q.v[ptKey(i)];
      if (str(q.d[ptDKey(i)]).trim()) nd[ptDKey(j)] = q.d[ptDKey(i)];
      if (str(q.label[ptLKey(i)]).trim()) nl[ptLKey(j)] = q.label[ptLKey(i)];
    }
    if (lost.length) {
      alert("That would change the grid to " + cols + " × " + rows + " and drop the readings already entered at point" + (lost.length === 1 ? " " : "s ") + lost.join(", ") + ".\n\nNothing has been changed. Clear those points first if the grid really is smaller.");
      return false;
    }
    const moved = gridN(q) && Object.keys(q.v).length && rows !== or;
    q.v = nv; q.d = nd; q.label = nl; q.cols = cols; q.rows = rows;
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
    document.querySelectorAll("[data-vg-cell]").forEach(el => { const i = +el.dataset.vgCell, lab = pointLabel(q, i), num = el.querySelector(".vg-num"); if (num) num.innerHTML = (i + 1) + (lab ? ` <span>${esc(lab)}</span>` : ""); el.title = lab; const n = numOf(q.v[ptKey(i)]); el.classList.remove("vg-low", "vg-mid", "vg-ok"); const b = band(n); if (b) el.classList.add(b); });
  }
  function gridInput(t, el) {
    const q = gridOf(t); if (!q) return false;
    const d = el.dataset;
    if (d.vgV != null) { const k = ptKey(+d.vgV), v = el.value.trim(); if (v) q.v[k] = v; else delete q.v[k]; return true; }
    if (d.vgD != null) { const k = ptDKey(+d.vgD), v = el.value.trim(); if (v) q.d[k] = v; else delete q.d[k]; return true; }
    if (d.vgL != null) { const k = ptLKey(+d.vgL), v = el.value.trim(); if (v) q.label[k] = v; else delete q.label[k]; return true; }
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
  function onFocus(e) { const el = e.target; if (!el || !el.dataset || !curVent()) return; if (el.dataset.vt || el.dataset.vtR != null || el.dataset.vg || el.dataset.vgV != null || el.dataset.vgD != null || el.dataset.vgL != null) focusVal.set(el, el.value); }
  function onInput(e) {
    const el = e.target; if (!el || !el.dataset) return; const t = curVent(); if (!t) return;
    const x = vt(t, true);
    if (gridInput(t, el)) {}
    else if (el.dataset.vtR != null) { const i = +el.dataset.vtR; x.readings[i] = el.value.trim(); }
    else if (el.dataset.vt && el.dataset.vt !== "type") x[el.dataset.vt] = el.value;
    else return;
    /* not committed per keystroke: the shared change audit (v40) records one entry per field when the box is left,
       exactly like the other sample screens. Leaving the box, Enter, or the app going to the background commits. */
    dirty = true; sync(t); softPaint(t);
  }
  function onChange(e) {
    const el = e.target; if (!el || !el.dataset) return; const t = curVent(); if (!t) return;
    if (el.dataset.vtTake) { onFile(t, el); return; }
    const x = vt(t, true);
    if (el.dataset.vt === "type") {
      const before = x.type; x.type = el.value; vt(t, true); if (x.type === "grid" && !str(x.location).trim()) x.location = "Extraction face";
      note(t, "Measurement type", typeName(before) + " → " + typeName(x.type)); sync(t); save(); C().render(); return;
    }
    if (gridChange(t, el)) return;
    if (gridOf(t) && (el.dataset.vgV != null || el.dataset.vgD != null || el.dataset.vgL != null || el.dataset.vg === "reason")) { focusVal.set(el, el.value); dirty = false; sync(t); save(); softPaint(t); return; }
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
      const nx = document.getElementById("vg-v" + (+el0.dataset.vgV + 1)); if (nx) nx.focus(); else el0.blur();
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
  async function onFile(t, el) {
    const file = el.files && el.files[0]; if (!file) return;
    try {
      const ph = C().photos; if (!ph || !ph.attach) { alert("Photos are not available on this device."); return; }
      const ref = await ph.attach(file, t, "ventPhoto");
      if (!ref) return;
      vt(t, true).photos.push(ref); note(t, "Vent photo added", "photo " + t.vent.photos.length); sync(t); save(); C().render();
    } catch (err) { alert("The photo could not be saved on this device: " + (err && err.message || err)); }
  }
  function onClick(e) {
    const b = e.target.closest && e.target.closest("[data-vt-addread],[data-vt-again],[data-vt-delete],[data-vt-delphoto],[data-vt-unit],[data-vt-equip-save],[data-vt-export],[data-vt-fans],[data-vg-manual],[data-vg-standard]");
    if (!b) return false;
    if (b.dataset.vtExport) { exportCsv(b.dataset.vtExport); return true; }
    if (b.dataset.vtEquipSave) return true;
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
      const i = +b.dataset.vtDelphoto, ref = x.photos[i]; if (!ref) return true;
      if (!confirm("Remove this photo from the measurement?")) return true;
      x.photos.splice(i, 1);
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
  function equipHtml(ev) {
    const q = ev.ventEquip || {};
    const done = !!(str(q.serial).trim() || str(q.model).trim());
    return `<div class="card vt-equip" id="vtEquip"><h3 class="vt-h">Anemometer <span class="${done ? "vt-okchip" : "vt-req"}">${done ? "entered" : "enter once for this event"}</span></h3>
      <div class="vt-grid3"><div><label for="vtEqMake">Make</label><input id="vtEqMake" data-vt-eq="make" value="${esc(q.make)}" placeholder="e.g. TSI" autocomplete="off"></div>
      <div><label for="vtEqModel">Model</label><input id="vtEqModel" data-vt-eq="model" value="${esc(q.model)}" placeholder="e.g. 9545 VelociCalc" autocomplete="off"></div>
      <div><label for="vtEqSerial">Serial</label><input id="vtEqSerial" data-vt-eq="serial" value="${esc(q.serial)}" placeholder="Serial number" autocomplete="off"></div></div>
      <p class="help">Used for every measurement on this event.</p></div>`;
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
    }
    save(); return true;
  }
  function summaryRows(eventId) {
    return ventsOf(eventId).filter(t => t.vent.type !== "visual").map(t => {
      const x = t.vent, s = stats(t), q = gridOf(t), c = stdCheck(t);
      return { t, unit: str(x.unit).trim(), condition: str(x.condition).trim() || (q ? "" : str(x.location).trim()), n: s.n, avg: s.n ? f2(s.avg) : "", min: s.n ? f2(s.min) : "", max: s.n ? f2(s.max) : "",
        range: below05Range(t), width: q ? str(q.widthMm) : "", height: q ? str(q.heightMm) : "",
        grid: q && gridN(q) ? q.cols + " × " + q.rows : "", gapX: q && gridN(q) && q.basis !== "manual" && q.cols > 1 ? String(q.gapX) : "", gapY: q && gridN(q) && q.basis !== "manual" && q.rows > 1 ? String(q.gapY) : "",
        basis: q ? (gridN(q) ? (q.basis === "manual" ? "Manual" + (str(q.reason).trim() ? ": " + str(q.reason).trim() : "") : STD.ref) : "") : typeName(x.type),
        check: q && c ? (c.ok ? "Meets" : "Does not meet") : "" };
    });
  }
  function summaryHtml(ev) {
    const rows = summaryRows(ev.id); if (!rows.length) return "";
    return `<div class="card vt-card" id="vtSummary"><h3 class="vt-h">Velocity summary</h3><div class="vg-scroll"><table class="vg-sum"><thead><tr><th>Unit</th><th>Condition</th><th>n</th><th>Avg</th><th>Min</th><th>Max</th><th>&lt;0.5 m/s at</th><th>Opening (mm)</th><th>Grid · spacing (mm)</th><th>2243.8</th></tr></thead><tbody>`
      + rows.map(r => `<tr onclick="openTrain('${esc(r.t.id)}')"><td>${esc(r.unit || "—")}</td><td>${esc(r.condition || "—")}</td><td>${r.n || ""}</td><td>${r.avg}</td><td>${r.min}</td><td>${r.max}</td><td>${esc(r.range)}</td><td>${r.width && r.height ? esc(r.width + " × " + r.height) : ""}</td><td>${esc(r.grid)}${r.gapX || r.gapY ? " · " + esc((r.gapX || "–") + " × " + (r.gapY || "–")) : r.grid && gridOf(r.t).basis === "manual" ? " · manual" : ""}</td><td class="${r.check === "Meets" ? "vg-tpass" : r.check ? "vg-tfail" : ""}">${esc(r.check)}</td></tr>`).join("")
      + `</tbody></table></div><p class="help">Velocities in m/s. Spacing is horizontal × vertical between grid lines (${STD.ref}). 2243.8 = ${STD.pass} indicator (average ≥ 0.5 m/s, no point &lt; 0.3 m/s).</p></div>`;
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
  const APP_COLS = ["Unit", "Operating Condition", "LEV/Hood Type", "Hood Make", "Hood Model", "Hood Serial", "Measurement Type", "Measurement Location", "Distance From Extraction Face (cm)", "Point Label", "Grid Basis", "Opening Width (mm)", "Opening Height (mm)", "Grid (columns x rows)", "Horizontal Spacing (mm)", "Vertical Spacing (mm)", "Manual Grid Reason", "AS/NZS 2243.8 cl 3.1.2", "Photos", "Anemometer", "Field app measurement"];
  const SUM_COLS = ["Extraction Unit", "Number of Measurements", "Average Velocity (m/s)", "Lowest Recorded Velocity (m/s)", "Highest Recorded Velocity (m/s)", "Distance From Extraction Face at which velocity < 0.5 m/s (m)", "Operating Condition", "Opening Width (mm)", "Opening Height (mm)", "Grid (columns x rows)", "Horizontal Spacing (mm)", "Vertical Spacing (mm)", "Grid Basis", "AS/NZS 2243.8 cl 3.1.2"];
  function csvRows(eventId) {
    const ev = C().eventById(eventId); if (!ev) return [];
    const qe = ev.ventEquip || {}; const anem = [qe.make, qe.model].filter(Boolean).join(" ") + (qe.serial ? " SN " + qe.serial : "");
    const rows = [SHEET_COLS.concat(APP_COLS)], blank = n => Array(n).fill("");
    const sums = summaryRows(eventId); const sumOf = t => sums.find(r => r.t === t);
    ventsOf(eventId).forEach(t => {
      const x = t.vent, s = stats(t), q = gridOf(t), r = sumOf(t), c = stdCheck(t);
      const unitCell = [str(x.unit).trim(), str(x.condition).trim()].filter(Boolean).join(" – ");
      const statCells = [s.n ? f2(s.avg) : "", s.n ? f2(s.min) : "", s.n ? f2(s.max) : ""];
      const app = (label, first) => first ? [x.unit, x.condition, x.hood, x.hoodMake, x.hoodModel, x.hoodSerial, typeName(x.type), x.location, q ? "" : x.distanceCm, label,
        r ? r.basis : "", r ? r.width : "", r ? r.height : "", r ? r.grid : "", r ? r.gapX : "", r ? r.gapY : "", q && q.basis === "manual" ? q.reason : "", q && c ? (c.ok ? "Meets" : "Does not meet") : "", (x.photos || []).length || "", anem, dn(t)]
        : blank(9).concat([label], blank(11));
      if (q) {
        const N = gridN(q);
        if (!N) { rows.push([unitCell, "", ""].concat(statCells, ["", x.comments], app("", true))); return; }
        for (let i = 0; i < N; i++) {
          const lab = pointLabel(q, i), num = lab ? (i + 1) + " - " + lab : String(i + 1), d = str(q.d[ptDKey(i)]);
          rows.push(i === 0 ? [unitCell, num, str(q.v[ptKey(i)])].concat(statCells, [d, x.comments], app(lab, true)) : ["", num, str(q.v[ptKey(i)]), "", "", "", d, ""].concat(app(lab, false)));
        }
        return;
      }
      const reads = (x.readings || []).map(v => str(v).trim()).filter(v => v !== "");
      if (!reads.length) rows.push([unitCell, "", ""].concat(statCells, [x.below05, x.comments], app("", true)));
      reads.forEach((v, i) => rows.push(i === 0 ? [unitCell, "1", v].concat(statCells, [x.below05, x.comments], app("", true)) : ["", String(i + 1), v, "", "", "", "", ""].concat(app("", false))));
    });
    if (sums.length) {
      rows.push([]); rows.push(["Summary"]); rows.push(SUM_COLS);
      sums.forEach(r => rows.push([r.unit, r.n || "", r.avg, r.min, r.max, r.range, r.condition, r.width, r.height, r.grid, r.gapX, r.gapY, r.basis, r.check]));
    }
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
      + ".vg-sum{border-collapse:collapse;width:100%;font-size:13px}.vg-sum th,.vg-sum td{padding:5px 6px;border-bottom:1px solid rgba(255,255,255,.15);text-align:left;white-space:nowrap}.vg-sum tbody tr{cursor:pointer}.vg-tpass{color:#7BE0A4;font-weight:700}.vg-tfail{color:#FF8A8A;font-weight:700}";
    document.head.appendChild(st);
    try { g.render(); } catch (e) {}
  }
  if (document.readyState === "complete") setTimeout(install, 0); else g.addEventListener("load", install);

  g.ENVSS_VENT = { version: VENT_VERSION, loaded: true, isVentEvent, isVent, addMeasurement, openVent, stats, missing, complete, exportCsv, csvRows, summaryRows, gridFor, defaultLabel, stdCheck, below05Range, TYPES, PICK, STD };
})(window);

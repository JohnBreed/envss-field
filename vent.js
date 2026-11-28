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
    ["face", "Face velocity", "At the extraction face, hood opening or sash."],
    ["capture", "Capture velocity", "At the source or work position, a set distance from the face."],
    ["other", "Other velocity reading", "e.g. edge of a table, breathing zone, booth length, duct."],
    ["visual", "Visual check only", "No readings possible (e.g. fully enclosed). Describe what was seen."]
  ];
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
    return x;
  }
  const numOf = s => { const v = String(s == null ? "" : s).trim().replace(",", "."); if (v === "" || !/^-?\d*\.?\d+$/.test(v)) return null; const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
  function stats(t) {
    const x = t.vent || {}; const vals = (x.readings || []).map(numOf).filter(n => n != null);
    if (!vals.length) return { n: 0, avg: null, min: null, max: null };
    const sum = vals.reduce((a, b) => a + b, 0);
    return { n: vals.length, avg: sum / vals.length, min: Math.min.apply(null, vals), max: Math.max.apply(null, vals) };
  }
  const f2 = n => (n == null ? "" : (Math.round(n * 100) / 100).toFixed(2));
  function missing(t) {
    const x = t.vent || {}, m = [];
    if (!str(x.unit).trim()) m.push("Extraction unit");
    if (!str(x.location).trim()) m.push("Measurement location");
    if (x.type === "visual") { if (!str(x.comments).trim()) m.push("Comments (what was seen)"); }
    else if (!stats(t).n) m.push("At least one velocity reading");
    return m;
  }
  const complete = t => isVent(t) && !!t.vent && !missing(t).length;
  const started = t => { const x = t.vent || {}; return !!(str(x.unit).trim() || str(x.location).trim() || stats(t).n || str(x.comments).trim() || (x.photos || []).length); };
  function warnings(t) {
    const x = t.vent || {}, w = [];
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
  function titleOf(t) { const x = t.vent || {}; return [dn(t), typeName(x.type), str(x.unit).trim() || "—"].join(" · "); }
  function summaryOf(t) {
    const x = t.vent || {}, s = stats(t), bits = [str(x.location).trim() || "—"];
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
    ${TYPES.map(([k, name, blurb]) => `<div class="card" style="cursor:pointer" data-vt-add="${k}" onclick="ENVSS_VENT.addMeasurement('${esc(id)}','${k}')">
      <strong>Vent · ${esc(name)}</strong><div class="muted">${esc(blurb)}</div></div>`).join("")}
  </div>`;
  }
  function addMeasurement(eventId, type, copyFrom) {
    const c = C(); const before = new Set((c.db().trains || []).map(x => x.id));
    pendingType = type || "face";
    try { g.addTrain(eventId, "vent"); } finally { pendingType = ""; }
    const t = (c.db().trains || []).find(x => !before.has(x.id) && x.eventId === eventId);
    if (!t) return null;   // the person said no to the confirmation
    const x = vt(t, true); x.type = type || x.type || "face";
    /* airborne defaults the shared add code fills in are not used on a vent measurement */
    delete t.rotameter; delete t.v44Equip; t.contaminantId = ""; t.mode = "static";
    if (copyFrom && copyFrom.vent) { ["unit", "hood", "condition"].forEach(k => { x[k] = str(copyFrom.vent[k]); }); }
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
    const typeOpts = TYPES.map(([k, n]) => `<option value="${k}" ${k === x.type ? "selected" : ""}>${esc(n)}</option>`).join("");
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
  }

  /* ---------- edits (saved on every keystroke, audited once per field change) ---------- */
  const focusVal = new Map();
  let dirty = false;
  function flushDirty() { if (!dirty) return; dirty = false; const t = curVent(); if (t) sync(t); save(); }
  function onFocus(e) { const el = e.target; if (!el || !el.dataset || !curVent()) return; if (el.dataset.vt || el.dataset.vtR != null) focusVal.set(el, el.value); }
  function onInput(e) {
    const el = e.target; if (!el || !el.dataset) return; const t = curVent(); if (!t) return;
    const x = vt(t, true);
    if (el.dataset.vtR != null) { const i = +el.dataset.vtR; x.readings[i] = el.value.trim(); }
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
      const before = x.type; x.type = el.value; note(t, "Measurement type", typeName(before) + " → " + typeName(x.type)); sync(t); save(); C().render(); return;
    }
    if (el.dataset.vt || el.dataset.vtR != null) {
      const nv = el.value.trim();
      if (el.dataset.vt === "unit" && nv && !str(x.hood).trim() && !str(x.condition).trim()) { const l = lastFor(t, nv); if (l) { x.hood = str(l.vent.hood); x.condition = str(l.vent.condition); note(t, "Unit details copied", "LEV / hood type and operating condition from " + dn(l)); sync(t); save(); C().render(); }
      }
      focusVal.set(el, el.value); dirty = false; sync(t); save(); softPaint(t);
    }
  }
  function onKey(e) {
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
    const b = e.target.closest && e.target.closest("[data-vt-addread],[data-vt-again],[data-vt-delete],[data-vt-delphoto],[data-vt-unit],[data-vt-equip-save],[data-vt-export]");
    if (!b) return false;
    if (b.dataset.vtExport) { exportCsv(b.dataset.vtExport); return true; }
    if (b.dataset.vtEquipSave) return true;
    const t = curVent(); if (!t) return false;
    const x = vt(t, true);
    if (b.dataset.vtAddread) { addReading(t); return true; }
    if (b.dataset.vtAgain) { addMeasurement(t.eventId, x.type === "visual" ? "face" : x.type, t); return true; }
    if (b.dataset.vtUnit) {
      const src = (C().db().trains || []).find(y => y.id === b.dataset.vtUnit); if (!src || !src.vent) return true;
      const before = x.unit; x.unit = str(src.vent.unit); if (!str(x.hood).trim()) x.hood = str(src.vent.hood); if (!str(x.condition).trim()) x.condition = str(src.vent.condition);
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
  function paintEvent() {
    const v = view(); if (!v || v.page !== "event") return;
    const ev = C().eventById(v.eventId); if (!isVentEvent(ev)) return;
    if (!document.getElementById("vtEquip")) {
      const btn = document.getElementById("btnAddSampleTop"); const row = btn && (btn.closest(".row") || btn.parentElement);
      if (row) row.insertAdjacentHTML("afterend", equipHtml(ev));
    }
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
  function exportCsv(eventId) {
    const ev = C().eventById(eventId); if (!ev) return;
    const q = ev.ventEquip || {}; const anem = [q.make, q.model].filter(Boolean).join(" ") + (q.serial ? " SN " + q.serial : "");
    const rows = [["Extraction Unit/Equipment", "LEV/Hood Type", "Operating Condition", "Measurement Type", "Measurement Location", "Distance From Extraction Face (cm)", "Measurement Number", "Measured Velocity (m/s)", "Average Velocity (m/s)", "Lowest Recorded Velocity (m/s)", "Highest Recorded Velocity (m/s)", "Distance at which velocity < 0.5 m/s", "Comments", "Photos", "Anemometer", "Field app measurement"]];
    (C().trainsOf(eventId) || []).filter(isVent).sort((a, b) => (Number(a.sampleNo) || 0) - (Number(b.sampleNo) || 0)).forEach(t => {
      const x = t.vent || {}, s = stats(t); const reads = (x.readings || []).map(r => str(r).trim()).filter(r => r !== "");
      const head = [x.unit, x.hood, x.condition, typeName(x.type), x.location, x.distanceCm];
      const tail = [s.n ? f2(s.avg) : "", s.n ? f2(s.min) : "", s.n ? f2(s.max) : "", x.below05, x.comments, (x.photos || []).length || "", anem, dn(t)];
      if (!reads.length) rows.push(head.concat(["", ""], tail));
      reads.forEach((r, i) => rows.push(i === 0 ? head.concat([1, r], tail) : ["", "", "", "", "", "", i + 1, r, "", "", "", "", "", "", "", ""]));
    });
    const csv = rows.map(r => r.map(v => `"${str(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
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
      + ".vt-photos{display:flex;flex-wrap:wrap;gap:10px;margin:8px 0}.vt-photo{max-width:180px}.vt-photo img{max-width:100%;border-radius:8px;display:block}.vt-take{display:inline-block;margin-top:8px}.vt-audit{margin-top:16px}.vt-audit summary{cursor:pointer;font-weight:700}.vt-del{color:var(--danger,#FF7A7A)}";
    document.head.appendChild(st);
    try { g.render(); } catch (e) {}
  }
  if (document.readyState === "complete") setTimeout(install, 0); else g.addEventListener("load", install);

  g.ENVSS_VENT = { version: VENT_VERSION, loaded: true, isVentEvent, isVent, addMeasurement, openVent, stats, missing, complete, exportCsv, TYPES };
})(window);

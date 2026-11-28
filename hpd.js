/* ENVSS Field v48.19: Hearing protection onsite (hpd.js). OPTIONAL capture for events that include noise
   (ACA-NSED, NSED, NSEOC). Never blocks "Mark event complete" and is never part of answerItems.
   What it does
     - Photograph the box of each HPD (earplug / earmuff) the crew has onsite. Several photos per product.
     - Pick the product from the ENVSS HPD library (hpd-library.js) or let the photo suggest it (existing Google Vision
       Edge Function ocr-fit-report, same key handling as fit testing: the key never reaches the browser).
       The library fills Class and SLC80 (expected attenuation). "Not in the list" keeps free text for the office.
     - "None onsite" is a valid answer. Optionally say which workers (personal noise samples) wear each product.
     - Indicative exposure check per worker (see assess()): paraphrased from AS/NZS 1269.3:2005, clauses cited in code; the report is still the office's call.
   Data: ev.hpd on the EVENT record (syncs inside the existing envss_events payload, so no SQL is needed).
     { v:1, status:"" | "none_onsite", items:[{ id, photos:[{pid,path,bytes,w,h,takenAt,uploaded}], libId, other, name, boxClass, boxSlc80,
       boxSrc, appliesTo:[trainId], note, ocr:{state,at,text,suggest:[{id,score}],printed:{cls,slc}}, addedAt, addedBy }], updatedAt }
   Photos use the shared photo store (envssPhotos: shrunk, IndexedDB, queued upload to the field-photos bucket, Drive copy).
   Holder id "hpd:<eventId>", Drive name <eventCode>_hpd_photo_<n>.jpg in the job's Field-App folder like every other photo. */
(function (g) {
  "use strict";
  const HPD_VERSION = "48.19.0";
  const C = () => g.envssCore || {};
  const LIB = () => (g.ENVSS_HPD_LIB && g.ENVSS_HPD_LIB.products) || [];
  const OCR_FN = "ocr-fit-report";
  const OVER_DB = 70;   /* AS/NZS 1269.3 cl 6.2.2: an effective level of about 70 dB(A) or less could lead to over-protection (ENVSS reports use 65: open question) */
  const CRIT_DB = 85;   /* L(crit)Aeq,8h */
  const PEAK_CLASS5_DB = 140;   /* LCpeak at/above this: Class 5 (AS/NZS 1269.3 App B, as quoted in the WorkSafe WA code and ENVSS reports) */

  /* ---------------- pure helpers (unit tested in work/v48-19/hpd.test.mjs) ---------------- */
  const num = v => { const n = parseFloat(String(v == null ? "" : v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
  const norm = s => String(s == null ? "" : s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const nospace = s => norm(s).replace(/ /g, "");
  /* Class from the SLC80 number (AS/NZS 1269.3 Table E1 bands: 10-13, 14-17, 18-21, 22-25, 26+) */
  function classOfSlc(slc) { const n = num(slc); if (n == null || n < 10) return null; return n <= 13 ? 1 : n <= 17 ? 2 : n <= 21 ? 3 : n <= 25 ? 4 : 5; }
  /* Class needed for a worker's LAeq,8h with L(crit) 85 (Table A1, classification method cl A2.1/A3.1). 0 = below the criterion, null = octave-band method (cl A2.2) */
  function classNeeded(laeq8h) {
    const n = num(laeq8h); if (n == null) return undefined;
    if (n < CRIT_DB) return 0; if (n < 90) return 1; if (n < 95) return 2; if (n < 100) return 3; if (n < 105) return 4; if (n < 110) return 5; return null;
  }
  /* Indicative check for one worker and one product. Inputs are numbers as entered on the sample.
     eff = LCeq - SLC80 when LCeq is there (ENVSS NSEOC method), otherwise LAeq - SLC80 (ENVSS dosimetry convention, report 0019037).
     The LAeq is used as entered: the office applies any shift / 8 h adjustment in the report. */
  function assess(o) {
    const out = { notes: [], status: "", needed: undefined, eff: null, effBasis: "" };
    const cls = o.cls == null ? null : Number(o.cls), slc = num(o.slc);
    const laeq = num(o.laeq), lceq = num(o.lceq), pk = num(o.lcpeak);
    out.needed = laeq == null ? undefined : classNeeded(laeq);
    if (cls == null && slc == null) { out.status = "unknown"; out.notes.push("No Class or SLC80 yet, so no check."); return out; }
    const have = cls != null ? cls : classOfSlc(slc);
    if (out.needed === null) out.notes.push("LAeq is 110 dB(A) or more: the octave-band method is needed (cl A2.2). Ask the office.");
    else if (out.needed != null && have != null) {
      if (out.needed === 0) out.notes.push("LAeq is under 85 dB(A): no protector needed for this level.");
      else if (have >= out.needed) out.notes.push("Class " + have + " meets the Class " + out.needed + " needed for this LAeq (Table A1).");
      else out.notes.push("Class " + have + " is below the Class " + out.needed + " needed for this LAeq (Table A1).");
    }
    if (pk != null && pk >= PEAK_CLASS5_DB) {
      if (have != null && have < 5) { out.notes.push("LCpeak " + pk + " dB(C) is 140 or more: Class 5 is needed."); out.peakFail = true; }
      else if (have === 5) out.notes.push("LCpeak " + pk + " dB(C) is 140 or more: Class 5 is needed (this is Class 5).");
    }
    if (slc != null && (lceq != null || laeq != null)) {
      const base = lceq != null ? lceq : laeq;
      out.effBasis = lceq != null ? "LCeq" : "LAeq";
      out.eff = Math.round((base - slc) * 10) / 10;
      out.status = out.eff >= CRIT_DB ? "inadequate" : out.eff <= OVER_DB ? "over" : "ok";
      out.notes.push("Indicative protected level " + out.effBasis + " " + base + " − SLC80 " + slc + " = " + out.eff + " dB(A): "
        + (out.status === "inadequate" ? "not below 85." : out.status === "over" ? "70 or less could mean over-protection (cl 6.2.2)." : "below 85."));
    } else if (out.needed !== undefined && have != null) {
      out.status = out.needed === null ? "check" : out.needed === 0 || have >= out.needed ? "ok" : "inadequate";
    } else out.status = "unknown";
    if (out.peakFail) out.status = "inadequate";
    return out;
  }
  /* library search (type-ahead) */
  function search(q, lib, limit) {
    lib = lib || LIB();
    const toks = norm(q).split(" ").filter(Boolean); if (!toks.length) return [];
    const hits = lib.filter(p => { const hay = " " + norm(p.make + " " + p.model + " " + (p.keys || []).join(" ") + " " + p.type) + " "; const ns = hay.replace(/ /g, ""); return toks.every(t => hay.indexOf(t) >= 0 || ns.indexOf(t) >= 0); });
    hits.sort((a, b) => (b.reports || 0) - (a.reports || 0) || (a.make + a.model).localeCompare(b.make + b.model));
    return hits.slice(0, limit || 8);
  }
  /* product suggestions from the OCR text of a box photo. Returns the printed Class / SLC80 as well, when the box states them. */
  function suggest(text, lib) {
    lib = lib || LIB(); const t = " " + norm(text) + " ", ns = t.replace(/ /g, "");
    const printed = {};
    let m = /slc ?80 ?(\d{2})/.exec(t);
    if (m) printed.slc = Number(m[1]);
    if (!printed.slc) { m = /\b(\d{2}) ?db\b/.exec(t); if (m && Number(m[1]) >= 10 && Number(m[1]) <= 40) printed.slc = Number(m[1]); }
    m = /class ?([1-5])\b/.exec(t); if (m) printed.cls = Number(m[1]);
    const makes = (g.ENVSS_HPD_LIB && g.ENVSS_HPD_LIB.makes) || {};
    const out = [];
    lib.forEach(p => {
      let best = 0;
      (p.keys || []).forEach(k => { const kn = norm(k), kns = kn.replace(/ /g, ""); if (!kns) return;
        const hit = t.indexOf(" " + kn + " ") >= 0 || t.indexOf(" " + kn) >= 0 && kns.length >= 5 || (kns.length >= 6 && ns.indexOf(kns) >= 0);
        if (hit) best = Math.max(best, kns.length); });
      if (!best) return;
      let score = best;
      if ((makes[p.make] || []).some(w => t.indexOf(" " + norm(w) + " ") >= 0)) score += 3;
      if (printed.cls && printed.cls === p.cls) score += 2;
      if (printed.slc && printed.slc === p.slc) score += 3;
      out.push({ id: p.id, score });
    });
    out.sort((a, b) => b.score - a.score);
    return { suggest: out.slice(0, 3), printed };
  }
  function byId(id) { return LIB().find(p => p.id === id) || null; }
  function newState() { return { v: 1, status: "", items: [], updatedAt: "" }; }
  function itemValues(it) {   /* what the checks use: the box values win over the library */
    const p = it.libId ? byId(it.libId) : null;
    const bc = num(it.boxClass), bs = num(it.boxSlc80);
    const slc = bs != null ? bs : p ? p.slc : null;
    /* the SLC80 number is the specific one: when both are on the box the class follows it (a mismatch is shown by boxMismatch) */
    const cls = bs != null && classOfSlc(bs) != null ? classOfSlc(bs) : bc != null ? bc : bs != null ? classOfSlc(bs) : p ? p.cls : null;
    return { cls, slc, src: bs != null || bc != null ? "box" : p ? (p.basis === "mfr" ? "manufacturer" : "reports") : "", lib: p };
  }
  function boxMismatch(it) {
    const p = it.libId ? byId(it.libId) : null;
    const bs = num(it.boxSlc80), bc = num(it.boxClass); const bits = [];
    if (bs != null && bc != null && classOfSlc(bs) != null && classOfSlc(bs) !== bc) bits.push("Class " + bc + " and " + bs + " dB do not go together (" + bs + " dB is Class " + classOfSlc(bs) + ")");
    if (!p) return bits.join("; ");
    if (bs != null && bs !== p.slc) bits.push("the box says " + bs + " dB but the library has " + p.slc + " dB");
    if (bc != null && bc !== p.cls) bits.push("the box says Class " + bc + " but the library has Class " + p.cls);
    return bits.join("; ");
  }
  /* does the event include noise (ACA-NSED, NSED, NSEOC)? */
  function appliesTo(ev, trains) {
    if (!ev || ev.type === "fibre" || ev.type === "fit" || /-FIT-\d+/i.test(String(ev.code || ""))) return false;
    let codes = []; try { codes = typeof g.eventServiceCodes === "function" ? g.eventServiceCodes(ev) : []; } catch (e) { codes = []; }
    if (codes.some(c => /NSE/i.test(String(c)))) return true;
    if (ev.podioEventKind === "noise" || ev.type === "noise") return true;
    if (ev.podioEventKind === "vent") return false;
    return (trains || []).some(t => String(t.trainKind || "").indexOf("noise") === 0 || t.contaminantId === "NOISE");
  }
  function summary(ev) {
    const h = ev && ev.hpd; if (!h) return { state: "none", text: "Not recorded" };
    if (h.status === "none_onsite") return { state: "none_onsite", text: "None onsite" };
    const n = (h.items || []).length; if (!n) return { state: "none", text: "Not recorded" };
    const open = h.items.filter(i => !i.libId && !(i.name || "").trim()).length;
    return { state: "items", n, open, text: n + " product" + (n === 1 ? "" : "s") + (open ? " · " + open + " to identify" : "") };
  }

  /* ---------------- UI ---------------- */
  const esc = s => (C().esc || g.esc)(s);
  const nowIso = () => new Date().toISOString();
  const uid = () => "h" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const evNow = () => { const v = C().view && C().view(); return v && v.page === "event" ? C().eventById(v.eventId) : null; };
  const trainsNow = ev => (C().trainsOf ? C().trainsOf(ev.id) : []) || [];
  const personLabel = t => { const p = t.person || {}; const n = [p.first, p.last].map(x => String(x || "").trim()).filter(Boolean).join(" "); return n || (t.seg ? "SEG " + t.seg : "Sample " + (t.sampleNo || t.pouch || "?")); };
  const workers = ev => trainsNow(ev).filter(t => C().isNoise(t) && !C().isBlank(t) && !C().isStatic(t));
  const val = (t, k) => { const x = t.noise && t.noise.values && t.noise.values[k]; return x ? x.v : ""; };
  const mem = { open: {}, q: {}, busy: {} };   /* UI state only: which product picker is open, search text */
  function state(ev, write) { if (!ev.hpd || typeof ev.hpd !== "object") { if (!write) return newState(); ev.hpd = newState(); } if (!Array.isArray(ev.hpd.items)) ev.hpd.items = []; return ev.hpd; }
  function log(ev, action, detail) { ev.audit = ev.audit || []; ev.audit.push({ at: nowIso(), who: (C().who && C().who()) || "", action, field: "hpd", from: "", to: "", detail: detail || "" }); }
  function touch(ev) { const h = state(ev, true); h.updatedAt = nowIso(); h.by = (C().who && C().who()) || ""; if (C().saveQuiet) C().saveQuiet(); }
  const holder = ev => ({ id: "hpd:" + ev.id, eventId: ev.id });

  function chip(text, cls) { return `<span class="hpd-chip ${cls || ""}">${esc(text)}</span>`; }
  function productLine(it) {
    const v = itemValues(it), p = v.lib;
    if (p) {
      const basis = p.basis === "mfr" ? chip("manufacturer value", "ok") : chip("ENVSS reports (unverified)", "warn");
      return `<div class="hpd-prod"><strong>${esc(p.make)} ${esc(p.model)}</strong> <span class="hpd-sub">${esc(p.type)}</span></div>
        <div class="hpd-chips">${chip("Class " + (v.cls == null ? "?" : v.cls), "big")}${chip("SLC80 " + (v.slc == null ? "?" : v.slc) + " dB", "big")}${v.src === "box" ? chip("box values", "ok") : basis}${p.check ? chip("check the box", "warn") : ""}</div>
        ${p.check && p.why ? `<p class="hpd-help">${esc(p.why)}</p>` : ""}`;
    }
    if (it.other || (it.name || "").trim()) return `<div class="hpd-prod"><strong>${esc(it.name || "Not in the list")}</strong> <span class="hpd-sub">not in the list</span></div>
      <div class="hpd-chips">${chip("Class " + (v.cls == null ? "?" : v.cls), "big")}${chip("SLC80 " + (v.slc == null ? "?" : v.slc) + " dB", "big")}${chip("office to complete", "warn")}</div>`;
    return "";
  }
  function pickerHtml(it, ev) {
    const o = it.ocr || {};
    let h = "";
    if (mem.busy[it.id]) h += `<p class="hpd-help">Reading the photo…</p>`;
    else if (o.state === "ok" && (o.suggest || []).length) h += `<div class="hpd-sug"><span class="hpd-help">The photo looks like:</span>${o.suggest.map(s => { const p = byId(s.id); return p ? `<button type="button" class="btn ghost hpd-sugbtn" data-hpd="use" data-item="${it.id}" data-lib="${p.id}">${esc(p.make)} ${esc(p.model)} · Class ${p.cls} · ${p.slc} dB</button>` : ""; }).join("")}</div>`;
    else if (o.state === "ok") h += `<p class="hpd-help">Could not match the photo to a product. Search below, or choose Not in the list.</p>`;
    else if (o.state === "unavailable") h += `<p class="hpd-help">Photo reading is not available right now. Search below.</p>`;
    else if (o.state === "offline") h += `<p class="hpd-help">No signal: photo reading skipped. Search below.</p>`;
    const q = mem.q[it.id] || ""; const res = q ? search(q) : [];
    h += `<label>Search the HPD library</label><input type="search" data-hpd-in="q" data-item="${it.id}" value="${esc(q)}" placeholder="e.g. superfit, sparkplugs, VS120, Peltor" autocomplete="off">
      <div class="hpd-res" data-res="${it.id}">${hpdRes(it, res, q)}</div>
      <button type="button" class="btn ghost hpd-other" data-hpd="other" data-item="${it.id}">Not in the list</button>`;
    return h;
  }
  function hpdRes(it, res, q) {
    if (!q) return "";
    if (!res.length) return `<p class="hpd-help">Nothing matches “${esc(q)}”. Choose Not in the list.</p>`;
    return res.map(p => `<button type="button" class="hpd-resrow" data-hpd="use" data-item="${it.id}" data-lib="${p.id}"><span>${esc(p.make)} ${esc(p.model)}<br><small>${esc(p.type)}</small></span><span class="hpd-chip">Class ${p.cls} · ${p.slc} dB</span></button>`).join("");
  }
  function exposureHtml(it, ev) {
    const v = itemValues(it); if (v.cls == null && v.slc == null) return "";
    let ws = workers(ev); if (it.appliesTo && it.appliesTo.length) ws = ws.filter(t => it.appliesTo.indexOf(t.id) >= 0);
    const rows = ws.map(t => { const laeq = val(t, "LAeq"); if (num(laeq) == null) return ""; const a = assess({ cls: v.cls, slc: v.slc, laeq, lceq: val(t, "LCeq"), lcpeak: val(t, "LCpeak") });
      return `<li class="hpd-${a.status}"><strong>${esc(personLabel(t))}</strong> · LAeq ${esc(laeq)}${a.notes.length ? "<br>" + a.notes.map(esc).join("<br>") : ""}</li>`; }).filter(Boolean);
    if (!rows.length) return "";
    return `<details class="hpd-exp"><summary>Exposure check (indicative)</summary><ul>${rows.join("")}</ul>
      <p class="hpd-help">Uses the LAeq as entered; the office applies the shift adjustment, wearing time and fit in the report. Method paraphrased from AS/NZS 1269.3:2005 (Table A1, cl 6.2.2, App B). Not a sign-off.</p></details>`;
  }
  function itemHtml(it, ev, idx) {
    const photos = (it.photos || []).map((p, i) => `<figure>${C().photos ? C().photos.imgTag(p, "HPD box " + (i + 1)) : ""}<figcaption>${i + 1}<button type="button" class="hpd-del" data-hpd="delphoto" data-item="${it.id}" data-i="${i}" aria-label="Remove photo ${i + 1}">✕</button></figcaption></figure>`).join("");
    const identified = !!(it.libId || it.other || (it.name || "").trim());
    const v = itemValues(it), mm = boxMismatch(it);
    const ws = workers(ev);
    return `<div class="hpd-item" data-hpd-item="${it.id}"><div class="hpd-ih"><strong>HPD ${idx + 1}</strong><button type="button" class="hpd-rm" data-hpd="rm" data-item="${it.id}">Remove</button></div>
      <div class="hpd-photos">${photos || `<span class="hpd-help">No photo (typed entry)</span>`}</div>
      <div class="hpd-add"><label class="btn ghost hpd-btn">📷 Another photo of this box<input type="file" accept="image/*" capture="environment" data-hpd-file="more" data-item="${it.id}" hidden></label></div>
      ${identified ? productLine(it) + `<div class="hpd-chg"><button type="button" class="btn ghost" data-hpd="change" data-item="${it.id}">Change product</button></div>` : ""}
      ${!identified || mem.open[it.id] ? pickerHtml(it, ev) : ""}
      ${it.other && !it.libId ? `<label>Product name as printed on the box</label><input data-hpd-in="name" data-item="${it.id}" value="${esc(it.name || "")}" placeholder="Brand and model" autocomplete="off">` : ""}
      ${identified ? `<details class="hpd-box" ${it.boxClass || it.boxSlc80 || it.other ? "open" : ""}><summary>Printed on the box (optional)</summary>
        <div class="hpd-grid"><div><label>Class</label><input inputmode="numeric" data-hpd-in="boxClass" data-item="${it.id}" value="${esc(it.boxClass || "")}" placeholder="1–5"></div>
        <div><label>SLC80 (dB)</label><input inputmode="decimal" data-hpd-in="boxSlc80" data-item="${it.id}" value="${esc(it.boxSlc80 || "")}" placeholder="e.g. 24"></div></div>
        ${it.boxSrc === "ocr" ? `<p class="hpd-help">Read from the photo: check it against the box.</p>` : ""}
        ${mm ? `<p class="hpd-warn">Heads up: ${esc(mm)}. The box values are used for the checks and the office will confirm.</p>` : ""}
        <p class="hpd-help">Leave blank if you cannot read it. The office fills the gaps.</p></details>` : ""}
      ${ws.length ? `<div class="hpd-who"><label>Worn by (optional)</label><div class="hpd-chips">${ws.map(t => `<button type="button" class="hpd-wchip ${(it.appliesTo || []).indexOf(t.id) >= 0 ? "on" : ""}" data-hpd="who" data-item="${it.id}" data-t="${esc(t.id)}">${esc(personLabel(t))}</button>`).join("")}</div>
        <p class="hpd-help">${(it.appliesTo || []).length ? "Only the people ticked." : "Not specified: onsite for everyone."}</p></div>` : ""}
      <label>Note (optional)</label><input data-hpd-in="note" data-item="${it.id}" value="${esc(it.note || "")}" placeholder="e.g. found in the crib room, size small" autocomplete="off">
      ${identified ? exposureHtml(it, ev) : ""}</div>`;
  }
  function cardHtml(ev) {
    const h = state(ev), sm = summary(ev);
    const none = h.status === "none_onsite";
    const chipCls = sm.state === "items" ? (sm.open ? "warn" : "ok") : sm.state === "none_onsite" ? "ok" : "";
    return `<div class="card hpd-card" id="hpdCard"><div class="hpd-top"><h3 class="brand-type" style="margin:0">Hearing protection onsite</h3>${chip(sm.text, chipCls)}</div>
      <p class="hpd-help">Optional. Photograph the box of each hearing protector the crew has onsite. This never stops the event being completed.</p>
      ${none ? `<p class="hpd-sum ok">No hearing protection onsite.</p><button type="button" class="btn ghost hpd-btn" data-hpd="undonone">Undo: there is some</button>` : `
      ${(h.items || []).map((it, i) => itemHtml(it, ev, i)).join("")}
      <div class="hpd-add"><label class="btn hpd-btn hpd-main">📷 Photograph ${h.items.length ? "another HPD box" : "HPD box"}<input type="file" accept="image/*" capture="environment" data-hpd-file="new" hidden></label>
        <label class="btn ghost hpd-btn">🖼 Choose photos<input type="file" accept="image/*" multiple data-hpd-file="new" hidden></label>
        <button type="button" class="btn ghost hpd-btn" data-hpd="typed">Type it in</button>
        ${h.items.length ? "" : `<button type="button" class="btn ghost hpd-btn" data-hpd="none">None onsite</button>`}</div>`}
      <p class="hpd-msg" id="hpdMsg" aria-live="polite">${esc(mem.msg || "")}</p></div>`;
  }
  function mount() {
    const ev = evNow(); const old = document.getElementById("hpdCard");
    if (!ev || !appliesTo(ev, trainsNow(ev))) { if (old) old.remove(); return; }
    const wrap = document.querySelector("#app .wrap"); if (!wrap) return;
    const html = cardHtml(ev);
    if (old) { if (old.outerHTML !== html.trim()) old.outerHTML = html; }
    else { const anchor = document.getElementById("sampleFilters") || wrap.querySelector(".empty") || document.getElementById("driveCopies") || wrap.querySelector(".ev-audit");
      if (anchor) anchor.insertAdjacentHTML("beforebegin", html); else wrap.insertAdjacentHTML("beforeend", html); }
    try { C().photos && C().photos.hydrate && C().photos.hydrate(); } catch (e) {}
  }
  function repaint() { const old = document.getElementById("hpdCard"), ev = evNow(); if (!old || !ev) return mount(); const t = document.createElement("template"); t.innerHTML = cardHtml(ev).trim(); old.replaceWith(t.content.firstChild); try { C().photos && C().photos.hydrate && C().photos.hydrate(); } catch (e) {} }
  function say(m) { mem.msg = m; const el = document.getElementById("hpdMsg"); if (el) el.textContent = m; }
  const itemOf = (ev, id) => (state(ev).items || []).find(i => i.id === id);

  /* ---------------- photo + OCR ---------------- */
  async function addPhoto(ev, file, itemId) {
    if (!C().photos || !C().photos.add) { say("Photos are not available on this device."); return null; }
    let ref;
    try { ref = await C().photos.add(file, holder(ev), "hpd"); }
    catch (e) { say("Could not save that photo on this device (" + (e && e.message || e) + "). Nothing was lost: try again, or type the product in."); return null; }
    const h = state(ev, true); h.status = "";
    let it = itemId ? itemOf(ev, itemId) : null;
    if (!it) { it = { id: uid(), photos: [], libId: "", other: false, name: "", boxClass: "", boxSlc80: "", boxSrc: "", appliesTo: [], note: "", addedAt: nowIso(), addedBy: (C().who && C().who()) || "" }; h.items.push(it); log(ev, "HPD box photo added", "new product " + h.items.length); }
    else log(ev, "HPD box photo added", "another photo of product " + (h.items.indexOf(it) + 1));
    it.photos.push(ref); touch(ev); return it;
  }
  function downscale(blob, maxEdge, q) {
    return new Promise(res => { const u = URL.createObjectURL(blob); const img = new Image(); img.onerror = () => { URL.revokeObjectURL(u); res(blob); };
      img.onload = () => { try { const k = Math.min(1, maxEdge / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); c.toBlob(b => { URL.revokeObjectURL(u); res(b || blob); }, "image/jpeg", q); } catch (e) { URL.revokeObjectURL(u); res(blob); } };
      img.src = u; });
  }
  const toB64 = blob => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).replace(/^data:[^;]+;base64,/, "")); fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob); });
  /* Suggest a product from the photo with the existing Vision function. Failure is silent: the picker is always there. */
  async function readBox(ev, it, ref) {
    const cfg = g.sbCfg && g.sbCfg();
    if (navigator.onLine === false) { it.ocr = { state: "offline", at: nowIso() }; touch(ev); return; }
    if (!cfg || !cfg.supabaseUrl) { it.ocr = { state: "unavailable", at: nowIso() }; touch(ev); return; }
    mem.busy[it.id] = true; repaint();
    try {
      const blob = await (C().photos && C().photos.blobOf ? C().photos.blobOf(ref.pid) : null);
      if (!blob) throw new Error("photo not on this device");
      const small = await downscale(blob, 1600, 0.72);
      const ctl = typeof AbortController !== "undefined" ? new AbortController() : null; const timer = ctl ? setTimeout(() => ctl.abort(), 45000) : null;
      let res, j;
      try { res = await fetch(cfg.supabaseUrl + "/functions/v1/" + OCR_FN, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, (g.sbHeaders && g.sbHeaders()) || {}), body: JSON.stringify({ image: await toB64(small), mime: "image/jpeg" }), signal: ctl ? ctl.signal : undefined }); j = await res.json().catch(() => ({})); }
      finally { if (timer) clearTimeout(timer); }
      if (!res.ok) { it.ocr = { state: "unavailable", at: nowIso(), code: res.status }; }
      else {
        const s = suggest(j.text || "");
        const prev = it.ocr && it.ocr.state === "ok" ? it.ocr : null;
        const merged = (prev ? prev.suggest.concat(s.suggest) : s.suggest).reduce((a, x) => { const e = a.find(y => y.id === x.id); if (e) e.score = Math.max(e.score, x.score); else a.push(Object.assign({}, x)); return a; }, []).sort((a, b) => b.score - a.score).slice(0, 3);
        it.ocr = { state: "ok", at: nowIso(), text: String(j.text || "").slice(0, 600), suggest: merged, printed: Object.assign({}, prev && prev.printed, s.printed) };
      }
    } catch (e) { it.ocr = { state: "unavailable", at: nowIso(), err: String(e && e.message || e).slice(0, 80) }; }
    finally { delete mem.busy[it.id]; }
    touch(ev); repaint();
  }
  async function onFiles(input) {
    const ev = evNow(); if (!ev) return; const files = Array.from(input.files || []); input.value = ""; if (!files.length) return;
    const mode = input.dataset.hpdFile, itemId = input.dataset.item || "";
    say("Saving " + files.length + " photo" + (files.length === 1 ? "" : "s") + "…");
    let made = 0;
    for (const f of files) {
      /* "Choose photos" with several files: each file is its own product box; "Another photo of this box" adds to that product */
      const it = await addPhoto(ev, f, mode === "more" ? itemId : "");
      if (!it) break; made++;
      repaint();
      readBox(ev, it, it.photos[it.photos.length - 1]);   /* background, never awaited */
    }
    if (made) say(made + " photo" + (made === 1 ? "" : "s") + " saved. Pick the product, or choose Not in the list. You can finish the event without it."); repaint();
  }

  /* ---------------- events ---------------- */
  function onClick(e) {
    const b = e.target.closest && e.target.closest("[data-hpd]"); if (!b || !b.closest("#hpdCard")) return;
    const ev = evNow(); if (!ev) return; const act = b.dataset.hpd, it = b.dataset.item ? itemOf(ev, b.dataset.item) : null, h = state(ev, true);
    if (act === "none") { h.status = "none_onsite"; h.items = []; log(ev, "HPD: none onsite", ""); touch(ev); repaint(); return; }
    if (act === "undonone") { h.status = ""; log(ev, "HPD: none onsite undone", ""); touch(ev); repaint(); return; }
    if (act === "typed") { h.status = ""; const n = { id: uid(), photos: [], libId: "", other: false, name: "", boxClass: "", boxSlc80: "", boxSrc: "", appliesTo: [], note: "", addedAt: nowIso(), addedBy: (C().who && C().who()) || "" }; h.items.push(n); log(ev, "HPD added by typing", "product " + h.items.length); touch(ev); repaint(); return; }
    if (!it) return;
    if (act === "use") { const p = byId(b.dataset.lib); if (!p) return; it.libId = p.id; it.other = false; it.name = ""; mem.open[it.id] = false; mem.q[it.id] = "";
      const pr = it.ocr && it.ocr.printed || {}; if (!it.boxClass && !it.boxSlc80 && (pr.cls || pr.slc)) { it.boxClass = pr.cls ? String(pr.cls) : ""; it.boxSlc80 = pr.slc ? String(pr.slc) : ""; it.boxSrc = "ocr"; }
      log(ev, "HPD product chosen", p.make + " " + p.model + " · Class " + p.cls + " · SLC80 " + p.slc + " (" + (p.basis === "mfr" ? "manufacturer" : "reports") + ")"); touch(ev); repaint(); return; }
    if (act === "other") { it.libId = ""; it.other = true; mem.open[it.id] = false; log(ev, "HPD not in the list", ""); touch(ev); repaint(); return; }
    if (act === "change") { mem.open[it.id] = true; repaint(); return; }
    if (act === "who") { const id = b.dataset.t; const a = it.appliesTo = it.appliesTo || []; const i = a.indexOf(id); if (i >= 0) a.splice(i, 1); else a.push(id); touch(ev); repaint(); return; }
    if (act === "delphoto") { const i = Number(b.dataset.i); const gone = it.photos.splice(i, 1)[0]; if (gone && gone.pid && C().photos && C().photos.discard) C().photos.discard(gone.pid); log(ev, "HPD box photo removed", ""); touch(ev); repaint(); return; }
    if (act === "rm") { if (!confirm("Remove this HPD and its photos from the event?")) return; (it.photos || []).forEach(p => { if (p && p.pid && C().photos && C().photos.discard) C().photos.discard(p.pid); }); h.items = h.items.filter(x => x !== it); log(ev, "HPD removed", ""); touch(ev); repaint(); }
  }
  function onInput(e) {
    const el = e.target; if (!el || !el.dataset || !el.dataset.hpdIn || !el.closest("#hpdCard")) return;
    const ev = evNow(); if (!ev) return; const it = itemOf(ev, el.dataset.item); if (!it) return; const k = el.dataset.hpdIn;
    if (k === "q") { mem.q[it.id] = el.value; const r = document.querySelector('[data-res="' + it.id + '"]'); if (r) r.innerHTML = hpdRes(it, search(el.value), el.value); return; }
    if (k === "boxClass") { it.boxClass = el.value.replace(/[^1-5]/g, "").slice(0, 1); it.boxSrc = it.boxSrc === "ocr" ? "" : it.boxSrc; }
    else if (k === "boxSlc80") { it.boxSlc80 = el.value.replace(/[^0-9.,]/g, "").slice(0, 5); it.boxSrc = it.boxSrc === "ocr" ? "" : it.boxSrc; }
    else if (k === "name") it.name = el.value;
    else if (k === "note") it.note = el.value;
    touch(ev);
    if (k === "boxClass" || k === "boxSlc80") { clearTimeout(onInput.t); onInput.t = setTimeout(() => { if (!document.activeElement || !document.activeElement.dataset || !document.activeElement.dataset.hpdIn) repaint(); }, 900); }
  }
  function onChange(e) { const el = e.target; if (el && el.dataset && el.dataset.hpdFile && el.closest("#hpdCard")) onFiles(el); }
  function onBlur(e) { const el = e.target; if (el && el.dataset && /^(boxClass|boxSlc80|name)$/.test(el.dataset.hpdIn || "") && el.closest && el.closest("#hpdCard")) setTimeout(repaint, 50); }

  /* Sample screen: "Pick from the onsite HPD list" fills the existing Brand/model, Style and Class fields of a worker's own hearing protection. */
  function samplePicker() {
    const v = C().view && C().view(); if (!v || v.page !== "train") return;
    const box = document.getElementById("hpdBox"); if (!box || document.getElementById("hpdPick")) return;
    const t = (C().db().trains || []).find(x => x.id === v.trainId); const ev = t && C().eventById(t.eventId); const items = ev && ev.hpd && ev.hpd.items || [];
    const opts = items.map(it => { const x = itemValues(it); const p = x.lib; const label = p ? p.make + " " + p.model : (it.name || ""); return label ? { id: it.id, label, style: p ? p.type : "", cls: x.cls, slc: x.slc } : null; }).filter(Boolean);
    if (!opts.length) return;
    const wrap = document.createElement("div"); wrap.id = "hpdPick";
    wrap.innerHTML = `<label>Pick from the onsite HPD list</label><select id="hpdPickSel"><option value="">Choose…</option>${opts.map(o => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join("")}</select><p class="hpd-help">Fills the brand, style and class below. Check it is what this person wears.</p>`;
    box.insertAdjacentElement("afterbegin", wrap);
    wrap.querySelector("select").onchange = ev2 => { const o = opts.find(x => x.id === ev2.target.value); if (!o) return;
      const set = (id, val2) => { const el = document.getElementById(id); if (el) { el.value = val2; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } };   /* change = the app's own autosave */
      set("hpdModel", o.label); set("hpdStyle", o.style || ""); set("hpdClass", (o.cls != null ? "Class " + o.cls : "") + (o.slc != null ? (o.cls != null ? " / " : "") + "SLC80 " + o.slc : "")); };
  }
  function install() {
    if (g.__hpd) return; g.__hpd = true;
    if (typeof g.render === "function") { const _r = g.render; g.render = function () { const r = _r.apply(this, arguments); try { mount(); samplePicker(); } catch (e) { console.warn("hpd.js render", e); } return r; }; }
    document.addEventListener("click", onClick); document.addEventListener("input", onInput, true); document.addEventListener("change", onChange, true); document.addEventListener("focusout", onBlur, true);
    const st = document.createElement("style");
    st.textContent = ".hpd-card{margin-top:12px}.hpd-top{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}.hpd-help{font-size:13px;opacity:.8;margin:4px 0}"
      + ".hpd-chip{display:inline-block;font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;border:1px solid #6B7590;background:#232B45;color:#DDE3F5;white-space:nowrap}.hpd-chip.big{font-size:14px;padding:4px 12px}"
      + ".hpd-chip.ok{border-color:#2F6B55;background:#11281F;color:#9FE0C4}.hpd-chip.warn{border-color:#6B5A2E;background:#2A2412;color:#E8D9A8}"
      + ".hpd-item{margin-top:12px;padding:12px;border:1px solid var(--edge,#3A4A7A);border-radius:12px}.hpd-ih{display:flex;justify-content:space-between;align-items:center}.hpd-rm,.hpd-del{background:transparent;color:inherit;border:1px solid var(--edge,#3A4A7A);border-radius:8px;min-height:36px;padding:0 10px}"
      + ".hpd-photos{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}.hpd-photos figure{margin:0;width:96px}.hpd-photos img{width:96px;height:120px;object-fit:cover;border-radius:8px;border:1px solid var(--edge,#3A4A7A);max-width:96px!important}"
      + ".hpd-photos figcaption{font-size:12px;display:flex;justify-content:space-between;align-items:center}.hpd-del{min-width:32px;min-height:32px;padding:0}"
      + ".hpd-add{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.hpd-btn{min-height:44px;display:inline-flex;align-items:center;justify-content:center;flex:1 1 150px;cursor:pointer}"
      + ".hpd-prod{margin-top:8px;font-size:16px}.hpd-sub{font-size:12px;opacity:.7;margin-left:4px}.hpd-chips{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.hpd-chg .btn,.hpd-other{min-height:44px;margin-top:6px}"
      + ".hpd-sug{display:flex;flex-direction:column;gap:6px;margin:8px 0}.hpd-sugbtn{min-height:44px;text-align:left}.hpd-res{margin-top:6px}"
      + ".hpd-resrow{display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;min-height:48px;text-align:left;background:transparent;color:inherit;border:1px solid var(--edge,#3A4A7A);border-radius:10px;margin:4px 0;padding:6px 10px}.hpd-resrow small{opacity:.7}"
      + ".hpd-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}.hpd-warn{color:#FFC861;font-weight:700;font-size:14px}.hpd-wchip{min-height:40px;border-radius:999px;border:1px solid var(--edge,#3A4A7A);background:transparent;color:inherit;padding:0 14px}.hpd-wchip.on{background:#11281F;border-color:#2F6B55;color:#9FE0C4;font-weight:700}"
      + ".hpd-exp{margin-top:8px}.hpd-exp summary,.hpd-box summary{cursor:pointer;font-weight:700;min-height:36px}.hpd-exp ul{margin:6px 0 6px 18px;padding:0}.hpd-exp li{margin:6px 0;font-size:14px}.hpd-inadequate strong{color:#FF7A7A}.hpd-over strong{color:#FFC861}.hpd-ok strong{color:#9FE0C4}"
      + ".hpd-sum{font-weight:700;margin:6px 0}.hpd-sum.ok{color:#9FE0C4}.hpd-msg{font-size:14px;min-height:18px;margin:8px 0 0}#hpdPick{margin-bottom:8px}#hpdPick select{min-height:44px;width:100%}";
    document.head.appendChild(st);
    try { g.render(); } catch (e) {}
  }
  if (document.readyState === "complete") setTimeout(install, 0); else g.addEventListener("load", install);
  g.ENVSS_HPD = { version: HPD_VERSION, loaded: true, norm, classOfSlc, classNeeded, assess, search, suggest, itemValues, boxMismatch, appliesTo, summary, newState, byId };
})(typeof window !== "undefined" ? window : globalThis);

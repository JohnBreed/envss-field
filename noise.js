/* ENVSS Field — noise module (noise.js).
   Split out of field.html in v46 (John, 11 Nov 2026) with no change in behaviour, so noise can be refreshed on its own.
   Loaded by field.html straight after config.js; cached by sw-field.js and always re-checked with the server when online.

   Stable interface this module uses from the core app (window.envssCore, defined by field.html):
     db() · save() · saveQuiet() · audit(t, action, detail) · photos (envssPhotos) · sync (envssSync)
     operator() / who() · captureLocation() · render() · esc() · yn() · view() · trainsOf(eventId) · eventById(id)
     isNoise(t) · isStatic(t) · isBlank(t)
   What the core app calls in here (window.ENVSS_NOISE):
     version · rejects() · startGaps(t) · equipHtml(t) · hpdFields(t) · installTrainLayer()
   Field blanks and airborne flows stay in the core app.

   v47 noise module (section A, John 11 Nov 2026). Built only in this file; the core app is unchanged.
     A1  Area / task readings on a sound level meter (SLM); personal readings on a dose badge.
     A2  Start- and end-of-day calibration with drift, every day of a multi-day job (kept on the event, per day).
     A3  LAeq required; LCpeak and LCeq captured.          A5  NSEOC 0019340 fields (Measurements + HPD Attenuation).
     A4  Values from a photo (OCR, tesseract.js loaded only when needed, offline-safe) OR typed — never both.
         A misread value can be corrected; the photo's original reading is kept beside it.
     A6  LCpeak >= 140 dB(C) or LAeq > 110 dB(A) asks for a Spectrum Table photo; area LAeq >= 85 asks for the
         affected-area extent and distance.                A7  No meter download, no charts.
     A8  Checks with a field note: start after stop / bad duration, LCpeak < LCeq, missed calibration, drift.
     A10 Save or share a photo to the device.  A11 Photos shrunk by envssPhotos.  A12 Crop guide before saving.
     A13/G25 Every audit entry on a noise sample also keeps login, GPS and device (existing collapsed audit log).
     A14 Saved with the sample / event, so the core offline queue and sync carry it.
     A15 Possible duplicate flagged within the same event only.

   v48 (12 Nov 2026 AWST): LAeq "required" clears once a value is entered (REQ-010).
     Dose-badge UI hides the Noise readings heading, badge type, firmware, LCeq and the
     Spectrum Table prompt (REQ-012/015/033). Existing stored values are left intact. */
(function (g) {
  "use strict";
  const NOISE_VERSION = "48.19";
  const C = () => g.envssCore || {};
  const esc = s => (C().esc || g.esc)(s);

  /* noise fault reasons (was noiseRejects() in field.html) */
  function rejects() {
    return [
      { code: "battery_fault", label: "Battery fault", photo: false },
      { code: "measurement_fault", label: "Measurement fault", photo: false }
    ];
  }

  /* START gate for noise (B10). Noise personal: dosimeter serial, first name, last name, occupation.
     Noise static: dosimeter serial, location. Returns the missing labels. */
  function startGaps(t) {
    const miss = [];
    if (!t.dosimeterSerial) miss.push("Dosimeter serial");
    if (C().isStatic(t)) { if (!t.location) miss.push("Location"); }
    else {
      if (!t.person?.first) miss.push("First name");
      if (!t.person?.last) miss.push("Last name");
      if (!String(t.person?.occupation || "").trim()) miss.push("Occupation");
    }
    return miss;
  }

  /* dosimeter + field calibrator inputs on the sample screen (left column) */
  function equipHtml(t) {
    const slm = C().isStatic(t) && t.noise && t.noise.method === "slm";
    return `
          <label>${slm ? "Sound level meter serial" : "Dosimeter serial"}</label>
          <div class="combo">
            <input id="dosimeter" value="${esc(t.dosimeterSerial)}" placeholder="${slm ? "SLM serial (e.g. 2250 SN)" : "Badge serial"}">
            <div class="suggest" id="sug-dosimeter"></div>
          </div>
          <p class="help">${slm ? "Serial of the sound level meter used for this reading." : "Serial on the badge (not the noise sample number)."}</p>
          <label>Field calibrator</label>
          <div class="combo">
            <input id="fieldCal" value="${esc(t.fieldCalibrator || "")}" placeholder="Acoustic calibrator serial" autocomplete="off">
            <div class="suggest" id="sug-fieldCal"></div>
          </div>
          <p class="help">Acoustic calibrator used for the dosimeter field calibration check.</p>`;
  }

  /* hearing protection (noise personal only). Not carried across a person's samples. */
  function hpdFields(t) {
    const yn = C().yn || g.yn;
    const h = t.hpd || {};
    const asked = t.hpdAsked || "";
    const on = asked === "yes";
    return `<div class="${asked ? "" : "need-yn"}">
      <label>Hearing protection worn?</label>
      ${yn("hpd", asked, [["yes","Yes"],["no","No"],["unknown","Unknown"]])}
    </div>
    <div id="hpdBox" style="${on ? "" : "display:none"}">
      <label>Brand / model</label>
      <input id="hpdModel" value="${esc(h.model)}" placeholder="Brand model or Unknown">
      <label>Style</label>
      <input id="hpdStyle" value="${esc(h.style)}" placeholder="earmuff / earplug">
      <label>Class / attenuation</label>
      <input id="hpdClass" value="${esc(h.classRating)}" placeholder="e.g. Class 4 / SLC80 or Unknown">
    </div>`;
  }

  /* v41 (moved): noise samples have no analyses. The "Add analysis" box is not shown for noise (personal or static);
     the contaminant stays NOISE (a stray analysis picked earlier is kept on the record, hidden, and never becomes the
     contaminant). Installed by field.html at the same point in its screen layers as before. */
  function installTrainLayer() {
    const c = C();
    function fixNoise(t) { if (t && c.isNoise(t) && !c.isBlank(t) && (t.trainKind || "").startsWith("noise") && t.contaminantId !== "NOISE") { t.contaminantId = "NOISE"; return true; } return false; }
    const _th41 = g.trainHtml;
    g.trainHtml = function () {
      let html = _th41.apply(this, arguments);
      const v = c.view();
      const t = c.db().trains.find(x => x.id === v.trainId);
      if (t && c.isNoise(t)) { fixNoise(t); const tp = document.createElement("template"); tp.innerHTML = html; tp.content.querySelectorAll(".analysis-box").forEach(e => e.remove()); html = tp.innerHTML; }
      return html;
    };
    try { let n = 0; (c.db().trains || []).forEach(t => { if (fixNoise(t)) n++; }); if (n) c.saveQuiet(); } catch (e) { console.warn("noise.js v41", e); }
  }


  /* ======================= v47 noise module ======================= */
  const NUM = /^-?\d{1,3}(?:[.,]\d{1,2})?$/;
  const OCTAVES = ["31.5", "63", "125", "250", "500", "1000", "2000", "4000", "8000"];
  const DRIFT_LIMIT = 0.5;   // dB, field calibration drift / deviation check
  const ocrMem = new Map();   // per sample, this session only: { state, error }
  const ocrS = t => ocrMem.get(t.id) || {};
  const VAL = { LAeq: "LAeq dB(A)", LCpeak: "LCpeak dB(C)", LCeq: "LCeq dB(C)" };
  const num = v => { const n = parseFloat(String(v == null ? "" : v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
  const str = v => (v == null ? "" : String(v));
  /* nz(t) is READ-ONLY: it never changes the saved sample (opening or listing a sample must not create a change that
     syncs over newer data from another device). nz(t, true) is used only where the user actually enters noise data. */
  function defaultMethod(t) { return C().isStatic(t) ? ((t.startAt || t.endAt) && t.dosimeterSerial ? "dose" : "") : "dose"; }
  function nz(t, write) {
    const has = !!t.noise && typeof t.noise === "object";
    if (!write) {
      const n = has ? t.noise : {};
      if (has && n.method && n.values && n.octave && Array.isArray(n.hpdAtt)) return n;
      return Object.assign({}, n, { method: n.method || defaultMethod(t), values: n.values || {}, octave: n.octave || {}, hpdAtt: Array.isArray(n.hpdAtt) ? n.hpdAtt : [] });
    }
    if (!has) t.noise = {};
    const n = t.noise;
    if (!n.method) n.method = defaultMethod(t);
    n.values = n.values || {};
    n.octave = n.octave || {};
    n.hpdAtt = Array.isArray(n.hpdAtt) ? n.hpdAtt : [];
    return n;
  }
  const dn = t => (C().displayNo || g.displayNo)(t);
  const isSlm = t => C().isStatic(t) && nz(t).method === "slm";
  function evOf(t) { return C().eventById(t.eventId) || {}; }
  function dayOf(t) { return str(t.shiftDate || evOf(t).date || (t.startAt || "").slice(0, 10) || new Date().toISOString().slice(0, 10)).slice(0, 10); }
  function calDay(ev, day) { ev.noiseCal = ev.noiseCal || {}; ev.noiseCal[day] = ev.noiseCal[day] || {}; return ev.noiseCal[day]; }
  function curTrain() { const v = C().view(); return v.page === "train" ? C().db().trains.find(x => x.id === v.trainId) : null; }
  function val(t, k) { const x = nz(t).values[k]; return x ? x.v : ""; }

  /* ----- device, GPS, login for the audit log (A13 / G25) ----- */
  let gps = null, gpsAt = 0;
  function refreshGps() {
    if (!navigator.geolocation || Date.now() - gpsAt < 120e3) return;
    gpsAt = Date.now();
    navigator.geolocation.getCurrentPosition(p => { gps = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }; }, () => {}, { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 });
  }
  function device() {
    const ua = navigator.userAgent || "";
    const os = /CrOS/.test(ua) ? "ChromeOS" : /Android ([\d.]+)/.test(ua) ? "Android " + RegExp.$1 : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "device";
    const model = (/Android [\d.]+; ([^;)]+)/.exec(ua) || [])[1] || "";
    const br = /Edg\/(\d+)/.test(ua) ? "Edge " + RegExp.$1 : /Chrome\/(\d+)/.test(ua) ? "Chrome " + RegExp.$1 : /Firefox\/(\d+)/.test(ua) ? "Firefox " + RegExp.$1 : /Safari\//.test(ua) ? "Safari" : "browser";
    return [os, model.trim(), br, window.innerWidth + "×" + window.innerHeight].filter(Boolean).join(" · ");
  }
  function login() { const o = (C().operator && C().operator()) || {}; return o.email || o.name || C().who(); }
  function gpsText(g) { return g ? g.lat.toFixed(5) + ", " + g.lng.toFixed(5) + " ±" + g.acc + " m" : "no GPS fix"; }
  const INSTALLED_AT = new Date().toISOString();
  function stamp(entry) {
    if (!entry || entry.device || !(String(entry.at || "") >= INSTALLED_AT)) return false;   // never back-stamp older history
    entry.login = login(); entry.device = device(); entry.gps = gps ? Object.assign({}, gps) : null;
    entry.detail = str(entry.detail) + (entry.detail ? " · " : "") + "GPS " + gpsText(gps) + " · " + entry.device;
    return true;
  }
  function note(t, action, detail, field, from, to) {
    t.audit = t.audit || [];
    const e = { at: new Date().toISOString(), who: C().who(), action, field: field || "", from: from == null ? "" : String(from), to: to == null ? "" : String(to), detail: detail || "" };
    stamp(e); t.audit.push(e);
  }

  /* ----- checks (A2, A6, A8, A15) ----- */
  function calState(t) {
    const c = (evOf(t).noiseCal || {})[dayOf(t)] || {};
    const dev = x => (x && num(x.reading) != null && num(x.ref) != null) ? +(num(x.reading) - num(x.ref)).toFixed(2) : null;
    const s = dev(c.start), e = dev(c.end);
    const drift = c.start && c.end && num(c.start.reading) != null && num(c.end.reading) != null ? +(num(c.end.reading) - num(c.start.reading)).toFixed(2) : null;
    return { c, startDev: s, endDev: e, drift };
  }
  function dayDone(t) {
    const day = dayOf(t);
    const list = C().trainsOf(t.eventId).filter(x => C().isNoise(x) && !C().isBlank(x) && dayOf(x) === day);
    return list.length && list.every(x => x.endAt || x.status === "fault" || x.status === "rejected");
  }
  function durationMin(t) {
    if (isSlm(t)) { const d = str(nz(t).duration).trim(); if (!d) return null; const m = /^(\d+):(\d{1,2})$/.exec(d); return m ? (+m[1] + +m[2] / 60) : num(d) != null ? num(d) / 60 : null; }
    if (!t.startAt || !t.endAt) return null;
    return (new Date(t.endAt) - new Date(t.startAt)) / 60000;
  }
  function duplicates(t) {
    const me = nz(t); const out = [];
    C().trainsOf(t.eventId).forEach(x => {
      if (x === t || !C().isNoise(x) || C().isBlank(x) || !x.noise) return;
      const o = x.noise;
      const sameSlm = isSlm(t) && isSlm(x) && str(me.slmNo).trim() && str(me.slmNo).trim() === str(o.slmNo).trim() && str(t.dosimeterSerial) === str(x.dosimeterSerial) && dayOf(t) === dayOf(x);
      const tri = ["LAeq", "LCpeak", "LCeq"].map(k => str((me.values[k] || {}).v)), triO = ["LAeq", "LCpeak", "LCeq"].map(k => str(((o.values || {})[k] || {}).v));
      const sameVals = tri.every(Boolean) && tri.join("|") === triO.join("|");
      const overlap = !isSlm(t) && !isSlm(x) && t.dosimeterSerial && t.dosimeterSerial === x.dosimeterSerial && t.startAt && x.startAt
        && new Date(t.startAt) < new Date(x.endAt || Date.now()) && new Date(x.startAt) < new Date(t.endAt || Date.now());
      if (sameSlm || sameVals || overlap) out.push({ x, why: sameSlm ? "same SLM reading number" : sameVals ? "same LAeq, LCpeak and LCeq" : "same dose badge at overlapping times" });
    });
    return out;
  }
  function flags(t) {
    const n = nz(t), f = [];
    const la = num(val(t, "LAeq")), pk = num(val(t, "LCpeak")), ce = num(val(t, "LCeq"));
    if (t.startAt && t.endAt && new Date(t.startAt) >= new Date(t.endAt)) f.push({ k: "time", sev: "bad", text: "Start is not before stop. Check the times." });
    const d = durationMin(t);
    if (d != null && (d <= 0 || d > 24 * 60)) f.push({ k: "dur", sev: "bad", text: "Duration looks wrong (" + (Math.round(d * 10) / 10) + " min)." });
    if (isSlm(t) && str(n.duration).trim() && d == null) f.push({ k: "dur", sev: "bad", text: "Duration not understood. Use mm:ss or seconds." });
    if (pk != null && ce != null && pk < ce) f.push({ k: "peak", sev: "bad", text: "LCpeak (" + pk + ") is below LCeq (" + ce + "). Re-check the reading." });
    if (isSlm(t) && pk != null && pk >= 140) f.push({ k: "p140", sev: "warn", text: "LCpeak at or above 140 dB(C). Take a Spectrum Table photo." });
    if (isSlm(t) && la != null && la > 110) f.push({ k: "l110", sev: "warn", text: "LAeq above 110 dB(A). Take a Spectrum Table photo." });
    if (C().isStatic(t) && la != null && la >= 85 && !(str(n.extent).trim() && str(n.extentDistance).trim())) f.push({ k: "a85", sev: "warn", text: (nz(t).scope === "task" ? "Task LAeq at or above 85 dB(A). Record the extent and distance." : "Area LAeq at or above 85 dB(A). Record the affected-area extent and distance.") });
    const cs = calState(t);
    if ((t.startAt || la != null) && !cs.c.start) f.push({ k: "calS", sev: "bad", text: "No start-of-day calibration recorded for " + dayOf(t) + "." });
    if (dayDone(t) && !cs.c.end) f.push({ k: "calE", sev: "bad", text: "No end-of-day calibration recorded for " + dayOf(t) + "." });
    if (cs.startDev != null && Math.abs(cs.startDev) > DRIFT_LIMIT) f.push({ k: "devS", sev: "bad", text: "Start calibration off by " + cs.startDev + " dB (limit ±" + DRIFT_LIMIT + ")." });
    if (cs.endDev != null && Math.abs(cs.endDev) > DRIFT_LIMIT) f.push({ k: "devE", sev: "bad", text: "End calibration off by " + cs.endDev + " dB (limit ±" + DRIFT_LIMIT + ")." });
    if (cs.drift != null && Math.abs(cs.drift) > DRIFT_LIMIT) f.push({ k: "drift", sev: "bad", text: "Calibration drift " + (cs.drift > 0 ? "+" : "") + cs.drift + " dB over the day (limit ±" + DRIFT_LIMIT + ")." });
    duplicates(t).forEach(dp => f.push({ k: "dup", sev: "warn", text: "Possible duplicate of " + dn(dp.x) + " (" + dp.why + ")." }));
    return f;
  }

  /* ----- OCR (A4): tesseract.js only when asked, never needed offline ----- */
  const TESS = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
  let tessP = null;
  function loadTess() {
    if (g.Tesseract) return Promise.resolve(g.Tesseract);
    if (!navigator.onLine) return Promise.reject(new Error("offline"));
    if (!tessP) tessP = new Promise((res, rej) => { const s = document.createElement("script"); s.src = TESS; s.async = true; s.onload = () => g.Tesseract ? res(g.Tesseract) : rej(new Error("OCR did not load")); s.onerror = () => { tessP = null; rej(new Error("OCR could not be downloaded")); }; document.head.appendChild(s); });
    return tessP;
  }
  /* read LAeq / LCpeak / LCeq / elapsed time from a meter screen's text (B&K 2250 Broadband, 4448 / Work Noise Partner) */
  function parseScreen(text) {
    const tx = String(text || "").replace(/\r/g, "").replace(/[|]/g, " ");
    const grab = re => { const m = re.exec(tx); return m ? m[1].replace(",", ".") : ""; };
    const out = {
      LAeq: grab(/L\s*A\s*e\s*q(?![\s,]*8\s*h)[^0-9\n]{0,12}(\d{2,3}[.,]\d{1,2})/i),
      LCpeak: grab(/L\s*C\s*p\s*e\s*a\s*k[^0-9\n]{0,12}(\d{2,3}[.,]\d{1,2})/i),
      LCeq: grab(/L\s*C\s*e\s*q[^0-9\n]{0,12}(\d{2,3}[.,]\d{1,2})/i)
    };
    const el = /(?:Elapsed|Duration)[^0-9\n]{0,12}(\d{1,2}:\d{2}(?::\d{2})?)/i.exec(tx);
    if (el) out.duration = el[1].split(":").length === 3 ? (+el[1].split(":")[0] * 60 + +el[1].split(":")[1]) + ":" + el[1].split(":")[2] : el[1];
    return out;
  }
  async function ocr(t, file) {
    const n = nz(t, true);
    ocrMem.set(t.id, { state: "reading" }); paint();
    try {
      const T = await loadTess();
      const r = await T.recognize(file, "eng");
      const got = parseScreen(r && r.data && r.data.text);
      let hits = 0;
      Object.keys(VAL).forEach(k => { if (got[k]) { n.values[k] = { v: got[k], src: "ocr", ocr: got[k] }; hits++; } });
      if (got.duration && isSlm(t) && !str(n.duration).trim()) { n.duration = got.duration; n.durationSrc = "ocr"; }
      ocrMem.set(t.id, { state: hits ? "done" : "none" });
      note(t, "Values read from photo", hits ? Object.keys(VAL).filter(k => got[k]).map(k => k + " " + got[k]).join(", ") : "nothing readable");
    } catch (e) {
      const err = /offline/.test(e.message) ? "offline" : e.message;
      ocrMem.set(t.id, { state: "failed", error: err });
      note(t, "Photo reading not possible", err);
    }
    C().saveQuiet(); paint();
  }

  /* ----- photos with crop guide (A10–A12) ----- */
  function cropFlow(file) {
    return new Promise(res => {
      const url = URL.createObjectURL(file);
      const w = document.createElement("div"); w.className = "nz-modal"; w.id = "nzCrop";
      w.innerHTML = `<div class="nz-dialog"><p class="nz-q">Fit the meter screen inside the frame</p>
        <div class="nz-crop"><img id="nzCropImg" src="${url}" alt="photo"><div class="nz-guide"></div></div>
        <p class="help">Crop to the frame keeps only the screen (smaller, easier to read). Use whole photo keeps everything.</p>
        <div class="row" style="gap:8px;justify-content:flex-end;flex-wrap:wrap"><button type="button" class="btn ghost" id="nzCropCancel">Cancel</button><button type="button" class="btn mid" id="nzCropWhole">Use whole photo</button><button type="button" class="btn green" id="nzCropYes">Crop to frame</button></div></div>`;
      document.body.appendChild(w);
      const done = v => { w.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); res(v); };
      w.querySelector("#nzCropCancel").onclick = () => done(null);
      w.querySelector("#nzCropWhole").onclick = () => done({ file, cropped: false });
      w.querySelector("#nzCropYes").onclick = () => {
        const im = w.querySelector("#nzCropImg");
        const W = im.naturalWidth || 1, H = im.naturalHeight || 1, x = Math.round(W * 0.1), y = Math.round(H * 0.15);
        const cv = document.createElement("canvas"); cv.width = W - 2 * x; cv.height = H - 2 * y;
        cv.getContext("2d").drawImage(im, x, y, cv.width, cv.height, 0, 0, cv.width, cv.height);
        cv.toBlob(b => done({ file: b ? new File([b], "noise-screen.jpg", { type: "image/jpeg" }) : file, cropped: !!b }), "image/jpeg", 0.92);
      };
    });
  }
  async function takePhoto(t, which, file) {
    const r = await cropFlow(file); if (!r) return;
    const ph = C().photos;
    const ref = ph && ph.attach ? await ph.attach(r.file, t, which === "spectrum" ? "noiseSpectrum" : "noiseScreen") : "";
    const n = nz(t, true);
    if (which === "spectrum") { n.spectrumPhoto = ref; note(t, "Spectrum Table photo added", r.cropped ? "cropped to frame" : "whole photo"); }
    else { n.photo = ref; n.photoCropped = r.cropped; note(t, "Meter screen photo added", r.cropped ? "cropped to frame" : "whole photo"); }
    C().saveQuiet(); paint();
    if (which !== "spectrum") ocr(t, r.file);
  }
  async function photoBlob(which) {
    for (let i = 0; i < 8; i++) {
      const im = document.querySelector(`[data-nz-photo="${which}"] img`);
      if (im && im.src && !im.src.startsWith("data:image/gif")) { try { return await (await fetch(im.src)).blob(); } catch (e) { return null; } }
      try { await (C().photos && C().photos.hydrate && C().photos.hydrate()); } catch (e) {}
      await new Promise(r => setTimeout(r, 200));
    }
    return null;
  }
  async function saveToDevice(t, which) {
    const b = await photoBlob(which); if (!b) { alert("The photo is not on this device yet."); return; }
    const name = (evOf(t).code || "event") + "_" + dn(t).replace(/\s+/g, "") + "_" + which + ".jpg";
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    note(t, "Photo saved to device", name); C().saveQuiet();
  }
  async function share(t, which) {
    const b = await photoBlob(which); if (!b) { alert("The photo is not on this device yet."); return; }
    const f = new File([b], (evOf(t).code || "event") + "_" + which + ".jpg", { type: "image/jpeg" });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: dn(t) }); note(t, "Photo shared", which); C().saveQuiet(); } catch (e) {} }
    else saveToDevice(t, which);
  }

  /* ----- panel ----- */
  const esc2 = v => esc(v == null ? "" : v);
  function inp(path, value, ph, extra) { return `<input data-nz="${path}" id="nz-${path.replace(/\W/g, "_")}" value="${esc2(value)}" placeholder="${esc2(ph || "")}" ${extra || ""}>`; }
  function photoBox(t, which, ref, label) {
    const ph = C().photos;
    return `<div class="nz-photo" data-nz-photo="${which}">${ref ? (ph && ph.imgTag ? ph.imgTag(ref, label) : "") + `<div class="row" style="gap:8px;margin-top:6px;flex-wrap:wrap"><button type="button" class="btn ghost" data-nz-save="${which}">Save to device</button><button type="button" class="btn ghost" data-nz-share="${which}">Share</button><label class="btn ghost">Retake<input type="file" accept="image/*" capture="environment" data-nz-take="${which}" hidden></label></div>`
      : `<label class="btn mid nz-take">${esc2(label)}<input type="file" accept="image/*" capture="environment" data-nz-take="${which}" hidden></label>`}</div>`;
  }
  function valueRow(t, k) {
    const n = nz(t), x = n.values[k] || {};
    const filled = String(x.v == null ? "" : x.v).trim() !== "";
    const req = k === "LAeq" && !filled;
    if (n.entry === "photo") {
      const shown = x.v ? esc2(x.v) : "—";
      return `<div class="nz-val" data-nz-row="${k}"><label>${VAL[k]}${req ? ' <span class="nz-req">required</span>' : ""}</label>
        <div class="row" style="gap:8px;align-items:center"><input id="nz${k}" value="${esc2(x.v || "")}" readonly class="nz-ro" placeholder="from photo">
        <button type="button" class="btn ghost" data-nz-fix="${k}">${x.v ? "Correct" : "Enter"}</button></div>
        ${x.src === "corrected" ? `<p class="help nz-orig">Photo read <b>${esc2(x.ocr || "nothing")}</b> → corrected to <b>${shown}</b> by ${esc2(x.by || "")}</p>` : x.src === "ocr" ? `<p class="help">Read from the photo.</p>` : ""}</div>`;
    }
    return `<div class="nz-val" data-nz-row="${k}"><label>${VAL[k]}${req ? ' <span class="nz-req">required</span>' : ""}</label><input data-nz="values.${k}" id="nz${k}" value="${esc2(x.v || "")}" inputmode="decimal" placeholder="e.g. ${k === "LAeq" ? "84.9" : k === "LCpeak" ? "103.8" : "90.9"}"></div>`;
  }
  function calCard(t) {
    const ev = evOf(t), day = dayOf(t), cs = calState(t), c = cs.c;
    const row = (which, label) => {
      const x = c[which] || {};
      return `<div class="nz-cal-row"><strong>${label}</strong>
        <div class="nz-grid3"><div><label>Calibrator level (dB)</label><input data-nz-cal="${which}.ref" value="${esc2(x.ref || "")}" inputmode="decimal" placeholder="94.0 / 114.0"></div>
        <div><label>Meter reading (dB)</label><input data-nz-cal="${which}.reading" value="${esc2(x.reading || "")}" inputmode="decimal" placeholder="e.g. 93.9"></div>
        <div><label>Time</label><input value="${x.at ? esc2(new Date(x.at).toLocaleTimeString("en-AU", { timeZone: "Australia/Perth", hour: "2-digit", minute: "2-digit" }) + " AWST") : ""}" readonly placeholder="set when saved"></div></div>
        ${x.by ? `<p class="help">${esc2(x.by)}${(which === "start" ? cs.startDev : cs.endDev) != null ? " · off by " + (which === "start" ? cs.startDev : cs.endDev) + " dB" : ""}</p>` : ""}</div>`;
    };
    const days = Object.keys(ev.noiseCal || {}).sort();
    return `<div class="card nz-card" id="nzCal"><h3 class="brand-type nz-h">Calibration · ${esc2(day)}</h3>
      <p class="help">Start and end of every day on this event (multi-day jobs: each day again). Calibrator: ${esc2(t.fieldCalibrator || "not set")}.</p>
      ${row("start", "Start of day")}${row("end", "End of day")}
      ${cs.drift != null ? `<p class="${Math.abs(cs.drift) > DRIFT_LIMIT ? "nz-bad" : "help"}">Drift over the day: ${cs.drift > 0 ? "+" : ""}${cs.drift} dB (limit ±${DRIFT_LIMIT} dB)</p>` : ""}
      ${days.length > 1 ? `<p class="help">Days on this event: ${days.map(d => esc2(d) + ((ev.noiseCal[d].start ? " start ✓" : " start ✗") + (ev.noiseCal[d].end ? " end ✓" : " end ✗"))).join(" · ")}</p>` : ""}</div>`;
  }
  function panelHtml(t) {
    const n = nz(t), stat = C().isStatic(t), slm = isSlm(t);
    /* v48: dose-badge UI hides the "Noise readings" heading, badge type, firmware, LCeq and spectrum prompt.
       Stored values (including those hidden fields) are left intact. */
    let h = `<div class="card nz-card" id="nzPanel">`;
    if (slm) h += `<h3 class="brand-type nz-h">Noise readings <span class="nz-ver">noise module v${NOISE_VERSION}</span></h3>`;
    else h += `<span class="nz-ver" hidden>noise module v${NOISE_VERSION}</span>`;
    if (stat && !n.v20) h += `<label>Measured with${n.method ? "" : ' <span class="nz-req">needs answer</span>'}</label><div class="filters">${[["slm", "Sound level meter (area / task)"], ["dose", "Dose badge at a location"]].map(([v, l]) => `<button type="button" class="chip ${n.method === v ? "on" : ""}" data-nz-method="${v}">${l}</button>`).join("")}</div>`;
    else if (stat) h += `<p class="help nz-with">Measured with: <b>${slm ? "Sound level meter (area / task)" : "Dose badge at a location"}</b>. To change it, change the Measurement type below.</p>`;
    else h += `<p class="help">Personal reading on a dose badge (serial above).</p>`;
    if (stat && !n.method) return h + "</div>";
    if (slm) {
      const task = n.scope === "task";
      h += `<label>Area or task?${n.v20 && !n.scope ? ' <span class="nz-req">needs answer</span>' : ""}</label><div class="filters">${[["area", "Area"], ["task", "Task"]].map(([v, l]) => `<button type="button" class="chip ${n.scope === v ? "on" : ""}" data-nz-kind="${v}">${l}</button>`).join("")}</div>`;
      if (task) h += `<label>What the worker is doing${n.v20 && !str(n.task).trim() ? ' <span class="nz-req">needs answer</span>' : ""}</label>${sugField("task", n.task, "e.g. operating a drill", "task")}`;
      h += `<div class="nz-grid2"><div><label>SLM reading number</label>${inp("slmNo", n.slmNo, "e.g. 12 (Meas012)", 'inputmode="numeric"')}</div><div><label>ENVSS reading number</label>${inp("envssNo", n.envssNo || (n.v20 ? "" : String(t.sampleNo || "")), "e.g. 1", 'inputmode="numeric"')}</div></div>
      <label>Noise description / source</label>${sugField("source", n.source, "e.g. Two extraction fans running", "source")}
      <label>Operating conditions / processes</label>${sugField("conditions", n.conditions, "e.g. Fans only, no noisy work", "conditions")}
      <label>Measurement position</label>${sugField("position", n.position, task ? "operator's ear" : "e.g. 1.5 m, left of machine", "position")}${task ? `<p class="help">Task readings: measure at the operator's ear unless you note otherwise.</p>` : ""}
      <label>Duration (mm:ss)</label>${inp("duration", n.duration, "e.g. 1:00")}${n.durationSrc === "ocr" ? '<p class="help">Read from the photo.</p>' : ""}`;
      if (!n.v20) h += `<div class="nz-grid2"><div><label>Microphone serial</label>${inp("micSerial", n.micSerial, "e.g. 4189 SN")}</div><div><label>SLM make / model</label>${sugField("slmModel", n.slmModel, "e.g. B&K 2250", "eqmodel")}</div></div>`;
    }
    if (slm || isNoiseEvent(evOf(t))) h += eqMeasurementHtml(t, slm);
    /* v48: badge type and firmware stay in t.noise if already stored; they are not shown for a dose badge */
    h += `<label>How are the values entered?${n.entry ? "" : ' <span class="nz-req">needs answer</span>'}</label><div class="filters">${[["photo", "From a photo of the screen"], ["manual", "Type them in"]].map(([v, l]) => `<button type="button" class="chip ${n.entry === v ? "on" : ""}" data-nz-entry="${v}">${l}</button>`).join("")}</div>
      <p class="help">One or the other, never both. Switching clears the values from the other way (kept in the audit log).</p>`;
    if (n.entry === "photo") {
      h += photoBox(t, "screen", n.photo, "Take photo of the meter screen");
      const os = ocrS(t);
      if (os.state === "reading") h += `<p class="help" id="nzOcrState">Reading the photo…</p>`;
      else if (os.state === "failed") h += `<p class="nz-warn" id="nzOcrState">${os.error === "offline" ? "Reading the photo needs a connection. The photo is saved; tap Read photo again when online, or Enter each value from the photo." : "The photo could not be read (" + esc2(os.error) + "). Enter each value from the photo."}</p>`;
      else if (os.state === "none") h += `<p class="nz-warn" id="nzOcrState">No values found on the photo. Retake it closer, or Enter each value from the photo.</p>`;
      if (n.photo && os.state !== "reading") h += `<button type="button" class="btn ghost" id="nzReadAgain">Read photo again</button>`;
    }
    if (n.entry) h += Object.keys(VAL).filter(k => slm || k !== "LCeq").map(k => valueRow(t, k)).join("");
    if (n.entry && slm) h += `<details class="nz-oct" ${OCTAVES.some(o => str(n.octave[o]).trim()) ? "open" : ""}><summary>Octave bands (optional, dB)</summary><div class="nz-grid9">${OCTAVES.map(o => `<div><label>${o === "1000" ? "1 kHz" : o === "2000" ? "2 kHz" : o === "4000" ? "4 kHz" : o === "8000" ? "8 kHz" : o + " Hz"}</label>${inp("octave." + o, n.octave[o], "", 'inputmode="decimal"')}</div>`).join("")}</div></details>`;
    const la = num(val(t, "LAeq")), pk = num(val(t, "LCpeak"));
    if (slm && ((pk != null && pk >= 140) || (la != null && la > 110))) h += `<div class="nz-prompt" id="nzSpectrum"><strong>Spectrum Table photo needed</strong><p class="help">${pk != null && pk >= 140 ? "LCpeak ≥ 140 dB(C). " : ""}${la != null && la > 110 ? "LAeq > 110 dB(A). " : ""}Photograph the meter's Spectrum Table.</p>${photoBox(t, "spectrum", n.spectrumPhoto, "Take Spectrum Table photo")}</div>`;
    if (stat && la != null && la >= 85) h += `<div class="nz-prompt" id="nzExtent"><strong>${n.scope === "task" ? "Task LAeq at or above 85 dB(A): extent and distance" : "Affected area (LAeq ≥ 85 dB(A))"}</strong><div class="nz-grid2"><div><label>Extent of affected area</label>${inp("extent", n.extent, "e.g. entire bay / around the fan")}</div><div><label>Distance (m)</label>${inp("extentDistance", n.extentDistance, "e.g. 2", 'inputmode="decimal"')}</div></div></div>`;
    if (slm) h += `<label>Additional comments</label><textarea data-nz="comments" id="nz-comments" rows="2" placeholder="Anything else about this reading">${esc2(n.comments || "")}</textarea>`;
    if (n.entry && stat) {
      const lc = num(val(t, "LCeq"));
      h += `<details class="nz-hpd" ${n.hpdAtt.length ? "open" : ""}><summary>HPD attenuation (optional)</summary><p class="help">Attenuated result = LCeq − expected attenuation (0019340 HPD Attenuation tab).</p>
        ${n.hpdAtt.map((r, i) => `<div class="nz-grid3"><div><label>HPD</label><input data-nz-hpd="${i}.name" value="${esc2(r.name)}" placeholder="e.g. 3M E-A-Rsoft SuperFit"></div><div><label>Expected attenuation (dB)</label><input data-nz-hpd="${i}.att" value="${esc2(r.att)}" inputmode="decimal"></div><div><label>Attenuated result</label><input readonly value="${lc != null && num(r.att) != null ? (lc - num(r.att)).toFixed(2) : lc != null ? lc.toFixed(2) : ""}"></div></div>`).join("")}
        <button type="button" class="btn ghost" id="nzAddHpd">Add HPD</button></details>`;
    }
    const fl = flags(t);
    h += `<div class="nz-checks" id="nzChecks">${fl.length ? `<strong>Checks</strong><ul>${fl.map(f => `<li class="nz-${f.sev}" data-flag="${f.k}">${esc2(f.text)}</li>`).join("")}</ul>
      <label>Field note about these checks</label><textarea data-nz="flagNote" id="nz-flagNote" rows="2" placeholder="What happened (kept with the sample)">${esc2(n.flagNote || "")}</textarea>` : `<p class="help nz-okline">No checks raised.</p>`}</div>`;
    return h + "</div>";
  }
  function paint() {
    const t = curTrain(); if (!t || !C().isNoise(t) || C().isBlank(t)) return;
    const ss = document.querySelector("#app .startstop");
    const p = document.getElementById("nzPanel"), c = document.getElementById("nzCal");
    const active = document.activeElement && document.activeElement.dataset ? (document.activeElement.dataset.nz || document.activeElement.dataset.nzCal || "") : "";
    const caret = active && document.activeElement.selectionStart;
    const openD = new Set([...document.querySelectorAll("#nzPanel details[open]")].map(d => d.className));
    const ph = panelHtml(t), ch = calCard(t);
    if (p) p.outerHTML = ph; else if (ss) { const help = ss.nextElementSibling && ss.nextElementSibling.classList.contains("help") ? ss.nextElementSibling : ss; help.insertAdjacentHTML("afterend", ph); }
    if (c) c.outerHTML = ch; else if (ss) ss.insertAdjacentHTML("beforebegin", ch);
    document.querySelectorAll("#nzPanel details").forEach(d => { if (openD.has(d.className)) d.open = true; });
    if (active) { const e = document.querySelector(`[data-nz="${active}"],[data-nz-cal="${active}"]`); if (e) { e.focus(); try { e.setSelectionRange(caret, caret); } catch (x) {} } }
    try { C().photos && C().photos.hydrate && C().photos.hydrate(); } catch (e) {}
  }
  function splitPath(path) { const m = /^octave\.(\d+(?:\.\d+)?)$/.exec(path); return m ? ["octave", m[1]] : path.split("."); }
  function setPath(o, path, v) { const ps = splitPath(path); let a = o; for (let i = 0; i < ps.length - 1; i++) { a[ps[i]] = a[ps[i]] || {}; a = a[ps[i]]; } a[ps[ps.length - 1]] = v; }
  function getPath(o, path) { return splitPath(path).reduce((a, p) => (a == null ? a : a[p]), o); }
  let typingTimer = null;
  function onInput(e) {
    const el = e.target; if (!el || !el.dataset) return;
    const t = curTrain(); if (!t || !C().isNoise(t)) return;
    if (!el.dataset.nz && !el.dataset.nzCal && !el.dataset.nzHpd) return;   // not a noise field: leave the record alone
    const n = nz(t, true);
    if (el.dataset.nz) {
      const path = el.dataset.nz;
      if (path.startsWith("values.")) {
        const k = path.slice(7); n.values[k] = { v: el.value.trim(), src: "manual" };
        if (k === "LAeq") {
          const row = el.closest(".nz-val");
          const lab = row && row.querySelector("label");
          let badge = row && row.querySelector(".nz-req");
          if (el.value.trim()) { if (badge) badge.style.display = "none"; }
          else if (lab) {
            if (!badge) { badge = document.createElement("span"); badge.className = "nz-req"; badge.textContent = "required"; lab.appendChild(document.createTextNode(" ")); lab.appendChild(badge); }
            else badge.style.display = "";
          }
        }
      }
      else { setPath(n, path, el.value); if (path === "duration") n.durationSrc = "manual"; }
    } else if (el.dataset.nzCal) {
      const [which, key] = el.dataset.nzCal.split(".");
      const ev = evOf(t); const c = calDay(ev, dayOf(t)); c[which] = c[which] || {};
      c[which][key] = el.value.trim();
      if (e.type === "change") { c[which].at = c[which].at || new Date().toISOString(); c[which].by = C().who(); c[which].login = login(); c[which].device = device(); c[which].gps = gpsText(gps);
        note(t, (which === "start" ? "Start" : "End") + "-of-day calibration (" + dayOf(t) + ")", (key === "ref" ? "calibrator level " : "meter reading ") + el.value.trim() + " dB"); }
    } else if (el.dataset.nzHpd) {
      const [i, key] = el.dataset.nzHpd.split("."); n.hpdAtt[+i] = n.hpdAtt[+i] || {}; n.hpdAtt[+i][key] = el.value;
    } else return;
    clearTimeout(typingTimer);
    if (e.type === "change") { C().saveQuiet(); softPaint(); }
    else typingTimer = setTimeout(() => paintChecks(t), 300);   // saved on change / leaving the field, like the rest of the sample
  }
  /* repaint after a change, but never while a finger / mouse is down (a tap on a button must not land on a replaced node) */
  let pointerDown = false, pendingPaint = false;
  function softPaint() { if (pointerDown) pendingPaint = true; else paint(); }
  document.addEventListener("pointerdown", () => { pointerDown = true; }, true);
  document.addEventListener("pointerup", () => { pointerDown = false; if (pendingPaint) { pendingPaint = false; setTimeout(paint, 0); } }, true);
  document.addEventListener("pointercancel", () => { pointerDown = false; if (pendingPaint) { pendingPaint = false; setTimeout(paint, 0); } }, true);
  function paintChecks(t) {
    const box = document.getElementById("nzChecks"); if (!box) return;
    const tp = document.createElement("template"); tp.innerHTML = panelHtml(t);
    const fresh = tp.content.getElementById("nzChecks");
    const ta = document.getElementById("nz-flagNote");
    if (fresh && !(ta && document.activeElement === ta)) box.replaceWith(fresh);
  }
  async function onClick(e) {
    const b = e.target.closest && e.target.closest("[data-nz-kind],[data-nz-method],[data-nz-entry],[data-nz-fix],[data-nz-save],[data-nz-share],#nzReadAgain,#nzAddHpd");
    if (!b) return;
    const t = curTrain(); if (!t || !C().isNoise(t)) return;
    const n = (b.dataset.nzSave || b.dataset.nzShare) ? nz(t) : nz(t, true);
    if (b.dataset.nzKind) {
      const to = b.dataset.nzKind; if (n.scope === to) return;
      note(t, "Area or task", to === "task" ? "Task" : "Area", "noise.scope", n.scope || "", to);
      n.scope = to; C().saveQuiet(); paint();
    } else if (b.dataset.nzMethod) { if (n.method !== b.dataset.nzMethod) { note(t, "Noise measured with", n.method ? (n.method === "slm" ? "SLM → dose badge" : "dose badge → SLM") : (b.dataset.nzMethod === "slm" ? "sound level meter" : "dose badge"), "noise.method", n.method, b.dataset.nzMethod); n.method = b.dataset.nzMethod; C().save(); } else paint(); }
    else if (b.dataset.nzEntry) {
      const to = b.dataset.nzEntry; if (n.entry === to) return;
      const had = Object.keys(VAL).filter(k => (n.values[k] || {}).v);
      if (n.entry && had.length && !confirm("Switch to " + (to === "photo" ? "a photo" : "typing") + "? The values entered " + (n.entry === "photo" ? "from the photo" : "by hand") + " will be cleared (they stay in the audit log).")) return;
      note(t, "Values entered " + (to === "photo" ? "from a photo" : "by hand"), had.length ? "cleared " + had.map(k => k + " " + n.values[k].v + " (" + (n.values[k].src || "") + ")").join(", ") : "", "noise.entry", n.entry || "", to);
      n.entry = to; n.values = {}; ocrMem.delete(t.id); if (n.durationSrc === "ocr") { n.duration = ""; n.durationSrc = ""; }
      C().saveQuiet(); paint();
    } else if (b.dataset.nzFix) {
      const k = b.dataset.nzFix, x = n.values[k] || {};
      const v = prompt((x.v ? "Correct " : "Enter ") + VAL[k] + " as shown on the photo" + (x.v ? " (photo read " + x.v + ")" : ""), x.v || "");
      if (v == null) return;
      const nv = v.trim(); if (nv && !NUM.test(nv)) { alert("Enter a number like 84.9"); return; }
      const orig = x.src === "corrected" ? x.ocr : (x.src === "ocr" ? x.v : "");
      n.values[k] = { v: nv, src: "corrected", ocr: orig, by: C().who(), at: new Date().toISOString() };
      note(t, (orig ? "Corrected " : "Entered ") + VAL[k] + " from the photo", (orig || "(not read)") + " → " + nv + " (photo reading kept)", "noise." + k, orig, nv);
      C().saveQuiet(); paint();
    } else if (b.dataset.nzSave) saveToDevice(t, b.dataset.nzSave);
    else if (b.dataset.nzShare) share(t, b.dataset.nzShare);
    else if (b.id === "nzReadAgain") {
      const blob = await photoBlob("screen"); if (!blob) { alert("The photo is not on this device yet."); return; }
      ocr(t, new File([blob], "noise-screen.jpg", { type: "image/jpeg" }));
    } else if (b.id === "nzAddHpd") { n.hpdAtt.push({ name: "", att: "" }); C().saveQuiet(); paint(); }
  }
  function onFile(e) {
    const el = e.target; if (!el || !el.dataset || !el.dataset.nzTake || !el.files || !el.files[0]) return;
    const t = curTrain(); if (!t) return;
    takePhoto(t, el.dataset.nzTake, el.files[0]);
  }

  /* follow-up list: LAeq required (A3), method and entry chosen */
  function extraItems(t) {
    const out = []; if (!t || !C().isNoise(t) || C().isBlank(t) || t.rejectAsked === "yes") return out;
    const n = nz(t);
    if (C().isStatic(t)) out.push({ key: "nzMethod", label: "Noise: measured with (SLM or dose badge)", ok: !!n.method, sel: "#nzPanel" });
    if (n.v20 && n.method === "slm") {
      out.push({ key: "nzScope", label: "Noise: area or task", ok: !!n.scope, sel: "#nzPanel" });
      if (n.scope === "task") out.push({ key: "nzTask", label: "Noise: what the worker is doing", ok: !!str(n.task).trim(), sel: "#nz-task" });
    }
    out.push({ key: "nzEntry", label: "Noise: values from a photo or typed", ok: !!n.entry, sel: "#nzPanel" });
    out.push({ key: "nzLAeq", label: "LAeq dB(A)", ok: num(val(t, "LAeq")) != null, sel: "#nzLAeq" });
    return out;
  }

  /* ======================= v48.19 noise changes (Add measurement) ======================= */
  /* On a noise event (Podio Occ Noise / type noise) the Add sample screen becomes Add measurement and offers only the three noise types.
     Stored trainKind values do not change: noise_personal stays noise_personal, and noise_static carries t.noise.method
     ("slm" | "dose"). Only the wording is different on noise events; hygiene events and airborne samples are untouched. */
  const isNoiseEvent = ev => !!ev && (ev.podioEventKind === "noise" || ev.type === "noise");
  const curEvent = () => { try { return C().eventById(C().view().eventId); } catch (e) { return null; } };
  const NZ_TYPES = [
    ["noise_personal", "Noise · personal (dose badge)", "Dose badge worn by a person. HPD. No cassette."],
    ["noise_slm", "Noise · area / task (sound level meter)", "Sound level meter, at a place (area) or on a worker's task."],
    ["noise_staticdose", "Noise · static dose badge", "Dose badge left at a location."]
  ];
  function optionOf(t) {
    if (!t) return "";
    if (t.trainKind === "noise_personal") return "noise_personal";
    if (t.trainKind === "noise_static") { const m = nz(t).method; return m === "slm" ? "noise_slm" : m === "dose" ? "noise_staticdose" : "noise_static"; }
    return t.trainKind || "";
  }
  function nzKindName(t) {
    const o = optionOf(t); const x = NZ_TYPES.find(a => a[0] === o);
    return x ? x[1] : o === "noise_static" ? "Noise · static" : "";
  }
  function addMeasurement(eventId, which) {
    const c = C();
    if (which === "personal") { g.addTrain(eventId, "noise_personal"); return; }
    const before = new Set((c.db().trains || []).map(x => x.id));
    g.addTrain(eventId, "noise_static");
    const t = (c.db().trains || []).find(x => !before.has(x.id) && x.eventId === eventId);
    if (!t) return;   // the person said no to the confirmation
    const n = nz(t, true); n.method = which === "slm" ? "slm" : "dose"; n.v20 = true;
    if (which === "slm") n.envssNo = String(nextEnvssNo(eventId, t));
    note(t, "Measurement type", which === "slm" ? "Noise · area / task (sound level meter)" : "Noise · static dose badge", "noise.method", "", n.method);
    c.saveQuiet(); c.render();
  }
  function nextEnvssNo(eventId, self) {
    let max = 0, cnt = 0;
    C().trainsOf(eventId).forEach(x => { if (x === self || !C().isNoise(x) || C().isBlank(x)) return; cnt++; const v = parseInt(str(nz(x).envssNo), 10); if (Number.isFinite(v) && v > max) max = v; });
    return Math.max(max, cnt) + 1;
  }
  function pickHtml20() {
    const ev = curEvent(), id = C().view().eventId;
    return `<div class="wrap">
    <button class="btn ghost" onclick="openEvent('${id}')">← ${ev ? esc2(ev.code) : "Event"}</button>
    <h2 class="brand-type" style="color:var(--navy)">Add measurement</h2>
    ${[["personal", NZ_TYPES[0]], ["slm", NZ_TYPES[1]], ["dose", NZ_TYPES[2]]].map(([w, a]) => `<div class="card" style="cursor:pointer" data-nz-add="${w}" onclick="ENVSS_NOISE.addMeasurement('${id}','${w}')">
      <strong>${a[1]}</strong><div class="muted">${a[2]}</div>
    </div>`).join("")}
  </div>`;
  }

  /* ----- measurement wording: display only, on noise events ----- */
  function meas(s) {
    return s.replace(/\bNoise Sample\b/g, "Noise Measurement").replace(/\bSAMPLES\b/g, "MEASUREMENTS").replace(/\bSAMPLE\b/g, "MEASUREMENT")
      .replace(/\bSamples\b/g, "Measurements").replace(/\bSample\b/g, "Measurement").replace(/\bsamples\b/g, "measurements").replace(/\bsample\b/g, "measurement");
  }
  function wordingScope() {
    const v = C().view(); if (!v) return "";
    if (v.page === "event" || v.page === "pickType") return isNoiseEvent(C().eventById(v.eventId)) ? "event" : "";
    if (v.page === "train") { const t = curTrain(); return t && C().isNoise(t) && !C().isBlank(t) && isNoiseEvent(evOf(t)) ? "train" : ""; }
    return "";
  }
  function wording() {
    const scope = wordingScope(); if (!scope) return;
    const app = document.getElementById("app"); if (!app) return;
    const tw = document.createTreeWalker(app, NodeFilter.SHOW_TEXT);
    const todo = []; let nd;
    while ((nd = tw.nextNode())) {
      if (!/sample|Noise trains can switch/i.test(nd.nodeValue)) continue;
      const p = nd.parentElement; if (!p || /^(SCRIPT|STYLE|TEXTAREA|INPUT)$/.test(p.tagName)) continue;
      const row = p.closest(".train[onclick]");
      if (row) {
        const m = /openTrain\('([^']+)'\)/.exec(row.getAttribute("onclick") || "");
        const t = m && C().db().trains.find(x => x.id === m[1]);
        if (!t || !C().isNoise(t) || C().isBlank(t)) continue;
      }
      todo.push(nd);
    }
    todo.forEach(x => { const s = x.nodeValue.replace("Noise trains can switch personal ↔ static only.", "Noise measurements can switch between personal, area / task and static dose badge.").replace("Sample train type", "Measurement type"); x.nodeValue = meas(s); });
    /* previous / next arrows (outside #app on wide screens, a bar on phones): only the "Noise Sample N" labels change */
    document.querySelectorAll(".v484-side, #v484Nav").forEach(box => {
      const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT); let x;
      while ((x = w.nextNode())) if (/Noise Sample/.test(x.nodeValue)) x.nodeValue = x.nodeValue.replace(/Noise Sample/g, "Noise Measurement");
      box.querySelectorAll("[aria-label]").forEach(b => { b.setAttribute("aria-label", b.getAttribute("aria-label").replace(/sample$/, "measurement")); });
    });
    /* the bottom bar and the + button */
    const fab = document.querySelector(".fab");
    if (fab && /Add sample/i.test(fab.textContent)) fab.innerHTML = "<b>+</b>Add measurement";
    const ns = document.querySelector('nav.bnav [data-go="add"] span'); if (ns && /^sample$/i.test(ns.textContent.trim())) ns.textContent = "Measure";
  }

  /* ----- drop-downs built from values already used (this event first, then earlier events) ----- */
  function usedValues(kind, t, typ) {
    const evId = t && t.eventId, tally = new Map();
    const add = (v, w) => { v = str(v).trim(); if (!v) return; const k = v.toLowerCase(); const o = tally.get(k) || { v, c: 0, w: 0 }; o.c++; o.w += w; tally.set(k, o); };
    const trains = C().db().trains || [];
    const evEq = ev => (Array.isArray(ev && ev.noiseEquip) ? ev.noiseEquip : []);
    if (kind === "eqmodel") {
      typ = typ || "";
      (C().db().events || []).forEach(ev => evEq(ev).forEach(it => { if (!typ || it.type === typ) add(it.model, ev.id === evId ? 1000 : 0); }));
      trains.forEach(x => { const o = x.noise; if (!o) return; if (typ === "slm") add(o.slmModel, 0); });
    } else {
      trains.forEach(x => { if (!C().isNoise(x) || C().isBlank(x) || !x.noise) return; add(x.noise[kind], x.eventId === evId ? 1000 : 0); });
    }
    const list = [...tally.values()].sort((a, b) => (b.w - a.w) || (b.c - a.c) || a.v.localeCompare(b.v)).map(o => o.v);
    if (kind === "position" && t && nz(t).scope === "task") { const i = list.findIndex(v => /^operator'?s ear$/i.test(v)); if (i >= 0) list.splice(i, 1); list.unshift("Operator's ear"); }
    return list;
  }
  function sugBox(el) { const c = el.closest(".combo"); return c && c.querySelector(".suggest"); }
  function showSug(el) {
    const box = sugBox(el); if (!box) return;
    const t = curTrain();
    const kind = el.dataset.nzSug;
    let list;
    if (kind === "eqmodel") { const f = el.closest("[data-nz-eqform],[data-nz-eqrow]"); const ty = f && ((f.querySelector("[data-nz-eqf=type]") || {}).value || f.dataset.nzEqtype); list = usedValues("eqmodel", t || { eventId: C().view().eventId }, ty || ""); }
    else if (t) list = usedValues(kind, t); else list = [];
    const q = el.value.trim().toLowerCase();
    list = list.filter(v => !q || (v.toLowerCase().includes(q) && v.toLowerCase() !== q)).slice(0, 30);
    if (!list.length) { box.classList.remove("on"); box.innerHTML = ""; return; }
    box.innerHTML = list.map(v => `<div data-v="${esc2(v)}">${esc2(v)}</div>`).join(""); box.classList.add("on");
  }
  function hideSugs() { document.querySelectorAll(".combo .suggest.on").forEach(b => b.classList.remove("on")); }
  function sugField(path, value, ph, kind, extra) {
    return `<div class="combo nz-combo"><input data-nz="${path}" data-nz-sug="${kind}" id="nz-${path.replace(/\W/g, "_")}" value="${esc2(value)}" placeholder="${esc2(ph || "")}" autocomplete="off" ${extra || ""}><div class="suggest"></div></div>`;
  }

  /* ----- Equipment Used (once per event) ----- */
  const EQ_TYPES = [["mic", "Microphone"], ["slm", "Type 1 Sound Level Meter"], ["cal", "Sound Calibrator"]];
  const eqName = k => (EQ_TYPES.find(a => a[0] === k) || [])[1] || k;
  const eqItems = ev => (Array.isArray(ev && ev.noiseEquip) ? ev.noiseEquip.filter(x => x && x.id) : []);
  const eqText = it => [it.model, it.serial ? "SN " + it.serial : ""].filter(Boolean).join(" · ") || "(no details)";
  const MIRROR = { mic: ["micSerial", "micModel"], slm: ["slmModel"], cal: [] };
  function mirrorPick(t, type, it) {
    const n = nz(t, true); n.equip = n.equip || {}; n.equip[type] = it ? it.id : "";
    if (!it) return;
    if (type === "mic") { n.micSerial = it.serial || ""; n.micModel = it.model || ""; }
    else if (type === "slm") { t.dosimeterSerial = it.serial || ""; n.slmModel = it.model || ""; const e = document.getElementById("dosimeter"); if (e) e.value = t.dosimeterSerial; }
    else if (type === "cal") { t.fieldCalibrator = it.serial || ""; const e = document.getElementById("fieldCal"); if (e) e.value = t.fieldCalibrator; }
  }
  function pickedItem(t, type) {
    const ev = evOf(t), n = nz(t); const id = n.equip && n.equip[type];
    return id ? eqItems(ev).find(x => x.id === id) || null : null;
  }
  function eqSelect(t, type) {
    const ev = evOf(t), items = eqItems(ev).filter(x => x.type === type), cur = pickedItem(t, type);
    const n = nz(t);
    const legacy = type === "mic" ? n.micSerial : type === "slm" ? t.dosimeterSerial : t.fieldCalibrator;
    let opts = `<option value="">${items.length ? "— choose —" : "— none entered for this event —"}</option>` + items.map(x => `<option value="${esc2(x.id)}" ${cur && cur.id === x.id ? "selected" : ""}>${esc2(eqText(x))}</option>`).join("");
    if (!cur && str(legacy).trim()) opts += `<option value="__legacy" selected>${esc2(str(legacy))} (this measurement only)</option>`;
    return `<div><label>${eqName(type)}</label><select data-nz-eqpick="${type}" id="nz-eq-${type}">${opts}</select></div>`;
  }
  /* what is typed in an Add equipment form is kept in memory, so a screen refresh in the middle of typing does not lose it */
  const eqDraft = { e: {}, m: {} };
  function eqFormHtml(ctx, defType) {
    const d = eqDraft[ctx] || {}, ty = d.type || defType;
    return `<div class="nz-eqform" data-nz-eqform="${ctx}">
      <div class="nz-grid3"><div><label>Type</label><select data-nz-eqf="type">${EQ_TYPES.map(([k, l]) => `<option value="${k}" ${k === ty ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div><label>Make / model</label><div class="combo nz-combo"><input data-nz-eqf="model" data-nz-sug="eqmodel" autocomplete="off" placeholder="e.g. B&amp;K 2250" value="${esc2(d.model || "")}"><div class="suggest"></div></div></div>
      <div><label>Serial</label><input data-nz-eqf="serial" autocomplete="off" placeholder="e.g. 3005012" value="${esc2(d.serial || "")}"></div></div>
      <button type="button" class="btn mid" data-nz-eqadd="${ctx}">Add equipment</button></div>`;
  }
  function eqKeepDraft(e) {
    const el = e.target; if (!el || !el.dataset || !el.dataset.nzEqf) return;
    const f = el.closest("[data-nz-eqform]"); if (!f) return;
    (eqDraft[f.dataset.nzEqform] = eqDraft[f.dataset.nzEqform] || {})[el.dataset.nzEqf] = el.value;
  }
  function eqMeasurementHtml(t, slm) {
    const types = slm ? ["slm", "mic", "cal"] : ["cal"];
    return `<div class="nz-equip" id="nzEquipPick"><label class="nz-sub">Equipment used</label><div class="nz-grid3">${types.map(k => eqSelect(t, k)).join("")}</div>
      <details class="nz-eqadd"><summary>Add equipment to this event</summary><p class="help">Entered once for the whole event, then picked here for each measurement.</p>${eqFormHtml("m", types[0])}</details></div>`;
  }
  let eqOpenState = false;
  function eqCardHtml(ev, keepOpen) {
    const items = eqItems(ev);
    const rows = items.map(it => `<div class="nz-eqrow" data-nz-eqrow="${esc2(it.id)}" data-nz-eqtype="${it.type}"><strong>${eqName(it.type)}</strong>
      <div class="nz-grid2"><div><label>Make / model</label><div class="combo nz-combo"><input data-nz-eqedit="${esc2(it.id)}.model" data-nz-sug="eqmodel" autocomplete="off" value="${esc2(it.model)}"><div class="suggest"></div></div></div>
      <div><label>Serial</label><input data-nz-eqedit="${esc2(it.id)}.serial" autocomplete="off" value="${esc2(it.serial)}"></div></div>
      <button type="button" class="btn ghost" data-nz-eqdel="${esc2(it.id)}">Remove</button></div>`).join("");
    return `<div class="card nz-card" id="nzEquip"><h3 class="brand-type nz-h">Equipment used</h3>
      <p class="help">Enter each item once for this event: microphone, Type 1 sound level meter and sound calibrator. Each measurement then picks from this list.</p>
      ${rows || '<p class="help">No equipment entered yet.</p>'}
      <details class="nz-eqadd" ${items.length && !keepOpen && !eqOpenState ? "" : "open"}><summary>Add equipment</summary>${eqFormHtml("e", "slm")}</details></div>`;
  }
  function paintEvent() {
    const v = C().view(); if (!v || v.page !== "event") return;
    const ev = C().eventById(v.eventId); if (!isNoiseEvent(ev)) return;
    const old = document.getElementById("nzEquip");
    const html = eqCardHtml(ev, !!(old && old.querySelector("details.nz-eqadd[open]")));
    if (old) { old.outerHTML = html; return; }
    const btn = document.getElementById("btnAddSampleTop"); const row = btn && (btn.closest(".row") || btn.parentElement);
    if (row) row.insertAdjacentHTML("afterend", html);
  }
  function eqChange(e) {
    const el = e.target; if (!el || !el.dataset) return false;
    if (el.dataset.nzEqpick) {
      const t = curTrain(); if (!t || !C().isNoise(t)) return true;
      const type = el.dataset.nzEqpick, id = el.value;
      if (id === "__legacy") return true;
      const it = id ? eqItems(evOf(t)).find(x => x.id === id) : null;
      const before = (nz(t).equip || {})[type] || "";
      mirrorPick(t, type, it);
      if (id !== before) note(t, "Equipment picked", eqName(type) + ": " + (it ? eqText(it) : "none"), "noise.equip." + type, before, id);
      C().saveQuiet(); softPaint(); return true;
    }
    if (el.dataset.nzEqedit) {
      const [id, key] = el.dataset.nzEqedit.split("."); const v = C().view();
      const ev = C().eventById(v.eventId); const it = eqItems(ev).find(x => x.id === id); if (!it) return true;
      const val2 = el.value.trim(); if (it[key] === val2) return true;
      const old = it[key]; it[key] = val2;
      (C().trainsOf(ev.id) || []).forEach(x => { if (!C().isNoise(x)) return; const n = nz(x); if (n.equip && n.equip[it.type] === id) { mirrorPick(x, it.type, it); note(x, "Equipment details changed on the event", eqName(it.type) + " " + key + ": " + old + " → " + val2, "noise.equip." + it.type + "." + key, old, val2); } });
      C().saveQuiet(); return true;
    }
    return !!(el.dataset.nzEqf);
  }
  function eqClick(e) {
    const b = e.target.closest && e.target.closest("[data-nz-eqadd],[data-nz-eqdel]"); if (!b) return false;
    const v = C().view();
    if (b.dataset.nzEqdel) {
      const ev = C().eventById(v.eventId); if (!ev || !Array.isArray(ev.noiseEquip)) return true;
      const it = ev.noiseEquip.find(x => x.id === b.dataset.nzEqdel); if (!it) return true;
      if (!confirm("Remove " + eqName(it.type) + " " + eqText(it) + " from this event? Measurements that already used it keep what they recorded.")) return true;
      ev.noiseEquip = ev.noiseEquip.filter(x => x.id !== it.id);
      (C().trainsOf(ev.id) || []).forEach(x => { const n = x.noise; if (n && n.equip && n.equip[it.type] === it.id) { n.equip[it.type] = ""; note(x, "Equipment removed from the event", eqName(it.type) + " " + eqText(it) + " (this measurement keeps its recorded value)"); } });
      C().saveQuiet(); paintEvent(); return true;
    }
    const f = b.closest("[data-nz-eqform]"); const ctx = f.dataset.nzEqform;
    const q = k => (f.querySelector(`[data-nz-eqf=${k}]`) || {}).value || "";
    const type = q("type"), model = q("model").trim(), serial = q("serial").trim();
    if (!model && !serial) { alert("Enter the make / model or the serial."); return true; }
    const t = ctx === "m" ? curTrain() : null;
    const ev = ctx === "m" ? (t && evOf(t)) : C().eventById(v.eventId); if (!ev) return true;
    ev.noiseEquip = Array.isArray(ev.noiseEquip) ? ev.noiseEquip : [];
    let it = ev.noiseEquip.find(x => x.type === type && str(x.model).trim().toLowerCase() === model.toLowerCase() && str(x.serial).trim().toLowerCase() === serial.toLowerCase());
    if (!it) { it = { id: "eq" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type, model, serial }; ev.noiseEquip.push(it); }
    if (t) { mirrorPick(t, type, it); note(t, "Equipment picked", eqName(type) + ": " + eqText(it), "noise.equip." + type, "", it.id); }
    eqDraft[ctx] = {};
    C().saveQuiet(); if (t) paint(); else paintEvent();
    return true;
  }


  function installV20() {
    const c = C();
    if (typeof g.pickTypeHtml === "function") { const _p = g.pickTypeHtml; g.pickTypeHtml = function () { return isNoiseEvent(curEvent()) ? pickHtml20() : _p.apply(this, arguments); }; }
    if (typeof g.kindLabel === "function") { const _k = g.kindLabel; g.kindLabel = function (t) { try { if (t && (t.trainKind || "").startsWith("noise")) { const nm = nzKindName(t); if (nm) return nm; } } catch (e) {} return _k.apply(this, arguments); }; }
    if (typeof g.trainKindOptions === "function") {
      const _o = g.trainKindOptions;
      g.trainKindOptions = function (t) {
        if (!t || !(t.trainKind || "").startsWith("noise")) return _o.apply(this, arguments);
        const cur = optionOf(t), list = NZ_TYPES.map(a => [a[0], a[1]]);
        if (cur === "noise_static") list.push(["noise_static", "Noise · static (method not chosen yet)"]);
        return list.map(([v, l]) => `<option value="${v}" ${v === cur ? "selected" : ""}>${l}</option>`).join("");
      };
    }
    if (typeof g.applyTrainKind === "function") {
      const _a = g.applyTrainKind;
      g.applyTrainKind = function (t, kind) {
        if (kind === "noise_slm" || kind === "noise_staticdose") {
          const r = _a.call(this, t, "noise_static"); const n = nz(t, true), m = kind === "noise_slm" ? "slm" : "dose";
          if (n.method !== m) { note(t, "Measurement type", NZ_TYPES.find(a => a[0] === kind)[1], "noise.method", n.method, m); n.method = m; }
          return r;
        }
        return _a.apply(this, arguments);
      };
    }
    const _cf = g.confirm.bind(g);
    g.confirm = function (m) { try { if (typeof m === "string" && /add a new sample\?/i.test(m) && isNoiseEvent(curEvent())) m = m.replace(/sample/i, "measurement"); } catch (e) {} return _cf(m); };
  }
  function installLate() {
    if (g.__nz47) return; g.__nz47 = true;
    if (typeof g.answerItems === "function") { const _ai = g.answerItems; g.answerItems = function (t) { const r = _ai.apply(this, arguments); try { return r.concat(extraItems(t)); } catch (e) { return r; } }; }
    let stamping = false;
    if (typeof g.commit === "function") {
      const _c = g.commit;
      g.commit = function () {
        const r = _c.apply(this, arguments);
        if (stamping) return r;
        try {
          const t = curTrain(); let ch = false;
          if (t && C().isNoise(t)) (t.audit || []).forEach(a => { if (stamp(a)) ch = true; });
          if (ch) { stamping = true; try { _c.apply(this, arguments); } finally { stamping = false; } }
        } catch (e) { console.warn("noise.js audit stamp", e); }
        return r;
      };
    }
    installV20();
    if (typeof g.render === "function") {
      const _r = g.render;
      g.render = function () { const r = _r.apply(this, arguments); try { paintEvent(); wording(); } catch (e) { console.warn("noise.js v48.19 ui", e); } try { const t = curTrain(); if (t && C().isNoise(t) && !C().isBlank(t)) { refreshGps(); paint(); } } catch (e) { console.warn("noise.js paint", e); } return r; };
    }
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", e => { if (e.target && e.target.dataset && e.target.dataset.nzTake) onFile(e); else if (!eqChange(e)) onInput(e); }, true);
    document.addEventListener("click", e => { if (!eqClick(e)) onClick(e); });
    document.addEventListener("focusin", e => { const el = e.target; if (el && el.dataset && el.dataset.nzSug) showSug(el); }, true);
    document.addEventListener("input", e => { eqKeepDraft(e); const el = e.target; if (el && el.dataset && el.dataset.nzSug) showSug(el); }, true);
    document.addEventListener("change", eqKeepDraft, true);
    document.addEventListener("toggle", e => { if (e.target && e.target.matches && e.target.matches("#nzEquip details.nz-eqadd")) eqOpenState = e.target.open; }, true);
    document.addEventListener("mousedown", e => {
      const d = e.target.closest && e.target.closest(".nz-combo .suggest [data-v]");
      if (d) { e.preventDefault(); const inpEl = d.closest(".combo").querySelector("input"); inpEl.value = d.dataset.v; hideSugs(); inpEl.dispatchEvent(new Event("input", { bubbles: true })); inpEl.dispatchEvent(new Event("change", { bubbles: true })); }
      else if (!(e.target.closest && e.target.closest(".nz-combo"))) hideSugs();
    }, true);
    document.addEventListener("focusout", () => setTimeout(() => { const a = document.activeElement; if (!(a && a.closest && a.closest(".nz-combo"))) hideSugs(); }, 120), true);
    const st = document.createElement("style");
    st.textContent = ".nz-card{margin-top:12px}.nz-h{margin:0 0 6px;color:var(--navy)}.nz-ver{font-size:11px;font-weight:600;opacity:.7;margin-left:6px}"
      + ".nz-req{font-size:11px;font-weight:700;background:#3A2A0E;color:#FFC861;border-radius:999px;padding:1px 8px;margin-left:6px}"
      + ".nz-grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}.nz-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 8px}"
      + ".nz-grid9{display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:0 6px}.nz-grid9 input{padding-left:6px;padding-right:4px}.nz-grid9 label{font-size:12px;white-space:nowrap}"
      + "@media (max-width:599px){.nz-grid3{grid-template-columns:1fr 1fr}.nz-grid9{grid-template-columns:repeat(3,minmax(0,1fr))}.nz-equip .nz-grid3{grid-template-columns:1fr}}"
      + ".nz-ro{flex:1}.nz-orig{color:#FFC861}.nz-prompt{margin-top:10px;padding:10px;border-radius:10px;border:2px solid #FFB020}"
      + ".nz-checks ul{margin:6px 0 6px 18px;padding:0}.nz-checks li{margin:4px 0;font-weight:700}.nz-bad,.nz-checks .nz-bad{color:#FF7A7A;font-weight:700}.nz-warn,.nz-checks .nz-warn{color:#FFC861;font-weight:700}"
      + ".nz-cal-row{margin-top:8px}.nz-photo img{max-width:100%!important}.nz-take{display:inline-block;margin-top:8px}"
      + ".nz-modal{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:12px}"
      + ".nz-dialog{background:var(--surf2,#1c2233);color:var(--text,#fff);border-radius:14px;padding:14px;max-width:560px;width:100%}.nz-q{font-weight:700;margin:0 0 8px}"
      + ".nz-crop{position:relative}.nz-crop img{width:100%;display:block;border-radius:8px}.nz-guide{position:absolute;left:10%;right:10%;top:15%;bottom:15%;border:3px dashed #FFB020;border-radius:6px;box-shadow:0 0 0 999px rgba(0,0,0,.35)}"
      + ".nz-combo{position:relative}.nz-combo .suggest{max-height:220px;overflow:auto}.nz-sub{display:block;margin-top:10px;font-weight:700}.nz-eqrow{margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,.12)}.nz-eqadd{margin-top:10px}.nz-eqadd summary{cursor:pointer;font-weight:700}.nz-equip select{width:100%}"
      + ".nz-oct,.nz-hpd{margin-top:10px}.nz-oct summary,.nz-hpd summary{cursor:pointer;font-weight:700}";
    document.head.appendChild(st);
    try { g.render(); } catch (e) {}
  }
  if (document.readyState === "complete") setTimeout(installLate, 0); else g.addEventListener("load", installLate);

  g.ENVSS_NOISE = { version: NOISE_VERSION, loaded: true, rejects, startGaps, equipHtml, hpdFields, installTrainLayer,
    flags, parseScreen, calState, duplicates, extraItems, device,
    addMeasurement, isNoiseEvent, nextEnvssNo, usedValues, optionOf };
})(window);

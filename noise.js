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
  const NOISE_VERSION = "48.0";
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
  const OCTAVES = ["125", "250", "500", "1000", "2000", "4000", "8000"];
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
    if (C().isStatic(t) && la != null && la >= 85 && !(str(n.extent).trim() && str(n.extentDistance).trim())) f.push({ k: "a85", sev: "warn", text: "Area LAeq at or above 85 dB(A). Record the affected-area extent and distance." });
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
    if (stat) h += `<label>Measured with${n.method ? "" : ' <span class="nz-req">needs answer</span>'}</label><div class="filters">${[["slm", "Sound level meter (area / task)"], ["dose", "Dose badge at a location"]].map(([v, l]) => `<button type="button" class="chip ${n.method === v ? "on" : ""}" data-nz-method="${v}">${l}</button>`).join("")}</div>`;
    else h += `<p class="help">Personal reading on a dose badge (serial above).</p>`;
    if (stat && !n.method) return h + "</div>";
    if (slm) h += `<div class="nz-grid2"><div><label>SLM reading number</label>${inp("slmNo", n.slmNo, "e.g. 12 (Meas012)", 'inputmode="numeric"')}</div><div><label>ENVSS reading number</label>${inp("envssNo", n.envssNo || String(t.sampleNo || ""), "e.g. 1", 'inputmode="numeric"')}</div></div>
      <label>Noise description / source</label>${inp("source", n.source, "e.g. Two extraction fans running")}
      <label>Operating conditions / processes</label>${inp("conditions", n.conditions, "e.g. Fans only, no noisy work")}
      <label>Measurement position</label>${inp("position", n.position, "e.g. operator's ear, 1.5 m, left of machine")}
      <label>Duration (mm:ss)</label>${inp("duration", n.duration, "e.g. 1:00")}${n.durationSrc === "ocr" ? '<p class="help">Read from the photo.</p>' : ""}
      <div class="nz-grid2"><div><label>Microphone serial</label>${inp("micSerial", n.micSerial, "e.g. 4189 SN")}</div><div><label>SLM make / model</label>${inp("slmModel", n.slmModel, "e.g. B&K 2250")}</div></div>`;
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
    if (n.entry && slm) h += `<details class="nz-oct" ${OCTAVES.some(o => str(n.octave[o]).trim()) ? "open" : ""}><summary>Octave bands (optional, dB)</summary><div class="nz-grid7">${OCTAVES.map(o => `<div><label>${o === "1000" ? "1k" : o === "2000" ? "2k" : o === "4000" ? "4k" : o === "8000" ? "8k" : o}</label>${inp("octave." + o, n.octave[o], "", 'inputmode="decimal"')}</div>`).join("")}</div></details>`;
    const la = num(val(t, "LAeq")), pk = num(val(t, "LCpeak"));
    if (slm && ((pk != null && pk >= 140) || (la != null && la > 110))) h += `<div class="nz-prompt" id="nzSpectrum"><strong>Spectrum Table photo needed</strong><p class="help">${pk != null && pk >= 140 ? "LCpeak ≥ 140 dB(C). " : ""}${la != null && la > 110 ? "LAeq > 110 dB(A). " : ""}Photograph the meter's Spectrum Table.</p>${photoBox(t, "spectrum", n.spectrumPhoto, "Take Spectrum Table photo")}</div>`;
    if (stat && la != null && la >= 85) h += `<div class="nz-prompt" id="nzExtent"><strong>Affected area (LAeq ≥ 85 dB(A))</strong><div class="nz-grid2"><div><label>Extent of affected area</label>${inp("extent", n.extent, "e.g. entire bay / around the fan")}</div><div><label>Distance (m)</label>${inp("extentDistance", n.extentDistance, "e.g. 2", 'inputmode="decimal"')}</div></div></div>`;
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
  function setPath(o, path, v) { const ps = path.split("."); let a = o; for (let i = 0; i < ps.length - 1; i++) { a[ps[i]] = a[ps[i]] || {}; a = a[ps[i]]; } a[ps[ps.length - 1]] = v; }
  function getPath(o, path) { return path.split(".").reduce((a, p) => (a == null ? a : a[p]), o); }
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
    const b = e.target.closest && e.target.closest("[data-nz-method],[data-nz-entry],[data-nz-fix],[data-nz-save],[data-nz-share],#nzReadAgain,#nzAddHpd");
    if (!b) return;
    const t = curTrain(); if (!t || !C().isNoise(t)) return;
    const n = (b.dataset.nzSave || b.dataset.nzShare) ? nz(t) : nz(t, true);
    if (b.dataset.nzMethod) { if (n.method !== b.dataset.nzMethod) { note(t, "Noise measured with", n.method ? (n.method === "slm" ? "SLM → dose badge" : "dose badge → SLM") : (b.dataset.nzMethod === "slm" ? "sound level meter" : "dose badge"), "noise.method", n.method, b.dataset.nzMethod); n.method = b.dataset.nzMethod; C().save(); } else paint(); }
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
    out.push({ key: "nzEntry", label: "Noise: values from a photo or typed", ok: !!n.entry, sel: "#nzPanel" });
    out.push({ key: "nzLAeq", label: "LAeq dB(A)", ok: num(val(t, "LAeq")) != null, sel: "#nzLAeq" });
    return out;
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
    if (typeof g.render === "function") {
      const _r = g.render;
      g.render = function () { const r = _r.apply(this, arguments); try { const t = curTrain(); if (t && C().isNoise(t) && !C().isBlank(t)) { refreshGps(); paint(); } } catch (e) { console.warn("noise.js paint", e); } return r; };
    }
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", e => { if (e.target && e.target.dataset && e.target.dataset.nzTake) onFile(e); else onInput(e); }, true);
    document.addEventListener("click", onClick);
    const st = document.createElement("style");
    st.textContent = ".nz-card{margin-top:12px}.nz-h{margin:0 0 6px;color:var(--navy)}.nz-ver{font-size:11px;font-weight:600;opacity:.7;margin-left:6px}"
      + ".nz-req{font-size:11px;font-weight:700;background:#3A2A0E;color:#FFC861;border-radius:999px;padding:1px 8px;margin-left:6px}"
      + ".nz-grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}.nz-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 8px}"
      + ".nz-grid7{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:0 6px}.nz-grid7 input{padding-left:6px;padding-right:4px}"
      + "@media (max-width:599px){.nz-grid3{grid-template-columns:1fr 1fr}.nz-grid7{grid-template-columns:repeat(4,minmax(0,1fr))}}"
      + ".nz-ro{flex:1}.nz-orig{color:#FFC861}.nz-prompt{margin-top:10px;padding:10px;border-radius:10px;border:2px solid #FFB020}"
      + ".nz-checks ul{margin:6px 0 6px 18px;padding:0}.nz-checks li{margin:4px 0;font-weight:700}.nz-bad,.nz-checks .nz-bad{color:#FF7A7A;font-weight:700}.nz-warn,.nz-checks .nz-warn{color:#FFC861;font-weight:700}"
      + ".nz-cal-row{margin-top:8px}.nz-photo img{max-width:100%!important}.nz-take{display:inline-block;margin-top:8px}"
      + ".nz-modal{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:12px}"
      + ".nz-dialog{background:var(--surf2,#1c2233);color:var(--text,#fff);border-radius:14px;padding:14px;max-width:560px;width:100%}.nz-q{font-weight:700;margin:0 0 8px}"
      + ".nz-crop{position:relative}.nz-crop img{width:100%;display:block;border-radius:8px}.nz-guide{position:absolute;left:10%;right:10%;top:15%;bottom:15%;border:3px dashed #FFB020;border-radius:6px;box-shadow:0 0 0 999px rgba(0,0,0,.35)}"
      + ".nz-oct,.nz-hpd{margin-top:10px}.nz-oct summary,.nz-hpd summary{cursor:pointer;font-weight:700}";
    document.head.appendChild(st);
    try { g.render(); } catch (e) {}
  }
  if (document.readyState === "complete") setTimeout(installLate, 0); else g.addEventListener("load", installLate);

  g.ENVSS_NOISE = { version: NOISE_VERSION, loaded: true, rejects, startGaps, equipHtml, hpdFields, installTrainLayer,
    flags, parseScreen, calState, duplicates, extraItems, device };
})(window);

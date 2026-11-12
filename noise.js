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
     Spectrum Table prompt (REQ-012/015/033). Existing stored values are left intact.

   v49 (12 Nov 2026 AWST, draft — not live until John approves): new event type "Detailed Occupational Noise
     Assessment" (type "noise_assessment"), see the NZA section near the end of this file. It only touches events of that
     type; Hygiene / AFM events and every existing sample (train) are unchanged. Data lives on the event (ev.nza). */
(function (g) {
  "use strict";
  const NOISE_VERSION = "49.0";
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


  /* ======================= v49 Detailed Occupational Noise Assessment (NZA) =======================
     John (10–11 Nov 2026; build approved 12 Nov 2026 9:41 pm AWST). A fully separate event type, built in isolation:
     it does not mirror or change the Hygiene or AFM workflow, and Hygiene / AFM events behave exactly as before.
       - Event type "Detailed Occupational Noise Assessment" in the New project event dropdown (type "noise_assessment").
       - No pre-created samples. Before site the event asks only for the dose badges and the sound level meter (SLM)
         calibration certificate (photo).
       - On site, one measurement at a time as collected: start-of-day calibration (badges + SLMs), SLM area / task
         readings, dose badge results (personal details only here), HPD questions, end-of-day calibration, flags.
       - LAeq required. Dose badges: LAeq + LCpeak only (Minah). LCeq and octave / spectrum only on SLM readings.
       - A6: an AREA reading with LAeq >= 85 dB(A) is flagged and asks for the affected-area extent and distance.
       - Photo of the meter reading is the in-field source-of-truth check (values read from it, or typed; never both).
       - Meter downloads / charts stay at reporting. Discrepancies are flagged and referred to the team (field note).
     Data: everything lives on the event record (ev.nza), so it rides the existing event sync (envss_events payload).
     No new tables, no new IndexedDB stores, no change to samples (trains). Only events with type "noise_assessment"
     are touched by this code. */
  const NZA_TYPE = "noise_assessment";
  const NZA_LABEL = "Detailed Occupational Noise Assessment";
  const isNza = ev => !!ev && typeof ev === "object" && ev.type === NZA_TYPE;
  const perthDay = d => new Date(d || Date.now()).toLocaleDateString("en-CA", { timeZone: "Australia/Perth" });
  const perthTime = iso => { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleTimeString("en-AU", { timeZone: "Australia/Perth", hour: "2-digit", minute: "2-digit" }) + " AWST"; };
  const perthStamp = iso => { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("en-AU", { timeZone: "Australia/Perth", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) + " AWST"; };
  const nid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const NZA_VAL = { LAeq: "LAeq dB(A)", LCpeak: "LCpeak dB(C)", LCeq: "LCeq dB(C)" };
  const nzaKeys = r => r.kind === "slm" ? ["LAeq", "LCpeak", "LCeq"] : ["LAeq", "LCpeak"];   // Minah: dosimeters report LAeq + LCpeak only
  const nzaOcr = new Map();

  /* za(ev) is READ-ONLY (listing / opening never changes the record); za(ev, true) only where the user enters data. */
  function za(ev, write) {
    const base = () => ({ v: 1, badges: [], slms: [], cal: {}, readings: [], days: [], audit: [], seq: 0 });
    if (!write) { const z = ev && ev.nza; return Object.assign(base(), z && typeof z === "object" ? z : {}); }
    if (!ev.nza || typeof ev.nza !== "object") ev.nza = base();
    const z = ev.nza, b = base();
    Object.keys(b).forEach(k => { if (z[k] == null) z[k] = b[k]; });
    return z;
  }
  function zNote(ev, action, detail, ref) {
    const z = za(ev, true);
    z.audit.push({ at: new Date().toISOString(), who: C().who(), login: login(), device: device(), gps: gps ? Object.assign({}, gps) : null, action, detail: str(detail), ref: ref || "" });
  }
  const live = z => (z.readings || []).filter(r => r && !r.voided);
  function instOf(z, id) { return (z.slms || []).find(x => x.id === id) || (z.badges || []).find(x => x.id === id) || null; }
  function instName(z, id) { const i = instOf(z, id); if (!i) return "not set"; return ((z.slms || []).includes(i) ? "SLM " : "Badge ") + (i.serial || "(no serial)"); }
  function rLabel(r) { return "Reading " + r.no + " · " + (r.kind === "slm" ? "SLM " + (r.purpose === "task" ? "task" : r.purpose === "area" ? "area" : "area / task") : "Dose badge (personal)"); }
  function rVal(r, k) { const x = ((r.values || {})[k]) || {}; return x.v == null ? "" : String(x.v); }
  function nzaDays(ev) {
    const z = za(ev), s = new Set();
    if (ev.date) s.add(ev.date);
    (z.days || []).forEach(d => d && s.add(d));
    Object.keys(z.cal || {}).forEach(d => s.add(d));
    (z.readings || []).forEach(r => r.day && s.add(r.day));
    return Array.from(s).sort();
  }
  function curDay(ev) { const v = C().view(); if (v.nzaDay && v.nzaDay.ev === ev.id && v.nzaDay.day) return v.nzaDay.day; const days = nzaDays(ev); const t = perthDay(); return days.includes(t) || !days.length ? t : days[days.length - 1]; }
  function usedOn(z, day) { const ids = new Set(); live(z).filter(r => r.day === day && r.inst).forEach(r => ids.add(r.inst)); return Array.from(ids); }
  function calOf(z, day, which, id) { return (((z.cal || {})[day] || {})[which] || {})[id] || null; }
  function calDev(x) { return x && num(x.reading) != null && num(x.ref) != null ? +(num(x.reading) - num(x.ref)).toFixed(2) : null; }

  /* ----- checks: gaps block "Mark event complete"; flags are referred to the team (never block) ----- */
  function rGaps(ev, r) {
    const z = za(ev), g = [];
    if (r.voided) return g;
    if (!r.inst || !instOf(z, r.inst)) g.push(r.kind === "slm" ? "Sound level meter" : "Dose badge");
    if (r.kind === "slm") {
      if (!r.purpose) g.push("Area or task reading");
      if (!str(r.location).trim()) g.push("Location / area");
    } else {
      const p = r.person || {};
      if (!str(p.first).trim()) g.push("First name");
      if (!str(p.last).trim()) g.push("Last name");
      if (!str(p.occupation).trim()) g.push("Occupation");
      if (!r.startAt) g.push("Start time");
      if (!r.endAt) g.push("Stop time");
      const h = r.hpd || {};
      if (!h.asked) g.push("Hearing protection worn?");
      else if (h.asked === "yes" && !str(h.model).trim()) g.push("HPD brand / model");
    }
    if (!r.entry) g.push("Values from a photo or typed");
    if (num(rVal(r, "LAeq")) == null) g.push("LAeq dB(A)");
    return g;
  }
  function rDuration(r) {
    if (r.kind === "slm") { const d = str(r.duration).trim(); if (!d) return null; const m = /^(\d+):(\d{1,2})$/.exec(d); return m ? (+m[1] + +m[2] / 60) : num(d) != null ? num(d) / 60 : NaN; }
    if (!r.startAt || !r.endAt) return null;
    return (new Date(r.endAt) - new Date(r.startAt)) / 60000;
  }
  function rFlags(ev, r) {
    const z = za(ev), f = [];
    if (r.voided) return f;
    const la = num(rVal(r, "LAeq")), pk = num(rVal(r, "LCpeak")), ce = num(rVal(r, "LCeq"));
    if (r.kind === "badge" && r.startAt && r.endAt && new Date(r.startAt) >= new Date(r.endAt)) f.push({ k: "time", sev: "bad", text: "Start is not before stop. Check the times." });
    const d = rDuration(r);
    if (d != null && Number.isNaN(d)) f.push({ k: "dur", sev: "bad", text: "Duration not understood. Use mm:ss or seconds." });
    else if (d != null && (d <= 0 || d > 24 * 60)) f.push({ k: "dur", sev: "bad", text: "Duration looks wrong (" + (Math.round(d * 10) / 10) + " min)." });
    if (r.kind === "slm" && pk != null && ce != null && pk < ce) f.push({ k: "peak", sev: "bad", text: "LCpeak (" + pk + ") is below LCeq (" + ce + "). Re-check the reading." });
    if (r.kind === "slm" && ((pk != null && pk >= 140) || (la != null && la > 110)) && !r.spectrumPhoto) f.push({ k: "spec", sev: "warn", text: (pk != null && pk >= 140 ? "LCpeak at or above 140 dB(C)" : "LAeq above 110 dB(A)") + ". Take a Spectrum Table photo." });
    if (r.kind === "slm" && r.purpose === "area" && la != null && la >= 85) f.push({ k: "a85", sev: "warn", text: "Area LAeq " + la + " dB(A) is at or above 85 dB(A)" + (str(r.extent).trim() && str(r.extentDistance).trim() ? " (extent and distance recorded)." : ". Record the affected-area extent and distance.") });
    if (r.inst && r.day) {
      const s = calOf(z, r.day, "start", r.inst), e = calOf(z, r.day, "end", r.inst);
      const sd = calDev(s), ed = calDev(e);
      if (sd != null && Math.abs(sd) > DRIFT_LIMIT) f.push({ k: "devS", sev: "bad", text: "Start-of-day calibration of " + instName(z, r.inst) + " off by " + sd + " dB (limit ±" + DRIFT_LIMIT + ")." });
      if (ed != null && Math.abs(ed) > DRIFT_LIMIT) f.push({ k: "devE", sev: "bad", text: "End-of-day calibration of " + instName(z, r.inst) + " off by " + ed + " dB (limit ±" + DRIFT_LIMIT + ")." });
      if (s && e && num(s.reading) != null && num(e.reading) != null) { const dr = +(num(e.reading) - num(s.reading)).toFixed(2); if (Math.abs(dr) > DRIFT_LIMIT) f.push({ k: "drift", sev: "bad", text: instName(z, r.inst) + " drifted " + (dr > 0 ? "+" : "") + dr + " dB over " + r.day + " (limit ±" + DRIFT_LIMIT + ")." }); }
      const slm = (z.slms || []).find(x => x.id === r.inst);
      if (slm && slm.certDue && r.day > slm.certDue) f.push({ k: "cert", sev: "bad", text: "SLM " + (slm.serial || "") + " calibration certificate was due " + slm.certDue + " (before this reading)." });
    }
    nzaDupes(ev, r).forEach(x => f.push({ k: "dup", sev: "warn", text: "Possible duplicate of Reading " + x.r.no + " (" + x.why + ")." }));
    return f;
  }
  function nzaDupes(ev, r) {
    const out = [];
    live(za(ev)).forEach(x => {
      if (x === r || x.kind !== r.kind) return;
      const tri = nzaKeys(r).map(k => rVal(r, k)), triO = nzaKeys(r).map(k => rVal(x, k));
      const sameVals = tri.every(Boolean) && tri.join("|") === triO.join("|");
      const sameSlm = r.kind === "slm" && str(r.slmNo).trim() && str(r.slmNo).trim() === str(x.slmNo).trim() && r.inst === x.inst && r.day === x.day;
      const overlap = r.kind === "badge" && r.inst && r.inst === x.inst && r.startAt && x.startAt && new Date(r.startAt) < new Date(x.endAt || Date.now()) && new Date(x.startAt) < new Date(r.endAt || Date.now());
      if (sameSlm || sameVals || overlap) out.push({ r: x, why: sameSlm ? "same SLM reading number" : sameVals ? "same values" : "same dose badge at overlapping times" });
    });
    return out;
  }
  function evGaps(ev) {
    const z = za(ev), g = [];
    const rs = live(z);
    if (!rs.length) g.push("No measurements recorded yet.");
    rs.forEach(r => { const x = rGaps(ev, r); if (x.length) g.push(rLabel(r) + ": " + x.join(", ")); });
    const days = Array.from(new Set(rs.map(r => r.day).filter(Boolean))).sort();
    days.forEach(day => usedOn(z, day).forEach(id => {
      if (!calOf(z, day, "start", id)?.reading) g.push("Start-of-day calibration " + day + ": " + instName(z, id));
      if (!calOf(z, day, "end", id)?.reading) g.push("End-of-day calibration " + day + ": " + instName(z, id));
    }));
    const slmUsed = new Set(rs.filter(r => r.kind === "slm").map(r => r.inst));
    (z.slms || []).filter(s => slmUsed.has(s.id) && !s.certPhoto && !str(s.certNo).trim()).forEach(s => g.push("Calibration certificate for SLM " + (s.serial || "")));
    return g;
  }
  function evFlags(ev) { const out = []; live(za(ev)).forEach(r => rFlags(ev, r).forEach(f => out.push(Object.assign({ r }, f)))); return out; }
  function nzaStage(ev) {
    const z = za(ev), rs = live(z);
    if (ev.uploadReady) return "upload_ready";
    if (!rs.length) return Object.keys(z.cal || {}).length ? "ev_running" : ((z.badges || []).length || (z.slms || []).length ? "ev_prepped" : "planned");
    return evGaps(ev).length ? "ev_needs" : "ev_complete";
  }

  /* ----- screens ----- */
  const E = v => esc(v == null ? "" : v);
  const btn = (act, label, cls, extra) => `<button type="button" class="btn ${cls || "ghost"}" data-nza-act="${E(act)}" ${extra || ""}>${label}</button>`;
  function chips(act, cur, opts) { return `<div class="filters">${opts.map(([v, l]) => `<button type="button" class="chip ${cur === v ? "on" : ""}" data-nza-act="${E(act + ":" + v)}">${E(l)}</button>`).join("")}</div>`; }
  function rin(path, value, ph, extra) { return `<input data-nza-r="${E(path)}" id="nzaR-${E(path.replace(/\W/g, "_"))}" value="${E(value)}" placeholder="${E(ph || "")}" ${extra || ""}>`; }
  const toLocalInput = iso => { if (!iso) return ""; const d = new Date(iso); if (isNaN(d)) return ""; const p = n => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes()); };
  function nzaPhoto(kind, id, ref, label, takeLabel) {
    const ph = C().photos;
    return `<div class="nz-photo" data-nza-photo="${E(kind + ":" + id)}">${ref ? (ph && ph.imgTag ? ph.imgTag(ref, label) : "") + `<div class="row" style="gap:8px;margin-top:6px;flex-wrap:wrap">${btn("psave:" + kind + ":" + id, "Save to device")}${btn("pshare:" + kind + ":" + id, "Share")}<label class="btn ghost">Retake<input type="file" accept="image/*" capture="environment" data-nza-take="${E(kind + ":" + id)}" hidden></label></div>`
      : `<label class="btn mid nz-take">${E(takeLabel || label)}<input type="file" accept="image/*" ${kind === "cert" ? "" : 'capture="environment"'} data-nza-take="${E(kind + ":" + id)}" hidden></label>`}</div>`;
  }
  function headHtml(ev, sub) {
    const p = (g.project && g.project(ev.projectId)) || null;
    return `<button class="btn ghost back-ctl" data-nza-act="${sub ? "back" : "project"}">← ${sub ? E(ev.code) : "Project events"}</button>
      <div class="row" style="margin-top:10px"><div class="grow">
        <div class="muted" data-nza-act="edit" style="cursor:pointer">${p ? E(p.number + " · " + (p.name || "")) : ""} · tap to edit event</div>
        <h2 class="brand-type" style="margin:4px 0;color:var(--navy)">${E(ev.code)}</h2>
        <div class="muted nza-type">${NZA_LABEL}</div></div>
        <span data-nza-part="stage">${typeof g.badge === "function" ? g.badge(nzaStage(ev)) : ""}</span></div>`;
  }
  function presiteHtml(ev) {
    const z = za(ev);
    const badges = z.badges || [], slms = z.slms || [];
    const certOk = slms.length && slms.every(s => s.certPhoto || str(s.certNo).trim());
    return `<div class="card nz-card" id="nzaPresite"><h3 class="brand-type nz-h">Before site</h3>
      <p class="help">Add the dose badges and the sound level meter calibration certificate. Everything else is captured on site, one measurement at a time.</p>
      <ul class="nza-todo"><li class="${badges.length ? "ok" : ""}">${badges.length ? "✓" : "○"} Dose badges added (${badges.length})</li><li class="${certOk ? "ok" : ""}">${certOk ? "✓" : "○"} SLM calibration certificate added</li></ul>
      <h4 class="nza-h4">Dose badges</h4>
      ${badges.map(b => `<div class="nza-inst" data-nza-inst-row="${E(b.id)}"><div class="nz-grid2"><div><label>Badge serial</label><input data-nza-inst="badge:${E(b.id)}:serial" value="${E(b.serial)}" placeholder="Serial on the badge"></div>
        <div><label>Make / model</label><input data-nza-inst="badge:${E(b.id)}:model" value="${E(b.model)}" placeholder="e.g. 4448 / Work Noise Partner"></div></div>
        ${instUsed(z, b.id) ? "" : btn("rmInst:badge:" + b.id, "Remove badge")}</div>`).join("") || `<p class="help">No dose badges yet.</p>`}
      ${btn("addBadge", "Add dose badge", "mid")}
      <h4 class="nza-h4">Sound level meter + calibration certificate</h4>
      ${slms.map(s => `<div class="nza-inst" data-nza-inst-row="${E(s.id)}"><div class="nz-grid2"><div><label>SLM serial</label><input data-nza-inst="slm:${E(s.id)}:serial" value="${E(s.serial)}" placeholder="e.g. 2250 SN"></div>
        <div><label>Make / model</label><input data-nza-inst="slm:${E(s.id)}:model" value="${E(s.model)}" placeholder="e.g. B&K 2250"></div>
        <div><label>Microphone serial</label><input data-nza-inst="slm:${E(s.id)}:micSerial" value="${E(s.micSerial)}" placeholder="optional"></div>
        <div><label>Certificate number</label><input data-nza-inst="slm:${E(s.id)}:certNo" value="${E(s.certNo)}" placeholder="from the certificate"></div>
        <div><label>Calibrated on</label><input type="date" data-nza-inst="slm:${E(s.id)}:certDate" value="${E(s.certDate)}"></div>
        <div><label>Next calibration due</label><input type="date" data-nza-inst="slm:${E(s.id)}:certDue" value="${E(s.certDue)}"></div></div>
        <label>Calibration certificate</label>${nzaPhoto("cert", s.id, s.certPhoto, "calibration certificate", "Add calibration certificate (photo)")}
        ${instUsed(z, s.id) ? "" : btn("rmInst:slm:" + s.id, "Remove meter")}</div>`).join("") || `<p class="help">No sound level meter yet.</p>`}
      ${btn("addSlm", "Add sound level meter", "mid")}</div>`;
  }
  function instUsed(z, id) { return (z.readings || []).some(r => r.inst === id) || Object.values(z.cal || {}).some(c => ["start", "end"].some(w => c && c[w] && c[w][id])); }
  function calHtml(ev, day, which) {
    const z = za(ev), insts = (z.badges || []).map(b => ["badge", b]).concat((z.slms || []).map(s => ["slm", s]));
    const used = new Set(usedOn(z, day)), c = ((z.cal || {})[day]) || {};
    const done = insts.length && insts.filter(([, i]) => used.has(i.id) || !used.size).every(([, i]) => calOf(z, day, which, i.id)?.reading);
    return `<details class="nza-cal" id="nzaCal-${which}" ${done ? "" : "open"}><summary>${which === "start" ? "Start-of-day calibration" : "End-of-day calibration"} · ${E(day)} ${done ? "✓" : ""}</summary>
      <p class="help">Every dose badge and sound level meter, ${which === "start" ? "on arrival before measuring" : "after the last measurement"}. Time is set when you enter the reading.</p>
      ${which === "start" ? `<label>Field calibrator serial</label><input data-nza-day="${E(day)}:calibrator" value="${E(c.calibrator || "")}" placeholder="Acoustic calibrator serial">` : ""}
      ${insts.map(([k, i]) => { const x = calOf(z, day, which, i.id) || {}; const dv = calDev(x);
        return `<div class="nz-cal-row"><strong>${k === "slm" ? "SLM" : "Dose badge"} ${E(i.serial || "(no serial)")}</strong>${used.has(i.id) ? ' <span class="help">used today</span>' : ""}
        <div class="nz-grid3"><div><label>Calibrator level (dB)</label><input data-nza-cal="${E(day + ":" + which + ":" + i.id + ":ref")}" value="${E(x.ref || "")}" inputmode="decimal" placeholder="94.0 / 114.0"></div>
        <div><label>Meter reading (dB)</label><input data-nza-cal="${E(day + ":" + which + ":" + i.id + ":reading")}" value="${E(x.reading || "")}" inputmode="decimal" placeholder="e.g. 93.9"></div>
        <div><label>Time</label><input value="${E(perthTime(x.at))}" readonly placeholder="set when saved"></div></div>
        ${x.by ? `<p class="help">${E(x.by)}${dv != null ? " · off by " + dv + " dB" : ""}</p>` : ""}${dv != null && Math.abs(dv) > DRIFT_LIMIT ? `<p class="nz-bad">Off by ${dv} dB (limit ±${DRIFT_LIMIT} dB). Re-check, then add a note on the affected readings.</p>` : ""}</div>`; }).join("") || `<p class="help">Add the dose badges and sound level meter under Before site first.</p>`}
    </details>`;
  }
  function rowHtml(ev, r) {
    const gp = rGaps(ev, r), fl = rFlags(ev, r), la = rVal(r, "LAeq");
    const who = r.kind === "slm" ? (str(r.location) || "location not set") : ([r.person?.first, r.person?.last].filter(Boolean).join(" ") || "person not set");
    return `<div class="card nza-row ${r.voided ? "nza-void" : gp.length ? "tint-amber" : "tint-green"}" data-nza-act="open:${E(r.id)}" style="cursor:pointer">
      <div class="row"><div class="grow"><strong>${E(rLabel(r))}</strong><div class="muted">${E(instName(za(ev), r.inst))} · ${E(who)}${la ? " · LAeq " + E(la) : ""}</div>
      ${r.voided ? `<div class="help">Voided: ${E(r.voidReason || "")}</div>` : gp.length ? `<div class="help">To do: ${E(gp.join(", "))}</div>` : ""}</div>
      ${fl.length ? `<span class="badge s-flag">⚑ ${fl.length}</span>` : ""}</div></div>`;
  }
  function eventScreen(ev) {
    const z = za(ev), day = curDay(ev), days = nzaDays(ev); if (!days.includes(day)) days.push(day); days.sort();
    const rs = (z.readings || []).filter(r => r.day === day);
    const fl = evFlags(ev), gp = evGaps(ev);
    return `<div class="wrap nza" id="nzaEvent">${headHtml(ev, false)}
      <div class="row" style="margin:10px 0;gap:8px;flex-wrap:wrap">${btn("complete", ev.uploadReady ? "Event complete ✓" : "Mark event complete", "green")}
        <details class="nza-menu"><summary class="btn ghost">☰</summary><div class="menu">${btn("exportJson", "Export JSON")}${btn("exportCsv", "Export CSV")}${btn("print", "Print")}</div></details></div>
      ${presiteHtml(ev)}
      <div class="card nz-card" id="nzaSite"><h3 class="brand-type nz-h">On site</h3>
        <label>Field day</label><div class="filters">${days.map(d => `<button type="button" class="chip ${d === day ? "on" : ""}" data-nza-act="day:${E(d)}">${E(d)}${d === perthDay() ? " (today)" : ""}</button>`).join("")}</div>
        <div class="row" style="gap:8px;align-items:end"><div><label>Another day</label><input type="date" id="nzaOtherDay" data-nza-otherday="1"></div></div>
        ${calHtml(ev, day, "start")}
        <h4 class="nza-h4">Measurements · ${E(day)}</h4>
        <p class="help">One measurement at a time, as you collect it. Meter downloads and charts are done at reporting.</p>
        ${rs.map(r => rowHtml(ev, r)).join("") || `<p class="help">No measurements on this day yet.</p>`}
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px">${btn("add:slm", "Add SLM reading (area / task)", "orange", (z.slms || []).length ? "" : "disabled")}${btn("add:badge", "Add dose badge result (personal)", "orange", (z.badges || []).length ? "" : "disabled")}</div>
        ${(z.slms || []).length && (z.badges || []).length ? "" : `<p class="help">${(z.slms || []).length ? "" : "Add a sound level meter under Before site to record SLM readings. "}${(z.badges || []).length ? "" : "Add a dose badge under Before site to record badge results."}</p>`}
        ${calHtml(ev, day, "end")}</div>
      <div class="card nz-card" id="nzaFlags" data-nza-part="flags">${flagsHtml(ev, fl, gp)}</div>
      <div class="card nz-card"><label>Event notes</label><textarea data-nza-ev="notes" rows="2" placeholder="Anything the team should know">${E(ev.notes || "")}</textarea></div>
      ${auditHtml(z)}
      <p class="help">ENVSS Field v${E(C().appVersion || "")} · noise module v${NOISE_VERSION}</p></div>`;
  }
  function flagsHtml(ev, fl, gp) {
    return `<h3 class="brand-type nz-h">Flags for the team</h3>
      ${fl.length ? `<p class="help">These are referred to the team with the event. Add a field note on the measurement to explain.</p><ul class="nza-flags">${fl.map(f => `<li class="nz-${f.sev}" data-flag="${E(f.k)}"><a href="#" data-nza-act="open:${E(f.r.id)}">Reading ${E(f.r.no)}</a>: ${E(f.text)}${f.r.flagNote ? `<div class="help">Note: ${E(f.r.flagNote)}</div>` : ""}</li>`).join("")}</ul>` : `<p class="help nz-okline">No flags raised.</p>`}
      ${gp.length ? `<h4 class="nza-h4">Still to do before the event can be completed</h4><ul class="nza-gaps">${gp.map(x => `<li>${E(x)}</li>`).join("")}</ul>` : ""}`;
  }
  function auditHtml(z) {
    const a = (z.audit || []).slice().reverse();
    return `<details class="card nz-card nza-audit"><summary>Audit log (${a.length})</summary>${a.map(x => `<div class="help">${E(perthStamp(x.at))} · ${E(x.who || "")} · <b>${E(x.action)}</b>${x.detail ? " · " + E(x.detail) : ""}${x.device ? " · " + E(x.device) : ""}${x.gps ? " · GPS " + E(gpsText(x.gps)) : " · no GPS fix"}</div>`).join("") || '<p class="help">Nothing yet.</p>'}</details>`;
  }
  function valueRows(ev, r) {
    return nzaKeys(r).map(k => {
      const x = (r.values || {})[k] || {}, filled = str(x.v).trim() !== "", req = k === "LAeq" && !filled;
      const lab = `<label>${NZA_VAL[k]}${k === "LAeq" ? ` <span class="nz-req" data-nza-req="LAeq" ${req ? "" : "hidden"}>required</span>` : ""}</label>`;
      if (r.entry === "photo") return `<div class="nz-val">${lab}<div class="row" style="gap:8px;align-items:center"><input id="nzaV${k}" value="${E(x.v || "")}" readonly class="nz-ro" placeholder="from photo">${btn("fix:" + k, x.v ? "Correct" : "Enter")}</div>
        ${x.src === "corrected" ? `<p class="help nz-orig">Photo read <b>${E(x.ocr || "nothing")}</b> → corrected to <b>${E(x.v || "—")}</b> by ${E(x.by || "")}</p>` : x.src === "ocr" ? `<p class="help">Read from the photo.</p>` : ""}</div>`;
      return `<div class="nz-val">${lab}<input data-nza-r="values.${k}" id="nzaV${k}" value="${E(x.v || "")}" inputmode="decimal" placeholder="e.g. ${k === "LAeq" ? "84.9" : k === "LCpeak" ? "103.8" : "90.9"}"></div>`;
    }).join("");
  }
  function readingScreen(ev, r) {
    const z = za(ev), slm = r.kind === "slm", la = num(rVal(r, "LAeq")), pk = num(rVal(r, "LCpeak"));
    const insts = slm ? (z.slms || []) : (z.badges || []);
    const o = nzaOcr.get(r.id) || {};
    let h = `<div class="wrap nza" id="nzaReading" data-nza-rid="${E(r.id)}">${headHtml(ev, true)}
      <div class="card nz-card"><h3 class="brand-type nz-h">${E(rLabel(r))}</h3><p class="help">Field day ${E(r.day)} · added ${E(perthStamp(r.createdAt))} by ${E(r.by || "")}. The reading number is fixed.</p>
      ${r.voided ? `<p class="nz-bad">Voided: ${E(r.voidReason || "")}. Kept in the record and audit log.</p>` : ""}
      <label>${slm ? "Sound level meter" : "Dose badge"}</label><select data-nza-r="inst"><option value="">Pick…</option>${insts.map(i => `<option value="${E(i.id)}" ${r.inst === i.id ? "selected" : ""}>${E((i.serial || "(no serial)") + (i.model ? " · " + i.model : ""))}</option>`).join("")}</select>`;
    if (slm) h += `<label>Reading type${r.purpose ? "" : ' <span class="nz-req">needs answer</span>'}</label>${chips("purpose", r.purpose, [["area", "Area"], ["task", "Task / equipment"]])}
      <label>Location / area</label>${rin("location", r.location, "e.g. Workshop bay 2")}
      <div class="nz-grid2"><div><label>SLM reading number</label>${rin("slmNo", r.slmNo, "e.g. 12 (Meas012)", 'inputmode="numeric"')}</div><div><label>Duration (mm:ss)</label>${rin("duration", r.duration, "e.g. 1:00")}${r.durationSrc === "ocr" ? '<p class="help">Read from the photo.</p>' : ""}</div></div>
      <label>Noise description / source</label>${rin("source", r.source, "e.g. Two extraction fans running")}
      <label>Operating conditions / processes</label>${rin("conditions", r.conditions, "e.g. Fans only, no noisy work")}
      <label>Measurement position</label>${rin("position", r.position, "e.g. operator's ear, 1.5 m, left of machine")}`;
    else {
      const p = r.person || {}, hp = r.hpd || {};
      h += `<p class="help">Personal reading on a dose badge. Personal details are only asked here.</p>
      <div class="nz-grid2"><div><label>First name</label>${rin("person.first", p.first, "")}</div><div><label>Last name</label>${rin("person.last", p.last, "")}</div>
      <div><label>Occupation</label>${rin("person.occupation", p.occupation, "e.g. Boilermaker")}</div><div><label>Company</label>${rin("person.company", p.company, "optional")}</div>
      <div><label>Date of birth</label><input type="date" data-nza-r="person.dob" value="${E(p.dob || "")}"></div><div><label>Work group / SEG</label>${rin("person.seg", p.seg, "optional")}</div></div>
      <label>Task / area during the measurement</label>${rin("task", r.task, "e.g. Grinding in fabrication bay")}
      <div class="nz-grid2"><div><label>Start time</label><input type="datetime-local" data-nza-r="startAt" value="${E(toLocalInput(r.startAt))}">${btn("now:startAt", "Now")}</div>
      <div><label>Stop time</label><input type="datetime-local" data-nza-r="endAt" value="${E(toLocalInput(r.endAt))}">${btn("now:endAt", "Now")}</div></div>
      ${(() => { const d = rDuration(r); return d != null && Number.isFinite(d) && d > 0 ? `<p class="help">Run time ${Math.floor(d / 60)} h ${Math.round(d % 60)} min</p>` : ""; })()}
      <div class="nza-hpd"><label>Hearing protection worn?${hp.asked ? "" : ' <span class="nz-req">needs answer</span>'}</label>${chips("hpd", hp.asked, [["yes", "Yes"], ["no", "No"], ["unknown", "Unknown"]])}
      <div ${hp.asked === "yes" ? "" : "hidden"}><div class="nz-grid2"><div><label>Brand / model</label>${rin("hpd.model", hp.model, "Brand model or Unknown")}</div><div><label>Style</label>${rin("hpd.style", hp.style, "earmuff / earplug / both")}</div>
      <div><label>Class</label>${rin("hpd.classRating", hp.classRating, "e.g. Class 4 or Unknown")}</div><div><label>Attenuation (SLC80, dB)</label>${rin("hpd.attenuation", hp.attenuation, "e.g. 26", 'inputmode="decimal"')}</div></div>
      <label>Fit-tested (ear fit test)?</label>${chips("fit", hp.fitTested, [["yes", "Yes"], ["no", "No"], ["unknown", "Unknown"]])}
      <div ${hp.fitTested === "yes" ? "" : "hidden"}><label>PAR from the fit test (dB)</label>${rin("hpd.par", hp.par, "Personal attenuation rating", 'inputmode="decimal"')}</div></div></div>`;
    }
    h += `</div><div class="card nz-card"><h3 class="brand-type nz-h">Meter reading</h3>
      <p class="help">The photo of the meter screen is the in-field check. Values come from the photo, or are typed if the photo can't be read — one or the other, never both.</p>
      <label>How are the values entered?${r.entry ? "" : ' <span class="nz-req">needs answer</span>'}</label>${chips("entry", r.entry, [["photo", "From a photo of the screen"], ["manual", "Type them in"]])}`;
    if (r.entry === "photo") {
      h += nzaPhoto("screen", r.id, r.photo, "meter screen", "Take photo of the meter screen");
      if (o.state === "reading") h += `<p class="help" id="nzaOcrState">Reading the photo…</p>`;
      else if (o.state === "failed") h += `<p class="nz-warn" id="nzaOcrState">${o.error === "offline" ? "Reading the photo needs a connection. The photo is saved; tap Read photo again when online, or Enter each value from the photo." : "The photo could not be read (" + E(o.error) + "). Enter each value from the photo."}</p>`;
      else if (o.state === "none") h += `<p class="nz-warn" id="nzaOcrState">No values found on the photo. Retake it closer, or Enter each value from the photo.</p>`;
      if (r.photo && o.state !== "reading") h += btn("readAgain", "Read photo again");
    } else if (r.entry === "manual") h += `<p class="help">Typed values. A photo of the meter screen is still recommended as the source-of-truth check.</p>` + nzaPhoto("screen", r.id, r.photo, "meter screen", "Take photo of the meter screen (check)");
    if (r.entry) h += valueRows(ev, r);
    if (r.entry && slm) h += `<details class="nz-oct" ${OCTAVES.some(x => str((r.octave || {})[x]).trim()) ? "open" : ""}><summary>Octave bands (optional, dB)</summary><div class="nz-grid7">${OCTAVES.map(x => `<div><label>${x === "1000" ? "1k" : x === "2000" ? "2k" : x === "4000" ? "4k" : x === "8000" ? "8k" : x}</label>${rin("octave." + x, (r.octave || {})[x], "", 'inputmode="decimal"')}</div>`).join("")}</div></details>`;
    if (slm) h += `<div class="nz-prompt" id="nzaSpectrum" ${(pk != null && pk >= 140) || (la != null && la > 110) ? "" : "hidden"}><strong>Spectrum Table photo needed</strong><p class="help">LCpeak ≥ 140 dB(C) or LAeq > 110 dB(A). Photograph the meter's Spectrum Table.</p>${nzaPhoto("spectrum", r.id, r.spectrumPhoto, "Spectrum Table", "Take Spectrum Table photo")}</div>
      <div class="nz-prompt" id="nzaExtent" ${r.purpose === "area" && la != null && la >= 85 ? "" : "hidden"}><strong>Affected area (area LAeq ≥ 85 dB(A))</strong><div class="nz-grid2"><div><label>Extent of affected area</label>${rin("extent", r.extent, "e.g. entire bay / around the fan")}</div><div><label>Distance (m)</label>${rin("extentDistance", r.extentDistance, "e.g. 2", 'inputmode="decimal"')}</div></div></div>`;
    const fl = rFlags(ev, r), gp = rGaps(ev, r);
    h += `</div><div class="card nz-card" id="nzaChecks" data-nza-part="checks">${checksHtml(r, fl, gp)}</div>
      <div class="card nz-card"><label>Field note about these checks</label><textarea data-nza-r="flagNote" rows="2" placeholder="What happened (kept with the measurement, referred to the team)">${E(r.flagNote || "")}</textarea></div>
      <div class="row" style="gap:8px;margin:10px 0;flex-wrap:wrap">${btn("back", "Done · back to event", "green")}${r.voided ? btn("unvoid", "Restore this measurement") : btn("void", "Void this measurement", "danger")}</div>
      <p class="help">ENVSS Field v${E(C().appVersion || "")} · noise module v${NOISE_VERSION}</p></div>`;
    return h;
  }
  function checksHtml(r, fl, gp) {
    return `<h3 class="brand-type nz-h">Checks</h3>${gp.length ? `<p class="nz-warn">Still to fill: ${E(gp.join(", "))}</p>` : '<p class="help nz-okline">All required fields filled.</p>'}
      ${fl.length ? `<ul class="nza-flags">${fl.map(f => `<li class="nz-${f.sev}" data-flag="${E(f.k)}">${E(f.text)}</li>`).join("")}</ul><p class="help">Flags are referred to the team. Add a field note below.</p>` : '<p class="help">No flags raised.</p>'}`;
  }
  function editScreen(ev) {
    return `<div class="wrap nza" id="nzaEdit"><button class="btn ghost" data-nza-act="back">← ${E(ev.code)}</button>
      <h2 class="brand-type" style="color:var(--navy)">Edit event</h2><p class="muted">${NZA_LABEL}</p>
      <label>Event date</label><input id="nzaEdate" type="date" value="${E(ev.date || "")}">
      <label>Notes</label><textarea id="nzaEnotes">${E(ev.notes || "")}</textarea>
      <div class="footer-actions">${btn("saveEdit", "Save", "orange")}</div></div>`;
  }

  /* ----- state helpers ----- */
  function curEv() { const v = C().view(); if (v.page !== "event" && v.page !== "editEvent") return null; const ev = C().eventById(v.eventId); return isNza(ev) ? ev : null; }
  function curReading(ev) { const v = C().view(); if (!ev || !v.nzaOpen || v.nzaOpen.ev !== ev.id) return null; return (za(ev).readings || []).find(r => r.id === v.nzaOpen.id) || null; }
  let nzaPointer = false, nzaPending = false, nzaPendingFull = false;
  /* full repaint of the NZA screen that keeps the scroll position and the focused field (and never runs while a finger /
     mouse is down, so a tap can't land on a replaced node) */
  function rerender() {
    if (nzaPointer) { nzaPendingFull = true; return; }
    const a = document.activeElement; let key = null, caret = null;
    if (a && a.dataset) { for (const k of ["nzaR", "nzaInst", "nzaCal", "nzaDay", "nzaEv"]) if (a.dataset[k]) { key = [k, a.dataset[k]]; break; } try { caret = a.selectionStart; } catch (e) {} }
    const y = window.scrollY; C().render(); try { window.scrollTo(0, y); } catch (e) {}
    if (key) { const attr = "data-" + key[0].replace(/[A-Z]/g, m => "-" + m.toLowerCase()); const el = document.querySelector("[" + attr + '="' + (window.CSS && CSS.escape ? CSS.escape(key[1]) : key[1]) + '"]');
      if (el) { try { el.focus({ preventScroll: true }); if (caret != null && el.setSelectionRange) el.setSelectionRange(caret, caret); } catch (e) {} } }
  }
  const laterRerender = () => setTimeout(rerender, 0);
  function refreshParts() {
    if (nzaPointer) { nzaPending = true; return; }
    const ev = curEv(); if (!ev) return;
    const r = curReading(ev);
    const st = document.querySelector('[data-nza-part="stage"]'); if (st && typeof g.badge === "function") st.innerHTML = g.badge(nzaStage(ev));
    const fx = document.querySelector('[data-nza-part="flags"]'); if (fx) fx.innerHTML = flagsHtml(ev, evFlags(ev), evGaps(ev));
    if (r) {
      const ck = document.querySelector('[data-nza-part="checks"]'); if (ck) ck.innerHTML = checksHtml(r, rFlags(ev, r), rGaps(ev, r));
      const la = num(rVal(r, "LAeq")), pk = num(rVal(r, "LCpeak"));
      const sp = document.getElementById("nzaSpectrum"); if (sp) sp.hidden = !((pk != null && pk >= 140) || (la != null && la > 110));
      const ex = document.getElementById("nzaExtent"); if (ex) ex.hidden = !(r.purpose === "area" && la != null && la >= 85);
      const rq = document.querySelector('[data-nza-req="LAeq"]'); if (rq) rq.hidden = la != null || str(rVal(r, "LAeq")).trim() !== "";
    }
  }
  document.addEventListener("pointerdown", () => { nzaPointer = true; }, true);
  const nzaUp = () => { nzaPointer = false; if (nzaPendingFull) { nzaPendingFull = false; nzaPending = false; setTimeout(rerender, 0); } else if (nzaPending) { nzaPending = false; setTimeout(refreshParts, 0); } };
  document.addEventListener("pointerup", nzaUp, true); document.addEventListener("pointercancel", nzaUp, true);

  /* ----- input ----- */
  function nzaInput(e) {
    const el = e.target; if (!el || !el.dataset) return;
    const d = el.dataset; if (!(d.nzaR || d.nzaEv || d.nzaInst || d.nzaCal || d.nzaDay || d.nzaOtherday)) return;
    const ev = curEv(); if (!ev) return;
    const z = za(ev, true), val = el.value, change = e.type === "change";
    if (d.nzaOtherday) { if (change && val) { C().view().nzaDay = { ev: ev.id, day: val }; if (!z.days.includes(val)) z.days.push(val); zNote(ev, "Field day added", val); C().saveQuiet(); laterRerender(); } return; }
    if (d.nzaR) {
      const r = curReading(ev); if (!r) return;
      const path = d.nzaR;
      if (path.startsWith("values.")) { const k = path.slice(7); r.values = r.values || {}; const before = rVal(r, k); r.values[k] = { v: val.trim(), src: "manual" }; if (change && before !== val.trim()) zNote(ev, "Reading " + r.no + " " + k, (before || "—") + " → " + (val.trim() || "—"), r.id); }
      else if (path === "startAt" || path === "endAt") { if (!change) return; const before = r[path]; r[path] = val ? new Date(val).toISOString() : ""; zNote(ev, "Reading " + r.no + " " + (path === "startAt" ? "start" : "stop") + " time", perthStamp(before) + " → " + perthStamp(r[path]), r.id); }
      else if (path === "inst") { if (!change) return; r.inst = val; zNote(ev, "Reading " + r.no + " instrument", instName(z, val), r.id); C().saveQuiet(); laterRerender(); return; }
      else { setPath(r, path, val); if (path === "duration") r.durationSrc = "manual"; if (change && path !== "flagNote") zNote(ev, "Reading " + r.no + " " + path, val, r.id); if (change && path === "flagNote") zNote(ev, "Reading " + r.no + " field note", val, r.id); }
    } else if (d.nzaEv) { if (d.nzaEv === "notes") ev.notes = val; }
    else if (d.nzaInst) {
      const [kind, id, key] = d.nzaInst.split(":"); const list = kind === "slm" ? z.slms : z.badges; const i = list.find(x => x.id === id); if (!i) return;
      i[key] = val.trim(); if (change) zNote(ev, (kind === "slm" ? "SLM " : "Dose badge ") + key, val.trim(), id);
      if (change && kind === "slm") { C().saveQuiet(); laterRerender(); return; }   // certificate checklist
    } else if (d.nzaCal) {
      const [day, which, id, key] = d.nzaCal.split(":");
      z.cal[day] = z.cal[day] || {}; z.cal[day][which] = z.cal[day][which] || {}; const x = z.cal[day][which][id] = z.cal[day][which][id] || {};
      x[key] = val.trim();
      if (change) { x.at = x.at || new Date().toISOString(); x.by = C().who(); x.login = login(); x.device = device(); x.gps = gpsText(gps);
        zNote(ev, (which === "start" ? "Start" : "End") + "-of-day calibration " + day, instName(z, id) + " · " + (key === "ref" ? "calibrator level " : "meter reading ") + val.trim() + " dB", id);
        C().saveQuiet(); laterRerender(); return; }
    } else if (d.nzaDay) { const [day, key] = d.nzaDay.split(":"); z.cal[day] = z.cal[day] || {}; z.cal[day][key] = val.trim(); if (change) zNote(ev, "Field calibrator " + day, val.trim()); }
    if (change) C().saveQuiet();
    refreshParts();
  }

  /* ----- clicks ----- */
  async function nzaClick(e) {
    const b = e.target.closest && e.target.closest("[data-nza-act]"); if (!b || b.disabled) return;
    const ev = curEv(); if (!ev) return;
    e.preventDefault();
    const v = C().view(); const [act, a1, a2] = String(b.dataset.nzaAct).split(":");
    const r = curReading(ev);
    if (act === "project") { v.nzaOpen = null; (g.openProject || (() => {}))(ev.projectId); return; }
    if (act === "back") { v.nzaOpen = null; v.page = "event"; rerender(); window.scrollTo(0, 0); return; }
    if (act === "edit") { v.nzaOpen = null; v.page = "editEvent"; C().render(); return; }
    if (act === "print") { window.print(); return; }
    if (act === "exportJson") { download(ev.code + "_noise-assessment.json", JSON.stringify(ev, null, 2), "application/json"); return; }
    if (act === "exportCsv") { download(ev.code + "_noise-assessment.csv", toCsv(ev), "text/csv"); return; }
    if (act === "psave" || act === "pshare") { const holder = findPhotoOwner(ev, a1, a2); if (holder) photoOut(ev, holder, a1, a2, act === "pshare"); return; }
    const z = za(ev, true);
    if (act === "saveEdit") {
      const d = (document.getElementById("nzaEdate") || {}).value || ev.date, n = (document.getElementById("nzaEnotes") || {}).value;
      if (d !== ev.date) zNote(ev, "Event date", (ev.date || "—") + " → " + d); ev.date = d; if (n != null) ev.notes = n;
      C().saveQuiet(); v.page = "event"; C().render(); return;
    }
    if (act === "addBadge") { z.badges.push({ id: nid("nb"), eventId: ev.id, serial: "", model: "", addedAt: new Date().toISOString(), by: C().who() }); zNote(ev, "Dose badge added", ""); C().saveQuiet(); rerender(); setTimeout(() => { const ins = document.querySelectorAll('[data-nza-inst^="badge:"][data-nza-inst$=":serial"]'); if (ins.length) ins[ins.length - 1].focus(); }, 30); return; }
    if (act === "addSlm") { z.slms.push({ id: nid("ns"), eventId: ev.id, serial: "", model: "", micSerial: "", certNo: "", certDate: "", certDue: "", certPhoto: "", addedAt: new Date().toISOString(), by: C().who() }); zNote(ev, "Sound level meter added", ""); C().saveQuiet(); rerender(); return; }
    if (act === "rmInst") { const list = a1 === "slm" ? z.slms : z.badges; const i = list.findIndex(x => x.id === a2); if (i < 0 || instUsed(z, a2)) return;
      if (!confirm("Remove " + (a1 === "slm" ? "sound level meter " : "dose badge ") + (list[i].serial || "(no serial)") + " from this event?")) return;
      zNote(ev, (a1 === "slm" ? "Sound level meter" : "Dose badge") + " removed (not used)", list[i].serial || ""); list.splice(i, 1); C().saveQuiet(); rerender(); return; }
    if (act === "day") { v.nzaDay = { ev: ev.id, day: a1 }; rerender(); return; }
    if (act === "add") { addReading(ev, a1, false); return; }
    if (act === "open") { v.nzaOpen = { ev: ev.id, id: a1 }; C().render(); window.scrollTo(0, 0); return; }
    if (act === "complete") {
      const gp = evGaps(ev), fl = evFlags(ev);
      if (gp.length) { alert("This event can't be marked complete yet:\n- " + gp.slice(0, 15).join("\n- ") + (gp.length > 15 ? "\n…and " + (gp.length - 15) + " more" : "")); return; }
      if (ev.uploadReady) { alert("This event is already marked complete."); return; }
      if (!confirm("Mark this noise assessment complete?" + (fl.length ? "\n\n" + fl.length + " flag" + (fl.length === 1 ? "" : "s") + " will be referred to the team." : ""))) return;
      ev.uploadReady = true; ev.completedAt = new Date().toISOString(); zNote(ev, "Event marked complete", fl.length + " flag(s) referred to the team");
      C().saveQuiet(); rerender(); return;
    }
    if (!r) return;
    if (act === "purpose") { if (r.purpose !== a1) { zNote(ev, "Reading " + r.no + " type", (r.purpose || "—") + " → " + a1, r.id); r.purpose = a1; C().saveQuiet(); } rerender(); return; }
    if (act === "hpd") { r.hpd = r.hpd || {}; if (r.hpd.asked !== a1) { zNote(ev, "Reading " + r.no + " hearing protection worn", a1, r.id); r.hpd.asked = a1; C().saveQuiet(); } rerender(); return; }
    if (act === "fit") { r.hpd = r.hpd || {}; if (r.hpd.fitTested !== a1) { zNote(ev, "Reading " + r.no + " fit-tested", a1, r.id); r.hpd.fitTested = a1; C().saveQuiet(); } rerender(); return; }
    if (act === "now") { r[a1] = new Date().toISOString(); zNote(ev, "Reading " + r.no + " " + (a1 === "startAt" ? "start" : "stop") + " time", perthStamp(r[a1]), r.id); C().saveQuiet(); rerender(); return; }
    if (act === "entry") {
      if (r.entry === a1) return;
      const had = nzaKeys(r).filter(k => rVal(r, k));
      if (r.entry && had.length && !confirm("Switch to " + (a1 === "photo" ? "a photo" : "typing") + "? The values entered " + (r.entry === "photo" ? "from the photo" : "by hand") + " will be cleared (they stay in the audit log).")) return;
      zNote(ev, "Reading " + r.no + " values entered " + (a1 === "photo" ? "from a photo" : "by hand"), had.length ? "cleared " + had.map(k => k + " " + rVal(r, k)).join(", ") : "", r.id);
      r.entry = a1; r.values = {}; nzaOcr.delete(r.id); if (r.durationSrc === "ocr") { r.duration = ""; r.durationSrc = ""; }
      C().saveQuiet(); rerender(); return;
    }
    if (act === "fix") {
      const k = a1, x = (r.values || {})[k] || {};
      const nv0 = prompt((x.v ? "Correct " : "Enter ") + NZA_VAL[k] + " as shown on the photo" + (x.v ? " (photo read " + x.v + ")" : ""), x.v || ""); if (nv0 == null) return;
      const nv = nv0.trim(); if (nv && !NUM.test(nv)) { alert("Enter a number like 84.9"); return; }
      const orig = x.src === "corrected" ? x.ocr : (x.src === "ocr" ? x.v : "");
      r.values = r.values || {}; r.values[k] = { v: nv, src: "corrected", ocr: orig, by: C().who(), at: new Date().toISOString() };
      zNote(ev, "Reading " + r.no + (orig ? " corrected " : " entered ") + k + " from the photo", (orig || "(not read)") + " → " + nv + " (photo reading kept)", r.id);
      C().saveQuiet(); rerender(); return;
    }
    if (act === "readAgain") { const blob = await nzaBlob("screen:" + r.id); if (!blob) { alert("The photo is not on this device yet."); return; } nzaRunOcr(ev, r, new File([blob], "noise-screen.jpg", { type: "image/jpeg" })); return; }
    if (act === "void") { const why = prompt("Why is this measurement void? (it stays in the record and audit log)", ""); if (!why || !why.trim()) return; r.voided = true; r.voidReason = why.trim(); r.voidedAt = new Date().toISOString(); r.voidedBy = C().who(); zNote(ev, "Reading " + r.no + " voided", why.trim(), r.id); C().saveQuiet(); rerender(); return; }
    if (act === "unvoid") { r.voided = false; zNote(ev, "Reading " + r.no + " restored", "", r.id); C().saveQuiet(); rerender(); return; }
  }
  function findPhotoOwner(ev, kind, id) { const z = za(ev); return kind === "cert" ? (z.slms || []).find(s => s.id === id) : (z.readings || []).find(r => r.id === id); }
  async function nzaBlob(key) {
    for (let i = 0; i < 8; i++) {
      const im = document.querySelector(`[data-nza-photo="${key}"] img`);
      if (im && im.src && !im.src.startsWith("data:image/gif")) { try { return await (await fetch(im.src)).blob(); } catch (e) { return null; } }
      try { await (C().photos && C().photos.hydrate && C().photos.hydrate()); } catch (e) {}
      await new Promise(r => setTimeout(r, 200));
    }
    return null;
  }
  async function photoOut(ev, holder, kind, id, sharing) {
    const b = await nzaBlob(kind + ":" + id); if (!b) { alert("The photo is not on this device yet."); return; }
    const name = (ev.code || "event") + "_" + (kind === "cert" ? "SLM-" + str(holder.serial).replace(/\W+/g, "") + "_calibration-certificate" : "Reading" + holder.no + "_" + kind) + ".jpg";
    const f = new File([b], name, { type: "image/jpeg" });
    if (sharing && navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: name }); zNote(ev, "Photo shared", name, id); C().saveQuiet(); } catch (e) {} return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    zNote(ev, "Photo saved to device", name, id); C().saveQuiet();
  }
  async function nzaTake(e) {
    const el = e.target; if (!el || !el.dataset || !el.dataset.nzaTake || !el.files || !el.files[0]) return;
    const ev = curEv(); if (!ev) return;
    const [kind, id] = el.dataset.nzaTake.split(":"); const holder = findPhotoOwner(ev, kind, id); if (!holder) return;
    let file = el.files[0], cropped = false;
    if (kind !== "cert") { const c = await cropFlow(file); if (!c) return; file = c.file; cropped = c.cropped; }
    const ph = C().photos;
    const ref = ph && ph.attach ? await ph.attach(file, holder, kind === "cert" ? "nzaCert" : kind === "spectrum" ? "noiseSpectrum" : "noiseScreen") : "";
    if (kind === "cert") { holder.certPhoto = ref; zNote(ev, "Calibration certificate added", "SLM " + (holder.serial || ""), id); }
    else if (kind === "spectrum") { holder.spectrumPhoto = ref; zNote(ev, "Reading " + holder.no + " Spectrum Table photo added", cropped ? "cropped to frame" : "whole photo", id); }
    else { holder.photo = ref; holder.photoCropped = cropped; zNote(ev, "Reading " + holder.no + " meter screen photo added", cropped ? "cropped to frame" : "whole photo", id); }
    C().saveQuiet(); rerender();
    if (kind === "screen" && holder.entry === "photo") nzaRunOcr(ev, holder, file);
  }
  async function nzaRunOcr(ev, r, file) {
    nzaOcr.set(r.id, { state: "reading" }); rerender();
    try {
      const T = await loadTess(); const res = await T.recognize(file, "eng"); const got = parseScreen(res && res.data && res.data.text);
      r.values = r.values || {}; let hits = 0;
      nzaKeys(r).forEach(k => { if (got[k]) { r.values[k] = { v: got[k], src: "ocr", ocr: got[k] }; hits++; } });
      if (got.duration && r.kind === "slm" && !str(r.duration).trim()) { r.duration = got.duration; r.durationSrc = "ocr"; }
      nzaOcr.set(r.id, { state: hits ? "done" : "none" });
      zNote(ev, "Reading " + r.no + " values read from photo", hits ? nzaKeys(r).filter(k => got[k]).map(k => k + " " + got[k]).join(", ") : "nothing readable", r.id);
    } catch (e) { const err = /offline/.test(e.message) ? "offline" : e.message; nzaOcr.set(r.id, { state: "failed", error: err }); zNote(ev, "Reading " + r.no + " photo reading not possible", err, r.id); }
    C().saveQuiet(); if (curReading(curEv()) === r) rerender();
  }
  function download(name, text, type) {
    name = name.replace(/[^\w.-]+/g, "_");
    /* the core download() also queues a copy for the job's Drive folder (new files only), like Hygiene exports */
    if (typeof g.download === "function") { try { return g.download(new Blob([text], { type }), name); } catch (e) { console.warn("noise.js NZA export", e); } }
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name.replace(/[^\w.-]+/g, "_"); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  function toCsv(ev) {
    const z = za(ev), ph = C().photos;
    const path = ref => { if (!ref) return ""; const pid = String(ref).replace("envss-photo:", ""); try { return (ph && ph.pathOf && ph.pathOf(pid)) || ref; } catch (e) { return ref; } };
    const cols = ["event", "reading", "kind", "type", "day", "instrument", "slm_reading_no", "location", "source_or_task", "conditions", "position", "first", "last", "occupation", "company", "dob", "seg", "start_awst", "stop_awst", "duration_min", "LAeq", "LCpeak", "LCeq", "entry", "values_source", "hpd_worn", "hpd_model", "hpd_style", "hpd_class", "hpd_attenuation", "fit_tested", "par", "extent", "extent_distance_m", "octave_bands", "flags", "field_note", "voided", "void_reason", "photo"];
    const q = v => { const s = str(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = (z.readings || []).map(r => { const p = r.person || {}, h = r.hpd || {}, d = rDuration(r);
      return [ev.code, r.no, r.kind === "slm" ? "SLM" : "Dose badge", r.purpose || "", r.day, instName(z, r.inst), r.slmNo || "", r.location || "", r.kind === "slm" ? r.source || "" : r.task || "", r.conditions || "", r.position || "",
        p.first || "", p.last || "", p.occupation || "", p.company || "", p.dob || "", p.seg || "", perthStamp(r.startAt), perthStamp(r.endAt), d != null && Number.isFinite(d) ? Math.round(d * 10) / 10 : "",
        rVal(r, "LAeq"), rVal(r, "LCpeak"), r.kind === "slm" ? rVal(r, "LCeq") : "", r.entry || "", nzaKeys(r).map(k => ((r.values || {})[k] || {}).src || "").join("/"),
        h.asked || "", h.model || "", h.style || "", h.classRating || "", h.attenuation || "", h.fitTested || "", h.par || "", r.extent || "", r.extentDistance || "",
        OCTAVES.filter(o => str((r.octave || {})[o]).trim()).map(o => o + "=" + r.octave[o]).join(" "), rFlags(ev, r).map(f => f.text).join(" | "), r.flagNote || "", r.voided ? "yes" : "", r.voidReason || "", path(r.photo)].map(q).join(","); });
    return [cols.join(",")].concat(rows).join("\n");
  }

  function addChooser(ev) {
    const z = za(ev); if (document.getElementById("nzaChooser")) return;
    const w = document.createElement("div"); w.className = "nz-modal"; w.id = "nzaChooser";
    w.innerHTML = `<div class="nz-dialog"><p class="nz-q">Add a measurement · ${E(curDay(ev))}</p>
      <div class="row" style="gap:8px;flex-wrap:wrap"><button type="button" class="btn orange" data-nza-pick="slm" ${(z.slms || []).length ? "" : "disabled"}>SLM reading (area / task)</button>
      <button type="button" class="btn orange" data-nza-pick="badge" ${(z.badges || []).length ? "" : "disabled"}>Dose badge result (personal)</button></div>
      ${(z.slms || []).length && (z.badges || []).length ? "" : '<p class="help">Add the dose badges and sound level meter under Before site first.</p>'}
      <div class="row" style="justify-content:flex-end;margin-top:10px"><button type="button" class="btn ghost" data-nza-pick="">Cancel</button></div></div>`;
    document.body.appendChild(w);
    w.addEventListener("click", e => { const b = e.target.closest("[data-nza-pick]"); if (!b && e.target !== w) return; w.remove();
      if (b && b.dataset.nzaPick) { const v = C().view(); v.nzaOpen = null; v.page = "event"; addReading(ev, b.dataset.nzaPick, true); } });
  }
  function addReading(ev, kind, confirmed) {
    const z = za(ev, true), v = C().view(), day = curDay(ev), insts = kind === "slm" ? z.slms : z.badges;
    if (!insts.length) { alert(kind === "slm" ? "Add the sound level meter under Before site first." : "Add a dose badge under Before site first."); return; }
    if (!confirmed && !confirm("Add a new " + (kind === "slm" ? "SLM reading" : "dose badge result") + " for " + day + "?")) return;
    z.seq = Math.max(z.seq || 0, ...z.readings.map(x => +x.no || 0)) + 1;
    const nr = { id: nid("nr"), eventId: ev.id, no: z.seq, kind, day, createdAt: new Date().toISOString(), by: C().who(), inst: insts.length === 1 ? insts[0].id : "", entry: "", values: {}, octave: {}, photo: "", spectrumPhoto: "" };
    if (kind === "badge") { nr.person = {}; nr.hpd = {}; } else nr.purpose = "";
    if (!z.days.includes(day)) z.days.push(day);
    z.readings.push(nr); zNote(ev, "Measurement added", rLabel(nr) + " · " + day, nr.id);
    C().saveQuiet(); v.nzaOpen = { ev: ev.id, id: nr.id }; C().render(); window.scrollTo(0, 0);
  }

  /* ----- wiring into the core app (only for type "noise_assessment"; everything else falls through unchanged) ----- */
  function installNza() {
    if (g.__nza49) return; g.__nza49 = true;
    const wrap = (name, fn) => { if (typeof g[name] !== "function") { console.warn("noise.js NZA: " + name + " not found"); return; } const orig = g[name]; g[name] = fn(orig); };
    wrap("eventTypeLabel", o => function (e) { return isNza(e) ? NZA_LABEL : o.apply(this, arguments); });
    wrap("deriveEventStage", o => function (e) { return isNza(e) ? nzaStage(e) : o.apply(this, arguments); });
    wrap("newEventHtml", o => function () {
      let h = o.apply(this, arguments);
      h = h.replace(/(<option value="fibre"[^>]*>[^<]*<\/option>)/, `$1\n      <option value="${NZA_TYPE}">${NZA_LABEL}</option>`);
      h = h.replace('<div id="hygieneEventFields">', `<div id="nzaEventFields" style="display:none"><p class="help">A separate event type (not a Hygiene or AFM event). No samples are created. Before site you add the dose badges and the sound level meter calibration certificate; everything else is captured on site, one measurement at a time.</p></div>\n    <div id="hygieneEventFields">`);
      return h;
    });
    wrap("toggleEventTypeFields", o => function () {
      const r = o.apply(this, arguments);
      const on = (document.getElementById("ntype") || {}).value === NZA_TYPE;
      const n = document.getElementById("nzaEventFields"), h = document.getElementById("hygieneEventFields"), f = document.getElementById("fibreEventFields");
      if (n) n.style.display = on ? "" : "none";
      if (on) { if (h) h.style.display = "none"; if (f) f.style.display = "none"; }
      return r;
    });
    wrap("createEvent", o => function () {
      const sel = document.getElementById("ntype");
      if (!sel || sel.value !== NZA_TYPE) return o.apply(this, arguments);
      const c = C(), v = c.view(), db = c.db(), p = g.project && g.project(v.projectId);
      if (!p) { alert("Open a project first."); return; }
      const date = (document.getElementById("ndate") || {}).value || perthDay();
      const codes = new Set(db.events.map(e => e.code));
      let n = db.events.filter(e => e.projectId === p.id && !(typeof g.isFibreEvent === "function" && g.isFibreEvent(e))).length + 1;
      while (codes.has(p.number + "-" + String(n).padStart(3, "0"))) n++;
      const ev = { id: (g.uid ? g.uid("e") : nid("e")), projectId: p.id, type: NZA_TYPE, stage: "planned", date, code: p.number + "-" + String(n).padStart(3, "0"),
        multiDay: false, minesAct: false, notes: "", uploadReady: false, operators: [], podioUnplanned: true, podioLinked: false, nza: null };
      za(ev, true).createdAt = new Date().toISOString();
      zNote(ev, "Event created", NZA_LABEL + " · " + date);
      db.events.push(ev);
      c.save();
      g.openEvent(ev.id);
    });
    wrap("openEvent", o => function (id) { C().view().nzaOpen = null; return o.apply(this, arguments); });
    /* the floating "+" and the bottom-bar "+" call openPickType: on a noise assessment they add a measurement, never a sample */
    wrap("openPickType", o => function (eventId) { const ev = C().eventById(eventId); if (!isNza(ev)) return o.apply(this, arguments); addChooser(ev); });
    /* The generic event change-log (v40) flattens the whole event on every save; on a noise assessment that would copy
       every measurement into ev.audit on each keystroke-save. NZA keeps its own audit (ev.nza.audit, with login / GPS /
       device), so while a noise assessment is open the generic event diff is skipped. Nothing else in commit changes. */
    wrap("commit", o => function () {
      const v = C().view(), ev = (v.page === "event" || v.page === "editEvent") && C().eventById(v.eventId);
      if (!isNza(ev)) return o.apply(this, arguments);
      const keep = [v.eventId, v.trainId]; v.eventId = null; v.trainId = null;
      try { return o.apply(this, arguments); } finally { v.eventId = keep[0]; v.trainId = keep[1]; }
    });
    wrap("render", o => function () {
      const r = o.apply(this, arguments);
      try { const v = C().view(), ev = (v.page === "event" || v.page === "editEvent") && C().eventById(v.eventId);
        if (isNza(ev)) { const ea = document.getElementById("evAudit"); if (ea && !(ev.audit || []).length) ea.remove();
          const f = document.querySelector(".fab"); if (f && !f.hidden) f.innerHTML = "<b>+</b>Add measurement";
          const s = document.querySelector('.bnav [data-go="add"] span'); if (s) s.textContent = "Measure"; } } catch (e) {}
      return r;
    });
    wrap("eventHtml", o => function () { const v = C().view(); const ev = C().eventById(v.eventId); if (!isNza(ev)) return o.apply(this, arguments); refreshGps(); const r = curReading(ev); return r ? readingScreen(ev, r) : eventScreen(ev); });
    wrap("editEventHtml", o => function () { const ev = C().eventById(C().view().eventId); return isNza(ev) ? editScreen(ev) : o.apply(this, arguments); });
    wrap("projectHtml", o => function () {
      let h = o.apply(this, arguments);
      try { const v = C().view(); C().db().events.filter(e => e.projectId === v.projectId && isNza(e)).forEach(e => {
        const n = live(za(e)).length;
        h = h.split(NZA_LABEL + " · " + (e.date || "") + " · 0 samples").join(NZA_LABEL + " · " + (e.date || "") + " · " + n + " measurement" + (n === 1 ? "" : "s")); }); } catch (e) {}
      return h;
    });
    ["toggleEventTypeFields", "createEvent", "openEvent", "openPickType", "render", "commit"].forEach(k => { try { window[k] = g[k]; } catch (e) {} });
    document.addEventListener("click", nzaClick);
    document.addEventListener("input", nzaInput, true);
    document.addEventListener("change", e => { if (e.target && e.target.dataset && e.target.dataset.nzaTake) nzaTake(e); else nzaInput(e); }, true);
    const st = document.createElement("style");
    st.textContent = ".nza-h4{margin:12px 0 4px;color:var(--navy)}.nza-todo{list-style:none;padding:0;margin:6px 0}.nza-todo li{margin:3px 0;font-weight:700;color:#FFC861}.nza-todo li.ok{color:#7BD88F}"
      + ".nza-inst{border:1px solid #3A4466;border-radius:10px;padding:8px 10px;margin:8px 0}.nza-cal{margin-top:10px}.nza-cal summary{cursor:pointer;font-weight:700;padding:6px 0}"
      + ".nza-row{margin:8px 0}.nza-void{opacity:.55}.nza-flags{margin:6px 0 6px 18px;padding:0}.nza-flags li{margin:4px 0;font-weight:700}.nza-flags li.nz-bad{color:#FF7A7A}.nza-flags li.nz-warn{color:#FFC861}"
      + ".nza-gaps{margin:6px 0 6px 18px;padding:0}.nza-menu{position:relative}.nza-menu summary{list-style:none}.nza-menu summary::-webkit-details-marker{display:none}.nza-menu .menu{position:absolute;right:0;z-index:20;display:flex;flex-direction:column;gap:6px;padding:8px;background:var(--surf2,#1c2233);border-radius:10px;min-width:160px}"
      + ".nza-audit summary{cursor:pointer;font-weight:700}.nza-inst .nz-photo img{max-height:180px;width:auto!important;max-width:100%!important;object-fit:contain}.nza [hidden]{display:none!important}.nza .nz-grid2 .btn{margin-top:6px}";
    document.head.appendChild(st);
    try { g.render(); } catch (e) {}
  }
  if (document.readyState === "complete") setTimeout(installNza, 0); else g.addEventListener("load", installNza);

  g.ENVSS_NOISE = { version: NOISE_VERSION, loaded: true, rejects, startGaps, equipHtml, hpdFields, installTrainLayer,
    flags, parseScreen, calState, duplicates, extraItems, device,
    nza: { type: NZA_TYPE, label: NZA_LABEL, isNza, za, rGaps, rFlags, evGaps, evFlags, stage: nzaStage, toCsv } };
})(window);

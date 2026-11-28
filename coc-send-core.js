/* ENVSS Field: CoC send, pure core (v48.19, stage 1 of the lab pipeline).
   No DOM, no app globals, no network. Works in the browser (window.ENVSS_COC) and in Node (module.exports) so it can be unit tested.
   What lives here: config, Perth date helpers, the model hash, pre-send checks (block / warn, tech-fixable / app-side), the privacy lint,
   the one CoC page layout (drawn to the PDF and to the on-screen image from the same drawing list), the lab email, the error-report email, CSV. */
(function (root) {
  "use strict";
  const VERSION = "48.19-coc1";

  /* ---------- config (public, non-secret). Override any key with window.ENVSS_CONFIG.cocSend ---------- */
  const DEFAULTS = {
    fromAddress: "lab@envss.com.au",          /* Gmail "Send as" alias on the worker account */
    labTo: "ohlwa@mpl.com.au",                /* Envirolab / MPL Perth OH */
    labCc: [],                                /* nobody is copied: the tech's own address must never reach the lab */
    resultsTo: "lab@envss.com.au",            /* results and reports */
    invoiceTo: "accounts@envss.com.au",
    alertTo: "john@envss.com.au",             /* CoC error reports */
    replyTo: "lab@envss.com.au",
    officePhone: "08 9355 4010",              /* the ONLY ENVSS contact number on a CoC */
    officeAddress: "10 Bermondsey Street, West Leederville WA 6007",
    defaultCollectionLocation: "10 Bermondsey Street, West Leederville WA 6007",   /* ENVSS office; the tech may edit it (John, t768u) */
    companyName: "Environmental Site Services",
    contactLabel: "ENVSS office",
    allowedPhones: ["1300424344"],            /* Envirolab's own national number is printed on Form 302 */
    attachCsv: false,                         /* the generated CSV is saved to Drive only unless this is true */
    commentMin: 20,                           /* "Something looks wrong" comment, minimum characters */
    maxRows: 58,
    volTolL: 0.05,
    resendThrottleMin: 10,
    tz: "Australia/Perth"
  };
  function cfg() { const o = (root.ENVSS_CONFIG && root.ENVSS_CONFIG.cocSend) || {}; return Object.assign({}, DEFAULTS, o); }

  /* ---------- small helpers ---------- */
  const pad2 = n => String(n).padStart(2, "0");
  const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
  const round1 = n => Math.round(n * 10) / 10;
  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function perthParts(d, tz) {
    const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz || DEFAULTS.tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const o = {}; f.formatToParts(d).forEach(p => { o[p.type] = p.value; });
    return { y: +o.year, m: +o.month, d: +o.day, hh: +o.hour, mm: +o.minute, ss: +o.second };
  }
  function perthDay(d) { const p = perthParts(d || new Date()); return p.y + "-" + pad2(p.m) + "-" + pad2(p.d); }
  function perthStamp(d) { const p = perthParts(d || new Date()); return pad2(p.d) + "/" + pad2(p.m) + "/" + p.y + " " + pad2(p.hh) + ":" + pad2(p.mm) + " AWST"; }
  function dmy(iso) { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + "/" + m[2] + "/" + m[1] : String(iso || ""); }
  function weekdayOf(iso) { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return ""; return WD[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()]; }
  function dayLabel(iso) { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return ""; return weekdayOf(iso) + " " + (+m[3]) + " " + MO[+m[2] - 1] + " " + m[1]; }
  function hm12(t) { const m = String(t || "").match(/^(\d{1,2}):(\d{2})/); if (!m) return ""; let h = +m[1]; const ap = h >= 12 ? "pm" : "am"; h = h % 12 || 12; return h + ":" + m[2] + " " + ap; }
  function timeLabel(c) {
    if (!c || !c.from) return "";
    return c.to ? hm12(c.from) + " to " + hm12(c.to) : "from " + hm12(c.from) + " (no end time given)";
  }
  const digitsOf = s => String(s || "").replace(/\D/g, "");
  const phoneDigits = s => { let d = String(s || "").replace(/[^\d+]/g, ""); d = d.replace(/^\+?61/, "0"); return d.replace(/\D/g, ""); };

  /* ---------- timing / volume, recomputed independently from the raw sample fields ---------- */
  function recompute(s) {
    const a = Date.parse(s.startAt), b = Date.parse(s.endAt);
    const mins = (Number.isFinite(a) && Number.isFinite(b)) ? (b - a) / 60000 : null;
    const f1 = num(s.startFlow), f2 = num(s.endFlow);
    const flow = (f1 == null && f2 == null) ? null : f1 == null ? f2 : f2 == null ? f1 : (f1 + f2) / 2;
    const vol = (mins != null && flow != null) ? mins * flow : null;
    return { mins, flow, vol, volR: vol == null ? null : round1(vol), oneFlow: (f1 == null) !== (f2 == null) };
  }

  /* ---------- collection (when / where the lab picks the samples up) ---------- */
  function validateCollection(c, now, conf) {
    const errs = [], warns = [], k = conf || cfg(), today = perthDay(now || new Date());
    c = c || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date || "")) errs.push({ id: "collection_date", text: "Choose the collection day." });
    else if (c.date < today) errs.push({ id: "collection_date_past", text: "The collection day is in the past (" + dmy(c.date) + "). Choose today or a later day." });
    if (!/^\d{2}:\d{2}$/.test(c.from || "")) errs.push({ id: "collection_time", text: "Enter the collection time (from)." });
    else if (c.to && !/^\d{2}:\d{2}$/.test(c.to)) errs.push({ id: "collection_time_to", text: "The time window end is not a valid time." });
    else if (c.to && c.to <= c.from) errs.push({ id: "collection_window", text: "The time window must end after it starts." });
    if (!String(c.location || "").trim()) errs.push({ id: "collection_location", text: "Enter where the samples are to be collected." });
    else if (String(c.location).trim().length < 6) errs.push({ id: "collection_location_short", text: "The collection location is too short to find. Enter the full address." });
    if (!errs.length) {
      const wd = weekdayOf(c.date);
      if (wd === "Sat" || wd === "Sun") warns.push({ id: "collection_weekend", text: "Collection is on a " + (wd === "Sat" ? "Saturday" : "Sunday") + ". Check the lab can collect then." });
      if (c.from < "07:00" || (c.to || c.from) > "17:30") warns.push({ id: "collection_hours", text: "The collection time is outside 7:00 am to 5:30 pm. Check the lab can collect then." });
      if (c.date === today && c.from < pad2(perthParts(now || new Date()).hh) + ":" + pad2(perthParts(now || new Date()).mm)) warns.push({ id: "collection_earlier_today", text: "The collection time has already passed today." });
    }
    return { errs, warns, ok: !errs.length };
  }

  /* ---------- content hash (duplicate guard) ---------- */
  function canonical(model) {
    return JSON.stringify({
      job: model.job, event: model.eventCode, tat: model.turnaround,
      collection: { d: model.collection.date, f: model.collection.from, t: model.collection.to || "", l: String(model.collection.location || "").trim() },
      samples: model.samples.map(s => [s.no, s.id, s.dateSampled, s.type, s.codes, s.run, s.vol, s.comment])
    });
  }
  function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return ("00000000" + (h >>> 0).toString(16)).slice(-8); }
  async function contentHash(model) {
    const s = canonical(model);
    try {
      if (root.crypto && root.crypto.subtle) {
        const buf = await root.crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
      }
    } catch (e) {}
    return "f" + fnv(s) + fnv(s.split("").reverse().join("")) + fnv("a" + s) + fnv(s + "z");
  }

  /* ---------- privacy lint ---------- */
  const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  const PHONE_RE = /\+?[\d(][\d ()\-]{7,}\d/g;
  function privacyLint(texts, o) {
    o = o || {}; const k = o.cfg || cfg(), out = [];
    const okMail = new Set((o.allowedEmails || [k.resultsTo, k.invoiceTo]).map(s => String(s).toLowerCase()));
    const okPhone = new Set([phoneDigits(k.officePhone)].concat((k.allowedPhones || []).map(phoneDigits)));
    const forb = (o.forbidden || []).map(f => ({ kind: f.kind, v: String(f.v || "").trim().toLowerCase() })).filter(f => f.v.length >= 3);
    (texts || []).forEach((t, i) => {
      const s = String(t == null ? "" : t), low = s.toLowerCase(), where = o.where ? o.where(i) : ("#" + i);
      (s.match(EMAIL_RE) || []).forEach(m => { if (!okMail.has(m.toLowerCase())) out.push({ kind: "email address", where }); });
      (s.match(PHONE_RE) || []).forEach(m => {
        const d = phoneDigits(m);
        if (/^(0[2-8]\d{8}|13\d{4}|1[38]00\d{6})$/.test(d) && !okPhone.has(d)) out.push({ kind: "phone number", where });
      });
      forb.forEach(f => { if (low.indexOf(f.v) >= 0) out.push({ kind: f.kind, where }); });
    });
    return out;
  }

  /* ---------- pre-send checks ----------
     level: "block" stops the Send; "warn" is shown and logged. fix: "tech" = sample data or collection details the tech can correct in the app;
     "app" = the generated CoC or the app set-up is wrong, so the tech cannot fix it: Send stays blocked and the tech can send an error report. */
  function runChecks(inp) {
    const k = inp.cfg || cfg(), now = inp.now || new Date(), out = [];
    const add = (level, fix, id, text, o) => out.push(Object.assign({ level, fix, id, text }, o || {}));
    const raw = inp.raw || [], model = inp.model, xl = inp.xlsx, pdf = inp.pdf;

    if (inp.genError) add("block", "app", "gen_failed", "The CoC could not be generated: " + inp.genError, { value: inp.genError });
    if (inp.libs && !inp.libs.excel) add("block", "app", "lib_excel", "The spreadsheet library is not loaded on this device. Go online once so it can be saved, then reopen this screen.");
    if (inp.libs && !inp.libs.pdf) add("block", "app", "lib_pdf", "The PDF library is not loaded on this device. Go online once so it can be saved, then reopen this screen.");
    if (!/^\d{7}$/.test(String(inp.job || ""))) add("block", "app", "job_number", "The job number on this project is not 7 digits (" + (inp.job || "blank") + "). The lab reference and the Drive folder depend on it.", { value: inp.job || "" });
    if (!k.labTo || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(k.labTo) || !k.fromAddress) add("block", "app", "recipient_config", "The lab recipient or the sender address is not set in the app configuration.");

    if (!raw.length) add("block", "tech", "no_samples", "This event has no lab samples to send.");
    if (raw.length > k.maxRows) add("block", "app", "too_many_rows", "Form 302 holds " + k.maxRows + " samples and this event has " + raw.length + ". Split the event first.", { value: raw.length });
    (inp.unfinished || []).forEach(u => add("block", "tech", "unfinished", u.label + " is not finished: " + u.why + ".", { sample: u.label, sampleId: u.id }));

    /* per-sample data */
    const idSeen = {}, noSeen = {};
    raw.forEach(s => {
      const L = s.label, r = recompute(s), has = (a, b) => ({ sample: L, sampleId: s.key, value: a, expected: b });
      const id = String(s.id || "").trim();
      if (!id) add("block", "tech", "id_missing", L + " has no cassette / sample ID.", has(""));
      else { (idSeen[id.toLowerCase()] = idSeen[id.toLowerCase()] || []).push(L); }
      (noSeen[s.no] = noSeen[s.no] || []).push(L);
      if (!s.dateSampled) add("block", "tech", "date_missing", L + " has no date sampled.", has(""));
      if (!s.codes.length) add("block", "tech", "no_analysis", L + " has no analysis requested.", has(""));
      if (s.rejected && !String(s.rejectCode || "").trim() && !String(s.rejectReason || "").trim()) add("block", "tech", "reject_reason", L + " is rejected but has no reason recorded.", has(""));
      if (s.blank) {
        if (num(s.startFlow) != null || s.startAt || s.endAt) add("warn", "tech", "blank_has_data", L + " is a field blank but has flow or times entered. The CoC will still show N/A for run time and volume.", has("data entered"));
        return;
      }
      if (s.rejected) {
        if (r.vol == null) add("warn", "tech", "rejected_no_volume", L + " is rejected and has no volume. The lab is told it is rejected.", has(""));
      } else {
        if (!s.startAt || !s.endAt) add("block", "tech", "time_missing", L + " is missing its " + (!s.startAt && !s.endAt ? "start and stop times" : !s.startAt ? "start time" : "stop time") + ".", has(""));
        else if (!(r.mins > 0)) add("block", "tech", "time_order", L + " stops before (or when) it starts.", has(r.mins, "> 0 min"));
        if (num(s.startFlow) == null && num(s.endFlow) == null) add("block", "tech", "flow_missing", L + " has no flow recorded, so the volume cannot be worked out.", has(""));
        else if (r.oneFlow) add("warn", "tech", "one_flow", L + " has only one flow reading, so the volume uses that reading alone.", has(r.flow));
        if (r.vol != null && r.mins > 0 && !(r.vol > 0)) add("block", "tech", "vol_zero", L + " works out to a volume of " + r.volR + " L.", has(r.volR, "> 0 L"));
        if (r.mins != null && r.mins > 16 * 60) add("warn", "tech", "run_long", L + " ran " + Math.round(r.mins / 6) / 10 + " h. Check the stop time.", has(r.mins));
        if (r.mins != null && r.mins > 0 && r.mins < 30) add("warn", "tech", "run_short", L + " ran only " + Math.round(r.mins) + " min. Check the times.", has(r.mins));
        if (s.flowOk === false) add("warn", "tech", "flow_tolerance", L + " finished outside its flow tolerance. Confirm whether it should be rejected.", has(""));
      }
      if (s.dateSampled && inp.eventDateDmy && s.dateSampled !== inp.eventDateDmy && Math.abs(inp.dayDiff ? inp.dayDiff(s.dateSampled) : 0) > 1) add("warn", "tech", "sample_date_off", L + " is dated " + s.dateSampled + ", which is more than a day from the event date (" + inp.eventDateDmy + ").", has(s.dateSampled, inp.eventDateDmy));
      if (!s.location && !s.rejected) add("warn", "tech", "location_missing", L + " has no location recorded.", has(""));
    });
    Object.keys(idSeen).forEach(i => { if (idSeen[i].length > 1) add("block", "tech", "id_dup", "Duplicate sample ID \"" + i.toUpperCase() + "\" on " + idSeen[i].join(" and ") + ".", { value: i }); });
    Object.keys(noSeen).forEach(i => { if (noSeen[i].length > 1) add("block", "tech", "no_dup", "Sample number " + i + " is used by " + noSeen[i].join(" and ") + ".", { value: i }); });
    if (raw.length && !raw.some(s => s.blank)) add("warn", "tech", "no_blank", "This event has no field blank. Most jobs send at least one.");
    const nos = raw.map(s => s.no).filter(n => n > 0).sort((a, b) => a - b);
    for (let i = 1; i < nos.length; i++) if (nos[i] - nos[i - 1] > 1 && nos[i] !== nos[i - 1]) { add("warn", "tech", "number_gap", "Sample numbers jump from " + nos[i - 1] + " to " + nos[i] + ". A sample may be missing or not used.", { value: nos[i - 1] + "→" + nos[i] }); break; }
    (inp.notUsed || []).forEach(l => add("warn", "tech", "not_used_left_off", l + " is marked not used / void and is left off the CoC."));

    /* collection */
    const cv = validateCollection(inp.collection, now, k);
    cv.errs.forEach(e => add("block", "tech", e.id, e.text));
    cv.warns.forEach(e => add("warn", "tech", e.id, e.text));

    /* generated output vs the raw data (app side) */
    if (xl && model) {
      const expect = inp.expectedCount;
      if (xl.rows.length !== expect) add("block", "app", "count_xlsx", "The generated spreadsheet has " + xl.rows.length + " sample rows; the event has " + expect + ".", { value: xl.rows.length, expected: expect });
      if (model.samples.length !== expect) add("block", "app", "count_pdf", "The CoC page has " + model.samples.length + " sample rows; the event has " + expect + ".", { value: model.samples.length, expected: expect });
      raw.forEach((s, i) => {
        const x = xl.rows[i], m = model.samples[i], r = recompute(s), L = s.label;
        if (!x || !m) return;
        const ev = (a, b) => ({ sample: L, sampleId: s.key, value: a, expected: b });
        if (String(x.id).trim() !== String(s.id || "").trim() || String(m.id).trim() !== String(s.id || "").trim()) add("block", "app", "id_mismatch", L + ": the sample ID on the generated CoC (" + x.id + ") is not the one in the app (" + s.id + ").", ev(x.id, s.id));
        if (s.blank) {
          if (String(x.run) !== "N/A" || String(x.vol) !== "N/A" || m.run !== "N/A" || m.vol !== "N/A") add("block", "app", "blank_not_na", L + " is a field blank but its run time or volume is not N/A on the CoC.", ev(x.run + " / " + x.vol, "N/A / N/A"));
        } else {
          if (r.volR != null && r.vol > 0) {
            const gv = num(x.vol), pv = num(m.vol);
            if (gv == null || Math.abs(gv - r.volR) > k.volTolL + 1e-9) add("block", "app", "vol_mismatch", L + ": volume on the spreadsheet is " + (x.vol == null || x.vol === "" ? "blank" : x.vol) + " L; average flow x run time is " + r.volR + " L.", ev(x.vol, r.volR));
            if (pv == null || Math.abs(pv - r.volR) > k.volTolL + 1e-9) add("block", "app", "vol_mismatch_pdf", L + ": volume on the CoC page is " + (m.vol == null ? "blank" : m.vol) + " L; average flow x run time is " + r.volR + " L.", ev(m.vol, r.volR));
            if (gv != null && pv != null && Math.abs(gv - pv) > 1e-9) add("block", "app", "xlsx_pdf_vol", L + ": the spreadsheet and the CoC page show different volumes (" + gv + " and " + pv + ").", ev(gv, pv));
          }
          if (r.mins != null && r.mins > 0) {
            const gr = num(x.run);
            if (gr == null || Math.abs(gr - Math.round(r.mins)) > 0.5 + 1e-9) add("block", "app", "run_mismatch", L + ": run time on the spreadsheet is " + x.run + " min; start to stop is " + Math.round(r.mins) + " min.", ev(x.run, Math.round(r.mins)));
          }
        }
        if (s.rejected && !/reject|void|fault/i.test(String(x.comment || "")) ) add("block", "app", "reject_note", L + " is rejected but the CoC comment does not say so.", ev(x.comment, "rejected note"));
        const want = s.codes.slice().sort().join(","), gotN = (x.analytes || []).length;
        if (gotN !== s.codes.length) add("block", "app", "analyte_mismatch", L + ": the CoC ticks " + gotN + " analyses; the sample has " + s.codes.length + ".", ev(gotN, s.codes.length));
        if (String(x.type) !== String(m.type) || String(x.date) !== String(m.dateSampled)) add("block", "app", "xlsx_pdf_row", L + ": the spreadsheet and the CoC page disagree on date or type.", ev(x.type + " " + x.date, m.type + " " + m.dateSampled));
      });
      (xl.analyteHeaders || []).forEach(h => { if (/^[A-Z0-9]{2,4}$/.test(h)) add("block", "app", "analyte_name", "The analysis \"" + h + "\" has no readable name in the app catalogue.", { value: h }); });
      if (!xl.esdatTick) add("block", "app", "esdat_missing", "ESDAT is not ticked as the results format on the spreadsheet.");
      if (String(xl.resultsTo || "").toLowerCase().trim() !== k.resultsTo.toLowerCase()) add("block", "app", "results_email", "Results email on the spreadsheet is \"" + xl.resultsTo + "\", not " + k.resultsTo + ".", { value: xl.resultsTo, expected: k.resultsTo });
      if (String(xl.invoiceTo || "").toLowerCase().trim() !== k.invoiceTo.toLowerCase()) add("block", "app", "invoice_email", "Invoice email on the spreadsheet is \"" + xl.invoiceTo + "\", not " + k.invoiceTo + ".", { value: xl.invoiceTo, expected: k.invoiceTo });
      if (phoneDigits(xl.phone) !== phoneDigits(k.officePhone)) add("block", "app", "phone_wrong", "The phone number on the spreadsheet is not the ENVSS office number.", { value: xl.phone, expected: k.officePhone });
    }
    if (pdf && !pdf.texts.some(t => /ESDAT/.test(t))) add("block", "app", "esdat_missing_pdf", "ESDAT is not stated on the CoC page.");
    if (inp.texts && inp.texts.length) {
      const f = privacyLint(inp.texts, { forbidden: inp.forbidden, cfg: k, where: i => (inp.textWhere ? inp.textWhere(i) : "#" + i) });
      const seen = {};
      f.forEach(x => { const key = x.kind + "|" + x.where; if (seen[key]) return; seen[key] = 1; add("block", "app", "privacy", "The generated CoC or email contains a " + x.kind + " (" + x.where + "). A CoC may carry the job number, sample details and the ENVSS office contact only.", { value: x.kind + " @ " + x.where }); });
    }
    if (inp.sendCheck && inp.sendCheck.previouslyFlagged) add("block", "app", "flagged_open", "An error report for this CoC (app v" + inp.sendCheck.appVersion + ") has been sent and is still being looked at. Send stays blocked until the app is updated.");
    return out;
  }

  /* ---------- the CoC page: one drawing list, drawn to the PDF and to the on-screen image ---------- */
  const PAGE = { w: 842, h: 595, m: 24 };
  const NAVY = [0.106, 0.137, 0.25], GREY = [0.55, 0.58, 0.65], LIGHT = [0.93, 0.94, 0.96], RED = [0.72, 0.12, 0.12], BLACK = [0, 0, 0], WHITE = [1, 1, 1];
  function tw(s, z, b) {
    let w = 0; s = String(s);
    for (let i = 0; i < s.length; i++) { const c = s[i]; w += /[A-Z]/.test(c) ? 0.68 : /[0-9]/.test(c) ? 0.556 : c === " " ? 0.278 : /[ilIjt.,:;'|!]/.test(c) ? 0.27 : /[mwMW@]/.test(c) ? 0.8 : 0.52; }
    return w * z * (b ? 1.06 : 1);
  }
  function wrap(s, w, z, b) {
    const words = String(s).split(/\s+/).filter(Boolean), lines = []; let cur = "";
    words.forEach(wd => {
      let t = cur ? cur + " " + wd : wd;
      if (tw(t, z, b) <= w) { cur = t; return; }
      if (cur) lines.push(cur);
      while (tw(wd, z, b) > w && wd.length > 1) { let n = wd.length - 1; while (n > 1 && tw(wd.slice(0, n), z, b) > w) n--; lines.push(wd.slice(0, n)); wd = wd.slice(n); }
      cur = wd;
    });
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  }
  const TAT_LABEL = { standard: "Standard", same_day: "Same Day", "1_day": "1 day", "2_day": "2 day", "3_day": "3 day" };
  function layoutCoc(model, conf) {
    const k = conf || cfg(), M = PAGE.m, W = PAGE.w - 2 * M, texts = [];
    let pages = [], P = null;
    const newPage = () => { P = { w: PAGE.w, h: PAGE.h, ops: [] }; pages.push(P); return P; };
    const T = (x, y, s, z, o) => { o = o || {}; s = String(s); texts.push(s); P.ops.push({ k: "t", x, y, s, z, b: !!o.b, a: o.a || "l", c: o.c || BLACK }); };
    const R = (x, y, w, h, o) => { o = o || {}; P.ops.push({ k: "r", x, y, w, h, f: o.f || null, s: o.s == null ? 0.6 : o.s, c: o.c || BLACK }); };
    const Ln = (x1, y1, x2, y2, w, c) => P.ops.push({ k: "l", x1, y1, x2, y2, w: w || 0.6, c: c || BLACK });
    const done = () => pages.length;

    newPage();
    R(M, M, W, 30, { f: NAVY, s: 0 });
    T(M + 10, M + 20, "CHAIN OF CUSTODY FORM - Client", 14, { b: true, c: WHITE });
    T(M + W - 10, M + 20, "ENVIROLAB GROUP  ·  Form 302", 11, { b: true, c: WHITE, a: "r" });
    /* ESDAT banner */
    let y = M + 38;
    R(M, y, W, 30, { s: 2, c: RED });
    R(M + 8, y + 6, 18, 18, { s: 1.5, c: RED }); Ln(M + 11, y + 9, M + 23, y + 21, 2.4, RED); Ln(M + 23, y + 9, M + 11, y + 21, 2.4, RED);
    T(M + 36, y + 21, "RESULTS REQUIRED IN ESDAT FORMAT", 16, { b: true, c: RED });
    T(M + W - 10, y + 13, "Email results to " + model.resultsTo, 9.5, { b: true, a: "r" });
    T(M + W - 10, y + 25, "Email invoice to " + model.invoiceTo, 9.5, { a: "r" });
    /* header facts */
    y += 38;
    const lw = 394, rx = M + lw + 12, rw = W - lw - 12;
    const left = [["Company", k.companyName + " (ENVSS)"], ["Contact", model.contactLabel], ["Phone", model.officePhone], ["Address", model.officeAddress], ["Job number", model.job], ["Event", model.eventCode], ["Samples", String(model.samples.length) + (model.samples.some(s => s.blank) ? " (includes field blank)" : "")]];
    const rowH = 16; R(M, y, lw, rowH * left.length, { s: 0.8 });
    left.forEach((r, i) => { const yy = y + i * rowH; if (i) Ln(M, yy, M + lw, yy, 0.4, GREY); T(M + 6, yy + 11.5, r[0] + ":", 9, { b: true }); T(M + 80, yy + 11.5, r[1], 10, { b: r[0] === "Job number" }); });
    /* right: turnaround + collection */
    R(rx, y, rw, rowH * left.length, { s: 0.8 });
    T(rx + 6, y + 11.5, "Date results required:", 9, { b: true });
    const tats = [["standard", "Standard"], ["same_day", "Same Day"], ["1_day", "1 day"], ["2_day", "2 day"], ["3_day", "3 day"]];
    let tx = rx + 118;
    tats.forEach(([c, l]) => { R(tx, y + 3.5, 9, 9, { s: 0.8 }); if (c === model.turnaround) { Ln(tx + 1.5, y + 5, tx + 7.5, y + 11, 1.4); Ln(tx + 7.5, y + 5, tx + 1.5, y + 11, 1.4); } T(tx + 12, y + 11.5, l, 8.5); tx += 12 + tw(l, 8.5) + 10; });
    Ln(rx, y + rowH, rx + rw, y + rowH, 0.4, GREY);
    T(rx + 6, y + rowH + 11.5, "SAMPLE COLLECTION REQUESTED", 9, { b: true, c: RED });
    Ln(rx, y + rowH * 2, rx + rw, y + rowH * 2, 0.4, GREY);
    T(rx + 6, y + rowH * 2 + 11.5, "Day:", 9, { b: true }); T(rx + 50, y + rowH * 2 + 11.5, dayLabel(model.collection.date) + "  (" + dmy(model.collection.date) + ")", 10);
    Ln(rx, y + rowH * 3, rx + rw, y + rowH * 3, 0.4, GREY);
    T(rx + 6, y + rowH * 3 + 11.5, "Time:", 9, { b: true }); T(rx + 50, y + rowH * 3 + 11.5, timeLabel(model.collection), 10);
    Ln(rx, y + rowH * 4, rx + rw, y + rowH * 4, 0.4, GREY);
    T(rx + 6, y + rowH * 4 + 11.5, "Where:", 9, { b: true });
    const locLines = wrap(model.collection.location, rw - 56, 9.5).slice(0, 3);
    locLines.forEach((l, i) => T(rx + 50, y + rowH * 4 + 11.5 + i * 11, l, 9.5));
    Ln(rx, y + rowH * 6, rx + rw, y + rowH * 6, 0.4, GREY);
    T(rx + 6, y + rowH * 6 + 11.5, "Prepared:", 9, { b: true }); T(rx + 60, y + rowH * 6 + 11.5, model.preparedAt, 9);
    y += rowH * left.length + 10;

    /* table */
    const names = model.analyteNames, kA = names.length;
    const fixed = { n: 22, id: 96, depth: 32, date: 58, type: 50, run: 44, vol: 44 };
    const fixedSum = Object.values(fixed).reduce((a, b) => a + b, 0);
    const commentMin = 120, avail = W - fixedSum - commentMin;
    const aw = kA ? Math.max(24, Math.min(72, avail / kA)) : 0;
    const useCodes = aw < 46;
    const cw = W - fixedSum - aw * kA;
    const cols = []; let cx = M;
    const col = (key, w, label) => { cols.push({ key, x: cx, w, label }); cx += w; };
    col("n", fixed.n, "No."); col("id", fixed.id, "Client Sample ID"); col("depth", fixed.depth, "Depth"); col("date", fixed.date, "Date Sampled"); col("type", fixed.type, "Type");
    names.forEach((n, i) => col("a" + i, aw, useCodes ? model.analyteCodes[i] : n));
    col("run", fixed.run, "Run Time (min)"); col("vol", fixed.vol, "Volume (L)"); col("com", cw, "Comments");
    const headH = (() => { let n = 2; cols.forEach(c => { n = Math.max(n, wrap(c.label, c.w - 4, 8, true).length); }); return n * 10 + 8; })();
    const tableHead = yy => {
      R(M, yy, W, headH, { f: LIGHT, s: 0.8 });
      cols.forEach((c, i) => { if (i) Ln(c.x, yy, c.x, yy + headH, 0.5); wrap(c.label, c.w - 4, 8, true).forEach((l, j) => T(c.x + c.w / 2, yy + 11 + j * 10, l, 8, { b: true, a: "c" })); });
      return yy + headH;
    };
    T(M, y + 9, "Sample information", 9, { b: true }); T(cols[5] ? cols[5].x : M + 300, y + 9, "Tests Required", 9, { b: true });
    y = tableHead(y + 14);
    const footH = 74, limit = PAGE.h - 30;
    let rendered = 0;
    model.samples.forEach(s => {
      const cells = { n: String(s.no), id: s.id, depth: "N/A", date: s.dateSampled, type: s.type, run: s.run == null ? "" : String(s.run), vol: s.vol == null ? "" : (typeof s.vol === "number" ? s.vol.toFixed(1) : String(s.vol)), com: s.comment || "" };
      const comLines = wrap(cells.com, cw - 6, 8.5);
      const rh = Math.max(17, comLines.length * 10.5 + 6);
      if (y + rh > limit) { newPage(); T(M, M + 10, "Chain of custody (continued)  ·  Job " + model.job + "  ·  " + model.eventCode, 10, { b: true }); y = tableHead(M + 18); }
      R(M, y, W, rh, { s: 0.5 });
      cols.forEach((c, i) => {
        if (i) Ln(c.x, y, c.x, y + rh, 0.4);
        const mid = c.x + c.w / 2, by = y + rh / 2 + 3.5;
        if (c.key[0] === "a") { if (s.codes.indexOf(model.analyteCodes[+c.key.slice(1)]) >= 0) T(mid, by + 0.5, "X", 11, { b: true, a: "c" }); }
        else if (c.key === "com") comLines.forEach((l, j) => T(c.x + 3, y + 11 + j * 10.5, l, 8.5));
        else if (c.key === "id") T(c.x + 3, by, cells.id, 9, { b: true });
        else T(mid, by, cells[c.key], 9, { a: "c" });
      });
      y += rh; rendered++;
    });
    if (useCodes) {
      const leg = model.analyteCodes.map((c, i) => c + " = " + names[i]).join(";  ");
      wrap("Key: " + leg, W, 8).forEach(l => { y += 10; if (y > limit) { newPage(); y = M + 10; } T(M, y, l, 8); });
      y += 4;
    }
    /* footer */
    y += 8;
    if (y + footH > limit + 8) { newPage(); T(M, M + 10, "Chain of custody (continued)  ·  Job " + model.job + "  ·  " + model.eventCode, 10, { b: true }); y = M + 22; }
    const half = W / 2 - 6;
    R(M, y, half, footH - 10, { s: 0.8 }); R(M + half + 12, y, half, footH - 10, { s: 0.8 });
    T(M + 6, y + 12, "Relinquished by (Company): ENVSS", 9, { b: true });
    T(M + 6, y + 28, "Print name:  ENVSS", 9); T(M + 6, y + 42, "Date & time sent:  " + model.preparedAt, 9); T(M + 6, y + 56, "Signature:  Sent electronically from the ENVSS Field app", 9);
    T(M + half + 18, y + 12, "Received by (Company):", 9, { b: true });
    T(M + half + 18, y + 28, "Print name:", 9); T(M + half + 18, y + 42, "Date & time:", 9); T(M + half + 18, y + 56, "Lab use only: job no. ______   temp ______   seal ______", 9, { c: GREY });
    /* page footer */
    const n = pages.length;
    pages.forEach((pg, i) => { P = pg; T(M, PAGE.h - 12, "ENVSS Field  ·  Job " + model.job + "  ·  " + model.eventCode + "  ·  Results in ESDAT format", 8, { c: GREY }); T(PAGE.w - M, PAGE.h - 12, "Page " + (i + 1) + " of " + n, 8, { a: "r", c: GREY }); });
    return { pages, texts, rows: rendered, page: PAGE };
  }

  /* drawing the list. PDF: pdf-lib. Image: any 2D canvas context. The same ops, so the tech checks exactly what is attached. */
  const WINANSI = /[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g;
  async function drawPdf(PDFLib, layout, meta) {
    const doc = await PDFLib.PDFDocument.create();
    const reg = await doc.embedFont(PDFLib.StandardFonts.Helvetica), bold = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const rgb = c => PDFLib.rgb(c[0], c[1], c[2]);
    meta = meta || {};
    if (meta.title) doc.setTitle(meta.title);
    doc.setProducer("ENVSS Field app"); doc.setCreator("ENVSS Field app");
    if (meta.date) { doc.setCreationDate(meta.date); doc.setModificationDate(meta.date); }
    layout.pages.forEach(pg => {
      const page = doc.addPage([pg.w, pg.h]);
      pg.ops.forEach(o => {
        if (o.k === "t") {
          const s = o.s.replace(WINANSI, "?"), f = o.b ? bold : reg; let x = o.x;
          const w = f.widthOfTextAtSize(s, o.z); if (o.a === "c") x -= w / 2; else if (o.a === "r") x -= w;
          page.drawText(s, { x, y: pg.h - o.y, size: o.z, font: f, color: rgb(o.c) });
        } else if (o.k === "r") {
          page.drawRectangle({ x: o.x, y: pg.h - o.y - o.h, width: o.w, height: o.h, color: o.f ? rgb(o.f) : undefined, borderColor: o.s ? rgb(o.c) : undefined, borderWidth: o.s || 0 });
        } else if (o.k === "l") {
          page.drawLine({ start: { x: o.x1, y: pg.h - o.y1 }, end: { x: o.x2, y: pg.h - o.y2 }, thickness: o.w, color: rgb(o.c) });
        }
      });
    });
    return doc.save();
  }
  function drawCanvas(ctx, pg, scale) {
    scale = scale || 1;
    ctx.save(); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, pg.w * scale, pg.h * scale);
    const css = c => "rgb(" + Math.round(c[0] * 255) + "," + Math.round(c[1] * 255) + "," + Math.round(c[2] * 255) + ")";
    pg.ops.forEach(o => {
      if (o.k === "t") { ctx.font = (o.b ? "bold " : "") + (o.z * scale) + 'px Helvetica, Arial, "Liberation Sans", sans-serif'; ctx.fillStyle = css(o.c); ctx.textAlign = o.a === "c" ? "center" : o.a === "r" ? "right" : "left"; ctx.textBaseline = "alphabetic"; ctx.fillText(o.s, o.x * scale, o.y * scale); }
      else if (o.k === "r") { if (o.f) { ctx.fillStyle = css(o.f); ctx.fillRect(o.x * scale, o.y * scale, o.w * scale, o.h * scale); } if (o.s) { ctx.lineWidth = o.s * scale; ctx.strokeStyle = css(o.c); ctx.strokeRect(o.x * scale, o.y * scale, o.w * scale, o.h * scale); } }
      else if (o.k === "l") { ctx.lineWidth = o.w * scale; ctx.strokeStyle = css(o.c); ctx.beginPath(); ctx.moveTo(o.x1 * scale, o.y1 * scale); ctx.lineTo(o.x2 * scale, o.y2 * scale); ctx.stroke(); }
    });
    ctx.restore();
  }

  /* ---------- emails ---------- */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
  function buildEmail(model, conf) {
    const k = conf || cfg(), n = model.samples.length;
    const subject = "ENVSS chain of custody " + model.eventCode + " (" + n + " sample" + (n === 1 ? "" : "s") + ")" + (model.resendOf ? " AMENDED" : "");
    const lines = [
      "Hello,", "",
      model.resendOf ? "This is an AMENDED chain of custody. It replaces the one we sent earlier for this event. Please use this one." : "Please find our chain of custody (Form 302) attached.", "",
      "Job number: " + model.job, "Event: " + model.eventCode, "Samples: " + n, "Turnaround: " + (TAT_LABEL[model.turnaround] || "Standard"), "",
      "RESULTS REQUIRED IN ESDAT FORMAT.", "Email results and reports to " + model.resultsTo + ". Invoices to " + model.invoiceTo + ".", "",
      "Sample collection requested", "  Day:   " + dayLabel(model.collection.date) + " (" + dmy(model.collection.date) + ")", "  Time:  " + timeLabel(model.collection), "  Where: " + model.collection.location, "",
      "Attached: " + model.attachmentNames.join(", ") + ".", "",
      "Questions: ENVSS office, " + model.officePhone + ", or reply to " + k.replyTo + ".", "", "Thank you,", "ENVSS"
    ];
    const text = lines.join("\n");
    const html = "<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111\">"
      + "<p>Hello,</p><p>" + (model.resendOf ? "<b>This is an AMENDED chain of custody.</b> It replaces the one we sent earlier for this event. Please use this one." : "Please find our chain of custody (Form 302) attached.") + "</p>"
      + "<table style=\"border-collapse:collapse\"><tr><td><b>Job number</b></td><td style=\"padding-left:12px\">" + esc(model.job) + "</td></tr><tr><td><b>Event</b></td><td style=\"padding-left:12px\">" + esc(model.eventCode) + "</td></tr><tr><td><b>Samples</b></td><td style=\"padding-left:12px\">" + n + "</td></tr><tr><td><b>Turnaround</b></td><td style=\"padding-left:12px\">" + esc(TAT_LABEL[model.turnaround] || "Standard") + "</td></tr></table>"
      + "<p style=\"font-size:16px;color:#B71F1F\"><b>RESULTS REQUIRED IN ESDAT FORMAT</b><br><span style=\"font-size:13px;color:#111\">Email results and reports to " + esc(model.resultsTo) + ". Invoices to " + esc(model.invoiceTo) + ".</span></p>"
      + "<p><b>Sample collection requested</b><br>Day: " + esc(dayLabel(model.collection.date)) + " (" + esc(dmy(model.collection.date)) + ")<br>Time: " + esc(timeLabel(model.collection)) + "<br>Where: " + esc(model.collection.location) + "</p>"
      + "<p>Attached: " + esc(model.attachmentNames.join(", ")) + ".</p><p>Questions: ENVSS office, " + esc(model.officePhone) + ", or reply to " + esc(k.replyTo) + ".</p><p>Thank you,<br>ENVSS</p></div>";
    return { subject, text, html };
  }

  function buildAlert(a, conf) {
    const k = conf || cfg(), L = [];
    const cm = String(a.flag && a.flag.comment || "").trim();
    L.push("TECH FLAG: SOMETHING LOOKS WRONG", "Raised by: " + (a.techUser || "unknown") + (a.flag && a.flag.manual ? " (raised by hand from the CoC preview)" : " (after the app's own checks failed)"), "Tech's comment:", cm || "(none)", "", "=".repeat(60), "");
    L.push("JOB / EVENT", "Job number: " + a.job, "Event: " + a.eventCode + (a.eventId ? "  (id " + a.eventId + ")" : ""), "Project id: " + (a.projectId || ""), "Turnaround: " + (TAT_LABEL[a.turnaround] || a.turnaround || ""), "Samples on CoC: " + (a.model ? a.model.samples.length : "n/a") + "  (event expects " + a.expectedCount + ")", "");
    L.push("FAILING CHECKS (" + (a.failed || []).length + ")");
    (a.failed || []).forEach(c => L.push("- [" + c.level.toUpperCase() + " / " + (c.fix === "app" ? "APP SIDE" : "tech can fix") + "] " + c.id + ": " + c.text + (c.value !== undefined && c.value !== "" ? "   value=" + JSON.stringify(c.value) : "") + (c.expected !== undefined ? "   expected=" + JSON.stringify(c.expected) : "")));
    if (!(a.failed || []).length) L.push("(none: the tech raised the flag by hand)");
    L.push("", "WARNINGS (" + (a.warned || []).length + ")"); (a.warned || []).forEach(c => L.push("- " + c.id + ": " + c.text));
    L.push("", "SAMPLES");
    (a.raw || []).forEach(s => { const r = recompute(s); L.push("- " + s.label + " | id " + (s.id || "?") + " | " + (s.blank ? "BLANK" : s.type) + (s.rejected ? " | REJECTED " + (s.rejectCode || s.rejectReason || "") : "") + " | status " + s.status + " | start " + (s.startAt || "-") + " | stop " + (s.endAt || "-") + " | flow " + (s.startFlow || "-") + " -> " + (s.endFlow || "-") + " | run " + (r.mins == null ? "-" : r.mins.toFixed(1)) + " min | calc vol " + (r.volR == null ? "-" : r.volR) + " L | analyses " + (s.codes.join("+") || "-")); });
    if (a.xlsxRows) { L.push("", "GENERATED SPREADSHEET ROWS"); a.xlsxRows.forEach(x => L.push("- " + x.id + " | " + x.date + " | " + x.type + " | run " + x.run + " | vol " + x.vol + " | ticks " + (x.analytes || []).length + " | " + (x.comment || ""))); }
    if (a.model) { L.push("", "CoC PAGE MODEL ROWS"); a.model.samples.forEach(x => L.push("- " + x.id + " | " + x.dateSampled + " | " + x.type + " | run " + x.run + " | vol " + x.vol)); }
    L.push("", "COLLECTION ENTERED", JSON.stringify(a.collection || {}), "", "CONTENT HASH: " + (a.hash || ""), "", "ENVIRONMENT",
      "App version: " + a.appVersion + " (coc-send " + VERSION + ")", "Device / browser: " + (a.device || ""), "Screen: " + (a.screen || ""), "Online: " + a.online, "Time (AWST): " + perthStamp(a.when || new Date()), "Time (ISO): " + (a.when || new Date()).toISOString(), "", "ATTACHED: " + (a.attachmentNames || []).join(", ") + (a.attachmentNames && a.attachmentNames.length ? "" : "(none could be generated)"), "", "Nothing was sent to the lab. This message was sent by the technician's tap on 'Send error report'.");
    const text = L.join("\n");
    const subject = "[ENVSS Field] CoC error report " + a.eventCode + " - " + ((a.failed || []).map(c => c.id).slice(0, 3).join(", ") || "flagged by tech") + " (app v" + a.appVersion + ")";
    const html = "<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111\"><div style=\"border:2px solid #B71F1F;padding:10px;margin-bottom:12px\"><b style=\"color:#B71F1F\">TECH FLAG: SOMETHING LOOKS WRONG</b><br>Raised by " + esc(a.techUser || "unknown") + (a.flag && a.flag.manual ? " (by hand from the CoC preview)" : " (after the app's checks failed)") + "<br><br><b>Tech's comment</b><br>" + esc(cm).replace(/\n/g, "<br>") + "</div><pre style=\"white-space:pre-wrap;font-family:Consolas,monospace;font-size:12px\">" + esc(text.split("\n").slice(L.indexOf("JOB / EVENT")).join("\n")) + "</pre></div>";
    return { subject, text, html };
  }

  function csvCell(v) { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? "\"" + s.replace(/"/g, "\"\"") + "\"" : s; }
  function csvOf(model) {
    const head = ["job", "event", "sample_no", "client_sample_id", "date_sampled", "type", "analyses", "run_time_min", "volume_L", "comment", "turnaround", "results_format", "collection_day", "collection_from", "collection_to", "collection_location"];
    const rows = model.samples.map(s => [model.job, model.eventCode, s.no, s.id, s.dateSampled, s.type, s.analytes.join(" + "), s.run, s.vol, s.comment, TAT_LABEL[model.turnaround] || "Standard", "ESDAT", model.collection.date, model.collection.from, model.collection.to || "", model.collection.location]);
    return [head].concat(rows).map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  }

  /* ---------- send history / duplicate guard ---------- */
  function sendState(history, hash, now, conf) {
    const k = conf || cfg(), sends = (history || []).filter(r => r.kind === "send" && r.status !== "failed" && r.status !== "cancelled").sort((a, b) => String(a.requested_at || "").localeCompare(String(b.requested_at || "")));
    const last = sends[sends.length - 1] || null;
    const same = sends.find(r => r.content_hash === hash) || null;
    let throttle = false;
    if (last && last.requested_at) throttle = (Date.parse(now.toISOString()) - Date.parse(last.requested_at)) < k.resendThrottleMin * 60000;
    return { last, same, any: sends.length > 0, throttle };
  }

  const api = { VERSION, DEFAULTS, cfg, pad2, num, round1, perthParts, perthDay, perthStamp, dmy, weekdayOf, dayLabel, hm12, timeLabel, phoneDigits, recompute, validateCollection, canonical, contentHash, privacyLint, runChecks, layoutCoc, drawPdf, drawCanvas, buildEmail, buildAlert, csvOf, sendState, TAT_LABEL, wrap, tw, PAGE };
  root.ENVSS_COC = api;
  if (!root.ENVSS_COC_SEND_CONFIG) root.ENVSS_COC_SEND_CONFIG = cfg();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

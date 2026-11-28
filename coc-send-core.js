/* ENVSS Field: CoC send, pure core (v48.19, stage 1 of the lab pipeline).
   No DOM, no app globals, no network. Works in the browser (window.ENVSS_COC) and in Node (module.exports) so it can be unit tested.
   What lives here: config, Perth date helpers, the model hash, pre-send checks (block / warn, tech-fixable / app-side), the privacy lint,
   the generated Form 302 drawn as a page (one drawing list for the PDF and the on-screen image), the lab email, the error-report email, CSV. */
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
      let s = String(t == null ? "" : t);
      /* the sampler's name (and initials) may appear in the CoC fields that are meant to carry it, and nowhere else */
      ((o.permit && o.permit(i)) || []).forEach(nm => { nm = String(nm || "").trim(); if (nm) s = s.replace(new RegExp("(?<![A-Za-z0-9@._-])" + nm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![A-Za-z0-9@_-])", "ig"), " "); });
      const low = s.toLowerCase(), where = o.where ? o.where(i) : ("#" + i);
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
      if (model.samples.length !== expect) add("block", "app", "count_pdf", "The CoC summary has " + model.samples.length + " sample rows; the event has " + expect + ".", { value: model.samples.length, expected: expect });
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
            if (pv == null || Math.abs(pv - r.volR) > k.volTolL + 1e-9) add("block", "app", "vol_mismatch_pdf", L + ": volume in the CoC summary is " + (m.vol == null ? "blank" : m.vol) + " L; average flow x run time is " + r.volR + " L.", ev(m.vol, r.volR));
            if (gv != null && pv != null && Math.abs(gv - pv) > 1e-9) add("block", "app", "xlsx_pdf_vol", L + ": the spreadsheet and the CoC summary show different volumes (" + gv + " and " + pv + ").", ev(gv, pv));
          }
          if (r.mins != null && r.mins > 0) {
            const gr = num(x.run);
            if (gr == null || Math.abs(gr - Math.round(r.mins)) > 0.5 + 1e-9) add("block", "app", "run_mismatch", L + ": run time on the spreadsheet is " + x.run + " min; start to stop is " + Math.round(r.mins) + " min.", ev(x.run, Math.round(r.mins)));
          }
        }
        if (s.rejected && !/reject|void|fault/i.test(String(x.comment || "")) ) add("block", "app", "reject_note", L + " is rejected but the CoC comment does not say so.", ev(x.comment, "rejected note"));
        const want = s.codes.slice().sort().join(","), gotN = (x.analytes || []).length;
        if (gotN !== s.codes.length) add("block", "app", "analyte_mismatch", L + ": the CoC ticks " + gotN + " analyses; the sample has " + s.codes.length + ".", ev(gotN, s.codes.length));
        if (String(x.type) !== String(m.type) || String(x.date) !== String(m.dateSampled)) add("block", "app", "xlsx_pdf_row", L + ": the spreadsheet and the CoC summary disagree on date or type.", ev(x.type + " " + x.date, m.type + " " + m.dateSampled));
      });
      (xl.analyteHeaders || []).forEach(h => { if (/^[A-Z0-9]{2,4}$/.test(h)) add("block", "app", "analyte_name", "The analysis \"" + h + "\" has no readable name in the app catalogue.", { value: h }); });
      if (!xl.esdatTick) add("block", "app", "esdat_missing", "ESDAT is not ticked as the results format on the spreadsheet.");
      if (String(xl.resultsTo || "").toLowerCase().trim() !== k.resultsTo.toLowerCase()) add("block", "app", "results_email", "Results email on the spreadsheet is \"" + xl.resultsTo + "\", not " + k.resultsTo + ".", { value: xl.resultsTo, expected: k.resultsTo });
      if (String(xl.invoiceTo || "").toLowerCase().trim() !== k.invoiceTo.toLowerCase()) add("block", "app", "invoice_email", "Invoice email on the spreadsheet is \"" + xl.invoiceTo + "\", not " + k.invoiceTo + ".", { value: xl.invoiceTo, expected: k.invoiceTo });
      if (inp.samplers) {   /* the sampler(s) from the app are the contact, project manager, sampler and relinquished-by on the form */
        const want = inp.samplers.join(", ");
        if (!want) add("warn", "tech", "sampler_missing", "No sampler name for the CoC (nobody is recorded as pressing START or STOP on a named login). The contact, sampler and relinquished-by boxes will be blank.");
        else ["contact", "projectMgr", "sampler", "printName"].forEach(f => { if ((xl.who || {})[f] !== want) add("block", "app", "sampler_" + f, "The sampler's name is not on the CoC where it should be (" + f + ").", { value: (xl.who || {})[f], expected: want }); });
      }
      if (phoneDigits(xl.phone) !== phoneDigits(k.officePhone)) add("block", "app", "phone_wrong", "The phone number on the spreadsheet is not the ENVSS office number.", { value: xl.phone, expected: k.officePhone });
    }
    if (pdf && !pdf.texts.some(t => /ESDAT/i.test(t))) add("block", "app", "esdat_missing_pdf", "ESDAT is not stated on the CoC page.");
    if (pdf && model) model.samples.forEach(m => { if (m.id && !pdf.texts.some(t => String(t).indexOf(m.id) >= 0)) add("block", "app", "render_missing_sample", "Sample " + m.id + " is not on the rendered CoC page.", { value: m.id }); });
    if (inp.texts && inp.texts.length) {
      const f = privacyLint(inp.texts, { forbidden: inp.forbidden, cfg: k, permit: inp.permit, where: i => (inp.textWhere ? inp.textWhere(i) : "#" + i) });
      const seen = {};
      f.forEach(x => { const key = x.kind + "|" + x.where; if (seen[key]) return; seen[key] = 1; add("block", "app", "privacy", "The generated CoC or email contains a " + x.kind + " (" + x.where + "). A CoC may carry the job number, sample details and the ENVSS office contact only.", { value: x.kind + " @ " + x.where }); });
    }
    if (inp.sendCheck && inp.sendCheck.previouslyFlagged) add("block", "app", "flagged_open", "An error report for this CoC (app v" + inp.sendCheck.appVersion + ") has been sent and is still being looked at. Send stays blocked until the app is updated.");
    return out;
  }

  /* ---------- the CoC page = the generated Form 302 spreadsheet, drawn as a page ----------
     John (t779u): the CoC must look exactly like the existing (old-format) Form 302. So the page is not a new design: layoutSheet() reads the
     generated worksheet (ExcelJS object: column widths, row heights, merges, fills, borders, fonts, alignment, logo image, footer text, print area,
     repeat rows) and produces one drawing list in A4 landscape, fit to one page wide like the Excel print setup. The same list is drawn to the PDF
     and to the on-screen image, so the tech checks what is attached. Nothing is added to the page by the app. */
  const PAGE = { w: 842, h: 595 };
  const HW = { /* Helvetica / Arial advance widths per 1000 em */
    reg: " 278,!278,\"355,#556,$556,%889,&667,'191,(333,)333,*389,+584,,278,-333,.278,/278,0556,1556,2556,3556,4556,5556,6556,7556,8556,9556,:278,;278,<584,=584,>584,?556,@1015,A667,B667,C722,D722,E667,F611,G778,H722,I278,J500,K667,L556,M833,N722,O778,P667,Q778,R722,S667,T611,U722,V667,W944,X667,Y667,Z611,[278,\\278,]278,^469,_556,`333,a556,b556,c500,d556,e556,f278,g556,h556,i222,j222,k500,l222,m833,n556,o556,p556,q556,r333,s500,t278,u556,v500,w722,x500,y500,z500,{334,|260,}334,~584",
    bold: " 278,!333,\"474,#556,$556,%889,&722,'238,(333,)333,*389,+584,,278,-333,.278,/278,0556,1556,2556,3556,4556,5556,6556,7556,8556,9556,:333,;333,<584,=584,>584,?611,@975,A722,B722,C722,D722,E667,F611,G778,H722,I278,J556,K722,L611,M833,N722,O778,P667,Q778,R722,S667,T611,U722,V667,W944,X667,Y667,Z611,[333,\\278,]333,^584,_556,`333,a556,b611,c556,d611,e556,f333,g611,h611,i278,j278,k556,l278,m889,n611,o611,p611,q611,r389,s556,t333,u611,v556,w778,x556,y556,z500,{389,|280,}389,~584" };
  const HWM = {};
  ["reg", "bold"].forEach(k => { HWM[k] = {}; const str = HW[k]; let i = 0; while (i < str.length) { const ch = str[i]; let j = i + 1; while (j < str.length && /\d/.test(str[j])) j++; HWM[k][ch] = +str.slice(i + 1, j); i = j; } });
  function tw(s, z, b) { const m = HWM[b ? "bold" : "reg"]; let w = 0; s = String(s); for (let i = 0; i < s.length; i++) w += (m[s[i]] != null ? m[s[i]] : 556); return w * z / 1000; }
  function wrap(s, w, z, b) {
    const out = [];
    String(s).split("\n").forEach(par => {
      const words = par.split(/ +/); let cur = "";
      words.forEach(wd => {
        const t = cur ? cur + " " + wd : wd;
        if (tw(t, z, b) <= w || !cur && !wd) { cur = t; return; }
        if (cur) out.push(cur);
        cur = wd;
        while (tw(cur, z, b) > w && cur.length > 1) { let n = cur.length - 1; while (n > 1 && tw(cur.slice(0, n), z, b) > w) n--; out.push(cur.slice(0, n)); cur = cur.slice(n); }
      });
      out.push(cur);
    });
    return out;
  }
  const THEME = ["FFFFFF", "000000", "EEECE1", "1F497D", "4F81BD", "C0504D", "9BBB59", "8064A2", "4BACC6", "F79646"];
  function rgbOf(c, dflt) {
    if (!c) return dflt || null;
    let hex = null;
    if (c.argb) hex = String(c.argb).slice(-6);
    else if (c.theme != null) hex = THEME[c.theme] || "000000";
    else if (c.indexed != null) hex = "000000";
    if (!hex) return dflt || null;
    let r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    if (c.tint) { const t = c.tint, f = v => Math.round(t < 0 ? v * (1 + t) : v + (255 - v) * t); r = f(r); g = f(g); b = f(b); }
    return [r / 255, g / 255, b / 255];
  }
  const BW = { hair: 0.25, thin: 0.5, dotted: 0.5, dashed: 0.5, dashDot: 0.5, medium: 1.5, mediumDashed: 1.5, thick: 2.25, double: 1.5 };
  function cellText(v, numFmt) {
    if (v == null) return "";
    if (typeof v === "number") { if (/^0\.0+$/.test(numFmt || "")) return v.toFixed(numFmt.length - 2); return String(Math.round(v * 1e9) / 1e9); }
    if (v instanceof Date) return v.toISOString();
    if (typeof v === "object") { if (v.richText) return v.richText.map(r => r.text).join(""); if (v.text != null) return String(v.text); if (v.result != null) return String(v.result); return ""; }
    return String(v);
  }
  function runsOf(cell) {   /* [{t, b, i, z, c}] so rich text (bold label + normal text) keeps its own fonts */
    const f0 = cell.font || {}, v = cell.value, base = { b: !!f0.bold, i: !!f0.italic, z: f0.size || 10, c: rgbOf(f0.color, [0, 0, 0]) };
    if (v && typeof v === "object" && v.richText) return v.richText.map(r => { const f = r.font || {}; return { t: r.text, b: !!f.bold, i: !!f.italic, z: f.size || base.z, c: f.color ? rgbOf(f.color, base.c) : base.c }; });
    return [{ t: cellText(v, cell.numFmt), b: base.b, i: base.i, z: base.z, c: base.c }];
  }
  function parseFooter(s) {
    const out = { L: "", C: "", R: "" }; let cur = "C"; s = String(s || "");
    const parts = s.split(/(&[LCR])/); parts.forEach(p => { if (/^&[LCR]$/.test(p)) cur = p[1]; else out[cur] += p; });
    return out;
  }
  function layoutSheet(wb, ws, opts) {
    opts = opts || {};
    const ps = ws.pageSetup || {}, mg = ps.margins || { left: .4, right: .4, top: .5, bottom: .6, footer: .25 };
    const area = String(ps.printArea || "A1:W" + ws.rowCount).match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    const colNum = L => L.split("").reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
    const c1 = colNum(area[1]), r1 = +area[2], c2 = colNum(area[3]), r2 = +area[4];
    const dflt = (ws.properties && ws.properties.defaultColWidth) || 8.43, dRow = (ws.properties && ws.properties.defaultRowHeight) || 15;
    const colW = [0], colX = [0];
    for (let c = 1; c <= c2; c++) { const col = ws.getColumn(c); const w = col.width != null ? col.width : dflt; const pt = col.hidden ? 0 : Math.round(w * 7 + 5) * 0.75; colW[c] = pt; colX[c] = colX[c - 1] + pt; }
    const rowH = [0]; for (let r = 1; r <= r2; r++) { const h = ws.getRow(r).height; rowH[r] = h != null ? h : dRow; }
    const sheetW = colX[c2] - colX[c1 - 1];
    const availW = PAGE.w - (mg.left + mg.right) * 72;
    const s = ps.fitToPage ? Math.min(1, availW / sheetW) : (ps.scale || 100) / 100;
    const left = mg.left * 72 + (ps.horizontalCentered ? (availW - sheetW * s) / 2 : 0), top = mg.top * 72;
    const availH = (PAGE.h - mg.top * 72 - mg.bottom * 72) / s;
    const titles = ps.printTitlesRow ? ps.printTitlesRow.split(":").map(Number) : null;
    const merges = (ws.model.merges || []).map(m => { const q = m.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/); return { c1: colNum(q[1]), r1: +q[2], c2: colNum(q[3]), r2: +q[4], addr: m }; });
    const masterOf = {}; merges.forEach(m => { for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) masterOf[r + "," + c] = m; });
    /* paginate (never inside a merged block) */
    const pages = []; let cur = []; let h = 0; let started = 1;
    const titleRows = titles ? Array.from({ length: titles[1] - titles[0] + 1 }, (_, i) => titles[0] + i) : [];
    const thH = titleRows.reduce((a, r) => a + rowH[r], 0);
    for (let r = r1; r <= r2; r++) {
      if (h + rowH[r] > availH && cur.length) {
        let k = cur.length; let rr = r;
        while (k > 1 && masterOf[(rr) + "," + c1] && masterOf[rr + "," + c1].r1 < rr) { rr--; k--; }
        const carry = cur.splice(k); pages.push(cur); cur = (titles && r > titles[1] ? titleRows.slice() : []).concat(carry);
        h = cur.reduce((a, q) => a + rowH[q], 0);
      }
      cur.push(r); h += rowH[r];
    }
    if (cur.length) pages.push(cur);
    const out = { pages: [], texts: [], textAddr: [], rows: 0, images: [], page: PAGE, scale: s };
    const imgs = ws.getImages ? ws.getImages() : [];
    pages.forEach((rows, pi) => {
      const P = { w: PAGE.w, h: PAGE.h, ops: [] }; out.pages.push(P);
      const rowY = {}; let y = 0; rows.forEach(r => { rowY[r] = y; y += rowH[r]; });
      const X = c => left + (colX[c - 1] - colX[c1 - 1]) * s, Y = r => top + rowY[r] * s;
      const inPage = r => rowY[r] != null;
      const rect = (ca, ra, cb, rb) => { const x0 = X(ca), y0 = Y(ra); const x1 = X(cb) + colW[cb] * s, y1 = Y(rb) + rowH[rb] * s; return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
      const seenM = {};
      /* fills first, then borders, then text, then pictures */
      const cells = [];
      rows.forEach(r => { for (let c = c1; c <= c2; c++) { const m = masterOf[r + "," + c]; if (m && (m.r1 !== r || m.c1 !== c)) { cells.push({ r, c, slave: true, m }); continue; } cells.push({ r, c, m }); } });
      cells.forEach(k => {
        if (k.slave) return;
        const cell = ws.getCell(k.r, k.c), f = cell.fill;
        if (f && f.type === "pattern" && f.pattern === "solid") { const col = rgbOf(f.fgColor, null); if (col && !(col[0] === 1 && col[1] === 1 && col[2] === 1)) { const rc = k.m ? rect(k.m.c1, Math.max(k.m.r1, rows[0]), k.m.c2, Math.min(k.m.r2, rows[rows.length - 1])) : rect(k.c, k.r, k.c, k.r); P.ops.push({ k: "r", x: rc.x, y: rc.y, w: rc.w, h: rc.h, f: col, s: 0, c: [0, 0, 0] }); } }
      });
      cells.forEach(k => {
        const cell = ws.getCell(k.r, k.c), b = cell.border || {}, rc = rect(k.c, k.r, k.c, k.r);
        const L = (x1, y1, x2, y2, e) => { if (e && e.style) P.ops.push({ k: "l", x1, y1, x2, y2, w: (BW[e.style] || 0.5) * Math.max(s, 0.6), c: rgbOf(e.color, [0, 0, 0]) }); };
        const m = k.m;   /* inside a merged block only the outer edges are drawn (as Excel does) */
        if (!m || k.r === m.r1) L(rc.x, rc.y, rc.x + rc.w, rc.y, b.top);
        if (!m || k.r === m.r2) L(rc.x, rc.y + rc.h, rc.x + rc.w, rc.y + rc.h, b.bottom);
        if (!m || k.c === m.c1) L(rc.x, rc.y, rc.x, rc.y + rc.h, b.left);
        if (!m || k.c === m.c2) L(rc.x + rc.w, rc.y, rc.x + rc.w, rc.y + rc.h, b.right);
      });
      cells.forEach(k => {
        if (k.slave) return;
        const cell = ws.getCell(k.r, k.c), runs = runsOf(cell), txt = runs.map(q => q.t).join("");
        if (!txt.trim()) return;
        const al = cell.alignment || {};
        const rc = k.m ? rect(k.m.c1, Math.max(k.m.r1, rows[0]), k.m.c2, Math.min(k.m.r2, rows[rows.length - 1])) : rect(k.c, k.r, k.c, k.r);
        const pad = 2 * s, wUn = (rc.w - 2 * pad) / s;
        const isNum = typeof cell.value === "number";
        const hz = al.horizontal === "center" || al.horizontal === "centerContinuous" ? "c" : al.horizontal === "right" || (!al.horizontal && isNum) ? "r" : "l";
        /* lines: wrap per run-less simplification: one font per cell for wrapping (the first run), rich text keeps per-run font when it has explicit breaks */
        const lines = [];
        runs.forEach(rn => {
          const parts = String(rn.t).split("\n");
          parts.forEach((p, pi2) => { if (pi2 > 0 || !lines.length) lines.push([]); lines[lines.length - 1].push({ t: p, b: rn.b, i: rn.i, z: rn.z, c: rn.c }); });
        });
        const flat = [];
        lines.forEach(segs => {
          const base = segs[0] || { b: false, z: 10 };
          const text = segs.map(q => q.t).join("");
          if (al.wrapText && segs.length === 1) wrap(text, wUn, base.z, base.b).forEach(t => flat.push([{ t, b: base.b, i: base.i, z: base.z, c: base.c }]));
          else flat.push(segs);
        });
        const lh = z => z * 1.15;
        const blockH = flat.reduce((a, segs) => a + lh(Math.max.apply(null, segs.map(q => q.z).concat([1]))), 0) * s;
        const vt = al.vertical === "top" ? "t" : al.vertical === "middle" || al.vertical === "center" ? "m" : "b";
        let ty = vt === "t" ? rc.y + pad : vt === "m" ? rc.y + (rc.h - blockH) / 2 : rc.y + rc.h - blockH - pad * 0.5;
        flat.forEach(segs => {
          const z = Math.max.apply(null, segs.map(q => q.z).concat([1])), lineH = lh(z) * s;
          let text = segs.map(q => q.t).join(""), width = segs.reduce((a, q) => a + tw(q.t, q.z, q.b), 0);
          let x;
          if (hz === "c") x = rc.x + rc.w / 2 - width * s / 2; else if (hz === "r") x = rc.x + rc.w - pad - width * s; else x = rc.x + pad;
          segs.forEach(q => { const sw = tw(q.t, q.z, q.b) * s; if (q.t) { P.ops.push({ k: "t", x, cx: x + sw / 2, y: ty + lineH * 0.82, s: q.t, z: q.z * s, b: q.b, i: q.i, a: "l", c: q.c }); out.texts.push(q.t); out.textAddr.push(cell.address); } x += sw; });
          ty += lineH;
        });
      });
      /* logo(s) */
      imgs.forEach(im => {
        const r = im.range, tl = r.tl; if (!tl) return;
        const rowI = Math.floor(tl.row) + 1, colI = Math.floor(tl.col) + 1;
        if (!inPage(rowI)) return;
        const fx = tl.col - Math.floor(tl.col), fy = tl.row - Math.floor(tl.row);
        const x = X(colI) + fx * colW[colI] * s, y = Y(rowI) + fy * rowH[rowI] * s;
        const w = (r.ext ? r.ext.width : 100) * 0.75 * s, hh = (r.ext ? r.ext.height : 40) * 0.75 * s;
        const med = wb.getImage(im.imageId); if (!med) return;
        P.ops.push({ k: "i", x, y, w, h: hh, key: "img" + im.imageId, ext: med.extension, bytes: med.buffer });
        out.images.push("img" + im.imageId);
      });
      /* footer: Form number / issue date / page */
      const ft = parseFooter(ws.headerFooter && ws.headerFooter.oddFooter);
      const fy = PAGE.h - (mg.footer || 0.25) * 72 - 2, fz = 8;
      const fill = t => String(t).replace(/&P/g, String(pi + 1)).replace(/&N/g, String(pages.length)).replace(/&[A-Z]|&\d+/g, "");
      if (ft.L.trim() || ft.L) { const t = fill(ft.L); P.ops.push({ k: "t", x: left, y: fy, s: t, z: fz, b: false, i: false, a: "l", c: [0, 0, 0] }); out.texts.push(t); out.textAddr.push(""); }
      if (ft.C) { const t = fill(ft.C); P.ops.push({ k: "t", x: PAGE.w / 2, y: fy, s: t, z: fz, b: false, i: false, a: "c", c: [0, 0, 0] }); out.texts.push(t); out.textAddr.push(""); }
      if (ft.R) { const t = fill(ft.R); P.ops.push({ k: "t", x: PAGE.w - left, y: fy, s: t, z: fz, b: false, i: false, a: "r", c: [0, 0, 0] }); out.texts.push(t); out.textAddr.push(""); }
    });
    out.rows = Math.max(0, r2 - 17);
    return out;
  }

  /* drawing the list. PDF: pdf-lib. Image: any 2D canvas context. */
  const WINANSI = /[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g;
  async function drawPdf(PDFLib, layout, meta) {
    const doc = await PDFLib.PDFDocument.create(), F = PDFLib.StandardFonts;
    const fonts = { r: await doc.embedFont(F.Helvetica), b: await doc.embedFont(F.HelveticaBold), i: await doc.embedFont(F.HelveticaOblique), bi: await doc.embedFont(F.HelveticaBoldOblique) };
    const rgb = c => PDFLib.rgb(c[0], c[1], c[2]);
    meta = meta || {};
    if (meta.title) doc.setTitle(meta.title);
    doc.setProducer("ENVSS Field app"); doc.setCreator("ENVSS Field app");
    if (meta.date) { doc.setCreationDate(meta.date); doc.setModificationDate(meta.date); }
    const embedded = {};
    for (const pg of layout.pages) {
      const page = doc.addPage([pg.w, pg.h]);
      for (const o of pg.ops) {
        if (o.k === "t") {
          const s = o.s.replace(WINANSI, "?"), f = fonts[(o.b ? "b" : "") + (o.i ? "i" : "") || "r"] || fonts.r; let x = o.x;
          const w = f.widthOfTextAtSize(s, o.z); if (o.a === "c") x -= w / 2; else if (o.a === "r") x -= w;
          page.drawText(s, { x, y: pg.h - o.y, size: o.z, font: f, color: rgb(o.c) });
        } else if (o.k === "r") {
          page.drawRectangle({ x: o.x, y: pg.h - o.y - o.h, width: o.w, height: o.h, color: o.f ? rgb(o.f) : undefined, borderColor: o.s ? rgb(o.c) : undefined, borderWidth: o.s || 0 });
        } else if (o.k === "l") {
          page.drawLine({ start: { x: o.x1, y: pg.h - o.y1 }, end: { x: o.x2, y: pg.h - o.y2 }, thickness: o.w, color: rgb(o.c) });
        } else if (o.k === "i") {
          if (!embedded[o.key]) embedded[o.key] = /jp/i.test(o.ext) ? await doc.embedJpg(o.bytes) : await doc.embedPng(o.bytes);
          page.drawImage(embedded[o.key], { x: o.x, y: pg.h - o.y - o.h, width: o.w, height: o.h });
        }
      }
    }
    return doc.save();
  }
  /* images: {key: CanvasImageSource} preloaded by the caller (createImageBitmap) */
  function drawCanvas(ctx, pg, scale, images) {
    scale = scale || 1;
    ctx.save(); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, pg.w * scale, pg.h * scale);
    const css = c => "rgb(" + Math.round(c[0] * 255) + "," + Math.round(c[1] * 255) + "," + Math.round(c[2] * 255) + ")";
    pg.ops.forEach(o => {
      if (o.k === "t") { ctx.font = (o.i ? "italic " : "") + (o.b ? "bold " : "") + (o.z * scale) + 'px Helvetica, Arial, "Liberation Sans", sans-serif'; ctx.fillStyle = css(o.c); ctx.textAlign = o.a === "c" ? "center" : o.a === "r" ? "right" : "left"; ctx.textBaseline = "alphabetic"; ctx.fillText(o.s, o.x * scale, o.y * scale); }
      else if (o.k === "r") { if (o.f) { ctx.fillStyle = css(o.f); ctx.fillRect(o.x * scale, o.y * scale, o.w * scale, o.h * scale); } if (o.s) { ctx.lineWidth = o.s * scale; ctx.strokeStyle = css(o.c); ctx.strokeRect(o.x * scale, o.y * scale, o.w * scale, o.h * scale); } }
      else if (o.k === "l") { ctx.lineWidth = o.w * scale; ctx.strokeStyle = css(o.c); ctx.beginPath(); ctx.moveTo(o.x1 * scale, o.y1 * scale); ctx.lineTo(o.x2 * scale, o.y2 * scale); ctx.stroke(); }
      else if (o.k === "i" && images && images[o.key]) ctx.drawImage(images[o.key], o.x * scale, o.y * scale, o.w * scale, o.h * scale);
    });
    ctx.restore();
  }

  const TAT_LABEL = { standard: "Standard", same_day: "Same Day", "1_day": "1 day", "2_day": "2 day", "3_day": "3 day" };

  /* ---------- emails ---------- */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
  function buildEmail(model, conf) {
    const k = conf || cfg(), n = model.samples.length;
    const subject = "ENVSS chain of custody " + model.eventCode + " (" + n + " sample" + (n === 1 ? "" : "s") + ")" + (model.resendOf ? " AMENDED" : "");
    const lines = [
      "Hello,", "",
      model.resendOf ? "This is an AMENDED chain of custody. It replaces the one we sent earlier for this event. Please use this one." : "Please find our chain of custody (Form 302) attached.", "",
      "Job number: " + model.job, "Event: " + model.eventCode, "Samples: " + n, "Turnaround: " + (TAT_LABEL[model.turnaround] || "Standard"), "",
      "Results required in ESDAT format.", "Email results and reports to " + model.resultsTo + ". Invoices to " + model.invoiceTo + ".", "",
      "Sample collection requested", "  Day:   " + dayLabel(model.collection.date) + " (" + dmy(model.collection.date) + ")", "  Time:  " + timeLabel(model.collection), "  Where: " + model.collection.location, "",
      "Attached: " + model.attachmentNames.join(", ") + ".", "",
      "Questions: ENVSS office, " + model.officePhone + ", or reply to " + k.replyTo + ".", "", "Thank you,", "ENVSS"
    ];
    const text = lines.join("\n");
    const html = "<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111\">"
      + "<p>Hello,</p><p>" + (model.resendOf ? "<b>This is an AMENDED chain of custody.</b> It replaces the one we sent earlier for this event. Please use this one." : "Please find our chain of custody (Form 302) attached.") + "</p>"
      + "<table style=\"border-collapse:collapse\"><tr><td><b>Job number</b></td><td style=\"padding-left:12px\">" + esc(model.job) + "</td></tr><tr><td><b>Event</b></td><td style=\"padding-left:12px\">" + esc(model.eventCode) + "</td></tr><tr><td><b>Samples</b></td><td style=\"padding-left:12px\">" + n + "</td></tr><tr><td><b>Turnaround</b></td><td style=\"padding-left:12px\">" + esc(TAT_LABEL[model.turnaround] || "Standard") + "</td></tr></table>"
      + "<p><b>Results required in ESDAT format.</b><br>Email results and reports to " + esc(model.resultsTo) + ". Invoices to " + esc(model.invoiceTo) + ".</p>"
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
    const html = "<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111\"><div style=\"border:2px solid #333;padding:10px;margin-bottom:12px\"><b>TECH FLAG: SOMETHING LOOKS WRONG</b><br>Raised by " + esc(a.techUser || "unknown") + (a.flag && a.flag.manual ? " (by hand from the CoC preview)" : " (after the app's checks failed)") + "<br><br><b>Tech's comment</b><br>" + esc(cm).replace(/\n/g, "<br>") + "</div><pre style=\"white-space:pre-wrap;font-family:Consolas,monospace;font-size:12px\">" + esc(text.split("\n").slice(L.indexOf("JOB / EVENT")).join("\n")) + "</pre></div>";
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

  const api = { VERSION, DEFAULTS, cfg, pad2, num, round1, perthParts, perthDay, perthStamp, dmy, weekdayOf, dayLabel, hm12, timeLabel, phoneDigits, recompute, validateCollection, canonical, contentHash, privacyLint, runChecks, layoutSheet, drawPdf, drawCanvas, buildEmail, buildAlert, csvOf, sendState, TAT_LABEL, wrap, tw, PAGE };
  root.ENVSS_COC = api;
  if (!root.ENVSS_COC_SEND_CONFIG) root.ENVSS_COC_SEND_CONFIG = cfg();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

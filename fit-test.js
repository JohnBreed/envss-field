/* ENVSS Field v48.9: Respirator fit testing.
   Event type "fit", codes {job}-FIT-{seq}. Photo + optional Google Vision OCR, confirm,
   two signatures, A4 PDF (form + signatures + original photo), Drive copy into
   {job}_Field-App/Fit Test, zip download. No Podio writes. */
(function (root) {
  "use strict";
  const VERSION = "48.9";
  const PDF_SRC = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js";
  const ZIP_SRC = "https://cdn.jsdelivr.net/npm/jszip@3.10.2/dist/jszip.min.js";
  const OCR_FN = "ocr-fit-report";
  const LABEL_ROWS = [
    ["ID NUMBER", "idNumber"],
    ["LAST NAME", "lastName"],
    ["FIRST NAME", "firstName"],
    ["COMPANY", "company"],
    ["LOCATION", "location"],
    ["TEST DATE", "testDateRaw"],
    ["DUE DATE", "dueDateRaw"],
    ["PORTACOUNT S/N", "portaCountSn"],
    ["PORTACOUNT SN", "portaCountSn"],
    ["N95-COMPANION", "n95Companion"],
    ["N95 COMPANION", "n95Companion"],
    ["RESPIRATOR STYLE", "respiratorStyle"],
    ["RESPIRATOR SIZE", "respiratorSize"],
    ["MANUFACTURER", "manufacturer"],
    ["MODEL", "model"],
    ["PROTOCOL", "protocol"],
    ["PASS LEVEL", "passLevelRaw"],
    ["APPROVAL", "approval"],
    ["EFFICIENCY<99%", "efficiency"],
    ["EFFICIENCY <99%", "efficiency"],
    ["OVERALL FF", "overallFfRaw"],
    ["FITTEST OPERATOR", "operator"],
    ["FIT TEST OPERATOR", "operator"],
    ["RESPIRATOR", "respirator"],
    ["NOTE", "note"]
  ];

  function pad(n) { return String(n).padStart(2, "0"); }
  function trim(s) { return String(s == null ? "" : s).trim(); }
  function esc(s) { return typeof root.esc === "function" ? root.esc(s) : String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  function isFitEvent(ev) {
    return !!(ev && (ev.type === "fit" || /-FIT-\d+/i.test(String(ev.code || ""))));
  }
  function fitSeqOf(code) {
    const m = String(code || "").match(/-FIT-(\d+)/i);
    return m ? m[1] : "";
  }
  function nextFitSeq(projectId, events, deletions) {
    const evs = events || (typeof db !== "undefined" && db && db.events) || [];
    const dels = deletions || (typeof db !== "undefined" && db && db.deletions) || [];
    const codes = evs.filter(e => e.projectId === projectId && isFitEvent(e)).map(e => e.code)
      .concat(dels.filter(d => d && d.tombstone === "event" && d.projectId === projectId && (d.type === "fit" || /-FIT-\d+/i.test(String(d.code || "")))).map(d => d.code));
    const max = codes.map(c => parseInt(fitSeqOf(c), 10) || 0).reduce((a, b) => Math.max(a, b), 0);
    return String(max + 1).padStart(3, "0");
  }
  function fitEventCode(project, seq) {
    const num = (project && project.number) || "";
    return num + "-FIT-" + seq;
  }

  function safeToken(s, fallback) {
    const t = trim(s).replace(/[^\w]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    return t || fallback || "Unknown";
  }
  function fileNameFor(rep) {
    const d = (rep && rep.testDate) || parseTsiDate(rep && rep.testDateRaw);
    const datePart = (d && d.displayDashed) || "undated";
    const sur = safeToken(rep && (rep.lastName || (rep.person && rep.person.last)), "Surname");
    const first = safeToken(rep && (rep.firstName || (rep.person && rep.person.first)), "First");
    const model = safeToken(rep && (rep.model || rep.respirator), "Respirator");
    return sur + "_" + first + "_" + model + "_" + datePart + ".pdf";
  }

  function parseTsiDate(raw) {
    const out = { raw: trim(raw), iso: "", display: "", displayDashed: "", time: "", flag: "", year: 0, month: 0, day: 0 };
    if (!out.raw) { out.flag = "missing"; return out; }
    const m = out.raw.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (!m) { out.flag = "unparsed"; return out; }
    let a = +m[1], b = +m[2], y = +m[3];
    if (y < 100) y += 2000;
    let day, month, flag = "";
    if (a > 12 && b >= 1 && b <= 12) { day = a; month = b; }
    else if (b > 12 && a >= 1 && a <= 12) { day = b; month = a; flag = "us"; }
    else if (a >= 1 && a <= 12 && b >= 1 && b <= 12) { day = a; month = b; flag = "ambiguous"; }
    else { out.flag = "unparsed"; return out; }
    out.year = y; out.month = month; out.day = day; out.flag = flag;
    out.iso = y + "-" + pad(month) + "-" + pad(day);
    out.display = pad(day) + "/" + pad(month) + "/" + y;
    out.displayDashed = pad(day) + "-" + pad(month) + "-" + y;
    if (m[4] != null) out.time = pad(m[4]) + ":" + m[5];
    return out;
  }

  function parseFf(s) {
    const raw = trim(s);
    if (!raw) return { raw: "", value: null, plus: false };
    const plus = /\+$/.test(raw);
    const n = parseFloat(raw.replace(/,/g, "").replace(/\+$/, ""));
    return { raw, value: Number.isFinite(n) ? n : null, plus };
  }
  function ffMeets(ff, level) {
    if (!ff || ff.value == null || level == null || !Number.isFinite(level)) return null;
    return ff.value >= level;
  }
  function parseYesNo(s) {
    const t = trim(s).toLowerCase();
    if (/^(yes|y|pass|true)$/.test(t)) return "yes";
    if (/^(no|n|fail|false)$/.test(t)) return "no";
    return "";
  }
  function labelKey(line) {
    const u = line.toUpperCase().replace(/\s+/g, " ").trim();
    let best = null, bestLen = 0;
    LABEL_ROWS.forEach(function (pair) {
      const lab = pair[0];
      if (u === lab || u.indexOf(lab + " ") === 0 || u.indexOf(lab + ":") === 0) {
        if (lab.length > bestLen) { best = pair; bestLen = lab.length; }
      }
    });
    return best;
  }
  function valueAfter(line, lab) {
    const re = new RegExp("^" + lab.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[:#]?", "i");
    return trim(line.replace(re, ""));
  }

  function parseExercises(lines, startAt) {
    const rows = [];
    let i = startAt;
    for (; i < lines.length; i++) {
      const u = lines[i].toUpperCase().replace(/\s+/g, " ");
      if (/^OVERALL\s*FF/.test(u) || /^FITTEST\s*OPERATOR/.test(u) || /^FIT TEST OPERATOR/.test(u)) break;
      if (/^EXERCISE\b/.test(u) && /FIT FACTOR/.test(u)) continue;
      const m = lines[i].match(/^(.+?)\s+(\d+\s*s?)\s+(\d[\d.+]*)\s+(Yes|No|PASS|FAIL|Y|N)\s*$/i);
      if (m) {
        rows.push({ exercise: trim(m[1]), duration: trim(m[2]), fitFactorRaw: trim(m[3]), passRaw: trim(m[4]), fitFactor: parseFf(m[3]), pass: parseYesNo(m[4]) });
        continue;
      }
      const m2 = lines[i].match(/^(.+?)\s+(\d[\d.+]*)\s+(Yes|No|PASS|FAIL|Y|N)\s*$/i);
      if (m2 && !labelKey(lines[i])) {
        rows.push({ exercise: trim(m2[1]), duration: "", fitFactorRaw: trim(m2[2]), passRaw: trim(m2[3]), fitFactor: parseFf(m2[2]), pass: parseYesNo(m2[3]) });
      }
    }
    return { rows, next: i };
  }

  function parseReport(text, extras) {
    extras = extras || {};
    const raw = String(text || "").replace(/\r/g, "");
    const lines = raw.split(/\n+/).map(l => l.replace(/[ \t]+/g, " ").trim()).filter(Boolean);
    const fields = {};
    const missing = [];
    const flags = [];
    const header = lines.find(l => /FIT\s*TEST\s*REPORT/i.test(l)) || "";
    const headerDate = header.replace(/.*FIT\s*TEST\s*REPORT/i, "").trim();
    if (headerDate) fields.headerDateRaw = headerDate;

    for (let i = 0; i < lines.length; i++) {
      const u = lines[i].toUpperCase();
      if (/^EXERCISE\b/.test(u) && /FIT FACTOR/.test(u)) {
        const ex = parseExercises(lines, i + 1);
        fields.exercises = ex.rows;
        i = ex.next - 1;
        continue;
      }
      const pair = labelKey(lines[i]);
      if (!pair) continue;
      let val = valueAfter(lines[i], pair[0]);
      while (i + 1 < lines.length && !labelKey(lines[i + 1]) && !/^EXERCISE\b/.test(lines[i + 1].toUpperCase()) && !/^FIT\s*TEST\s*REPORT/i.test(lines[i + 1])) {
        const nxt = lines[i + 1];
        if (/^NAME\b/i.test(nxt) && pair[1] === "operator") { fields.operatorName = valueAfter(nxt, "NAME"); i++; break; }
        if (val && nxt.length < 80) val = trim(val + " " + nxt);
        else if (!val) val = nxt;
        i++;
      }
      if (pair[1] === "operator") {
        fields.operator = val;
        const nm = lines[i + 1] && /^NAME\b/i.test(lines[i + 1]) ? valueAfter(lines[i + 1], "NAME") : "";
        if (nm) { fields.operatorName = nm; i++; }
        continue;
      }
      if (!fields[pair[1]]) fields[pair[1]] = val;
    }

    const testDate = parseTsiDate(fields.testDateRaw || fields.headerDateRaw || "");
    const dueDate = parseTsiDate(fields.dueDateRaw || "");
    fields.testDate = testDate;
    fields.dueDate = dueDate;
    if (testDate.time) fields.testTime = testDate.time;
    else {
      const tm = String(fields.testDateRaw || "").match(/\b(\d{1,2}:\d{2})\b/);
      if (tm) fields.testTime = tm[1].length === 4 ? "0" + tm[1] : tm[1];
    }
    if (testDate.flag === "us") flags.push({ field: "testDate", reason: "Date looks like US MM/DD/YYYY; stored as " + testDate.display + ". Check this." });
    if (testDate.flag === "ambiguous") flags.push({ field: "testDate", reason: "Date could be DD/MM or MM/DD. Treated as DD/MM/YYYY (" + testDate.display + "). Check this." });
    if (testDate.flag === "unparsed" && fields.testDateRaw) flags.push({ field: "testDate", reason: "Could not read the test date." });
    if (dueDate.flag === "us") flags.push({ field: "dueDate", reason: "Due date looks like US MM/DD/YYYY; stored as " + dueDate.display + ". Check this." });
    if (dueDate.flag === "ambiguous") flags.push({ field: "dueDate", reason: "Due date could be DD/MM or MM/DD. Treated as DD/MM/YYYY (" + dueDate.display + ")." });

    const passLevel = parseFloat(String(fields.passLevelRaw || "").replace(/[^\d.]/g, ""));
    fields.passLevel = Number.isFinite(passLevel) ? passLevel : null;
    const overallTrail = String(fields.overallFfRaw || "").match(/^(.*?)(?:\s+(Yes|No|PASS|FAIL))?\s*$/i);
    if (overallTrail) fields.overallFfRaw = (overallTrail[1] || "").trim();
    const overallFf = parseFf(fields.overallFfRaw);
    fields.overallFf = overallFf;
    const overallByLevel = ffMeets(overallFf, fields.passLevel);
    const overallWord = parseYesNo((fields.overallFfRaw || "").split(/\s+/).slice(-1)[0]);
    // If the raw is "200+ Yes", overallWord may be Yes — also try a trailing word.
    const trail = String(fields.overallFfRaw || "").match(/\s+(Yes|No|PASS|FAIL)\s*$/i);
    const overallYn = trail ? parseYesNo(trail[1]) : overallWord;
    fields.exercises = fields.exercises || [];
    fields.exercises.forEach(function (ex) {
      const byLevel = ffMeets(ex.fitFactor, fields.passLevel);
      if (!ex.pass && byLevel === false) ex.pass = "no";
      if (!ex.pass && byLevel === true) ex.pass = "yes";
      ex.fail = ex.pass === "no" || byLevel === false;
    });
    const exerciseFails = fields.exercises.filter(ex => ex.fail);
    fields.exerciseFails = exerciseFails.map(ex => ex.exercise);
    let overallPass = overallByLevel;
    if (overallPass == null && overallYn) overallPass = overallYn === "yes";
    fields.overallPass = overallPass;
    fields.result = overallPass === true ? "PASS" : overallPass === false ? "FAIL" : "";
    if (exerciseFails.length && fields.result === "PASS") {
      flags.push({ field: "result", reason: "Overall is a pass, but " + exerciseFails.length + " exercise" + (exerciseFails.length === 1 ? "" : "s") + " failed: " + fields.exerciseFails.join(", ") + "." });
    }
    if (exerciseFails.length && fields.result === "FAIL") {
      flags.push({ field: "result", reason: "Overall is a fail. Failed exercise" + (exerciseFails.length === 1 ? "" : "s") + ": " + fields.exerciseFails.join(", ") + "." });
    }

    const required = [
      ["lastName", "Last name"],
      ["firstName", "First name"],
      ["testDateRaw", "Test date"],
      ["model", "Respirator model"]
    ];
    required.forEach(function (r) {
      if (!trim(fields[r[0]]) && !(r[0] === "model" && trim(fields.respirator))) missing.push(r[1]);
    });
    if (!fields.result) missing.push("Pass/fail");

    const low = (extras.lowFields || []).slice();
    flags.forEach(f => { if (low.indexOf(f.field) < 0) low.push(f.field); });
    missing.forEach(function (label) {
      const map = { "Last name": "lastName", "First name": "firstName", "Test date": "testDate", "Respirator model": "model", "Pass/fail": "result" };
      if (map[label] && low.indexOf(map[label]) < 0) low.push(map[label]);
    });

    return {
      fields, missing, flags, low,
      rawText: raw,
      confidence: extras.confidence == null ? null : extras.confidence
    };
  }

  const api = {
    version: VERSION, isFitEvent, fitSeqOf, nextFitSeq, fitEventCode, fileNameFor,
    parseReport, parseTsiDate, parseFf, ffMeets, safeToken, parseYesNo
  };
  root.envssFit = api;

  if (typeof document === "undefined") return;

  /* ---------- live app wiring ---------- */
  const PDF_LIB = PDF_SRC, ZIP_LIB = ZIP_SRC;

  function gdb() { return db; }
  function reportsOf(eventId) {
    return ((typeof db !== "undefined" && db && db.fitReports) || []).filter(r => r && r.eventId === eventId);
  }
  function reportById(id) { return ((typeof db !== "undefined" && db && db.fitReports) || []).find(r => r && r.id === id) || null; }
  function evLog(ev, action, detail) {
    if (!ev) return;
    ev.audit = ev.audit || [];
    ev.audit.push({ at: (root.nowIso && root.nowIso()) || new Date().toISOString(), who: (root.whoText && root.whoText()) || "", action, detail: detail || "" });
  }
  function uid(p) { return (root.uid && root.uid(p)) || (p || "fr") + "_" + Math.random().toString(36).slice(2, 10); }
  function save() { if (typeof root.save === "function") root.save(); else if (typeof root.saveQuiet === "function") root.saveQuiet(); }
  function saveQuiet() { if (typeof root.saveQuiet === "function") root.saveQuiet(); else save(); }

  function installSync() {
    try {
      if (typeof COLLS !== "undefined" && COLLS.indexOf("fitReports") < 0) COLLS.push("fitReports");
      if (typeof TABLE !== "undefined") TABLE.fitReports = "envss_fit_reports";
      if (typeof DEFAULT !== "undefined" && !Array.isArray(DEFAULT.fitReports)) DEFAULT.fitReports = [];
      if (typeof db !== "undefined" && db && !Array.isArray(db.fitReports)) db.fitReports = [];
      if (typeof syncState !== "undefined" && syncState.hash && !syncState.hash.fitReports) syncState.hash.fitReports = {};
    } catch (e) { console.warn("[ENVSS] fit sync init", e); }
    if (typeof root.baseLoad === "function") {
      const _bl = root.baseLoad;
      root.baseLoad = function (d) {
        const out = _bl.apply(this, arguments);
        if (out && !Array.isArray(out.fitReports)) out.fitReports = [];
        return out;
      };
      root.baseLoad = root.baseLoad;
    }
    if (typeof root.pullActivity === "function") {
      const _pa = root.pullActivity;
      root.pullActivity = async function () {
        const r = await _pa.apply(this, arguments);
        try {
          if (root.sbGet && root.mergeRemote && root.sbCfg && root.sbCfg()) {
            try {
              const rows = await root.sbGet("envss_fit_reports");
              const h = root.mergeRemote("fitReports", rows);
              if (root.syncState) root.syncState.fitReportsAt = new Date().toISOString();
              if (h && h.changed && typeof root.render === "function" && !(root.userIsTyping && root.userIsTyping())) root.render();
            } catch (he) {
              if (root.syncState) root.syncState.fitReportsError = String(he && he.message || he);
            }
          }
        } catch (e) { console.warn("[ENVSS] fit pull", e); }
        return r;
      };
      root.pullActivity = root.pullActivity;
    }
    if (typeof root.sendOne === "function") {
      const _so = root.sendOne;
      root.sendOne = async function (p) {
        if (p && p.coll === "fitReports") {
          /* fall through to original after ensuring denormalised columns via a lightweight wrap */
        }
        const orig = root.sbUpsert;
        if (p && p.coll === "fitReports" && typeof orig === "function") {
          root.sbUpsert = async function (table, row) {
            if (table === "envss_fit_reports") {
              const rec = (root.findRec && root.findRec("fitReports", p.id)) || reportById(p.id) || {};
              row.event_id = rec.eventId || rec.event_id || "";
              row.project_id = rec.projectId || rec.project_id || "";
            }
            return orig.apply(this, arguments);
          };
          try { return await _so.apply(this, arguments); }
          finally { root.sbUpsert = orig; }
        }
        return _so.apply(this, arguments);
      };
      root.sendOne = root.sendOne;
    }
  }

  function parentOptions(ev) {
    const evs = (typeof db !== "undefined" && db && db.events) || [];
    return evs.filter(e => e && e.projectId === ev.projectId && e.id !== ev.id && !isFitEvent(e) && !(root.isFibreEvent && root.isFibreEvent(e)))
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }

  function stageOf(ev) {
    if (!isFitEvent(ev)) return null;
    const reps = reportsOf(ev.id);
    if (!reps.length) return ev.uploadReady ? "upload_ready" : "planned";
    const allSigned = reps.every(r => !!(r.signedAt || (r.sigTech && r.sigClient)));
    if (allSigned && ev.uploadReady) return "upload_ready";
    if (allSigned) return "ev_complete";
    return "ev_needs";
  }

  function blankReport(ev) {
    return {
      id: uid("fr"),
      eventId: ev.id,
      projectId: ev.projectId,
      eventCode: ev.code,
      idNumber: "", lastName: "", firstName: "", company: "", location: "",
      testDateRaw: "", testDateDisplay: "", testTime: "", dueDateRaw: "", dueDateDisplay: "",
      dateFlag: "",
      portaCountSn: "", n95Companion: "", respirator: "", manufacturer: "", model: "",
      respiratorStyle: "", respiratorSize: "", protocol: "", passLevel: "", approval: "", efficiency: "",
      exercises: [], overallFf: "", overallPass: null, result: "", operator: "", operatorName: "", note: "",
      exerciseFails: [],
      flags: [], missing: [], low: [],
      photo: "", photoDataUrl: "",
      sigTech: "", sigClient: "", signedAt: "",
      pdfName: "", ocrStatus: "", ocrMessage: "",
      audit: [],
      updatedAt: new Date().toISOString()
    };
  }

  function applyParsed(rep, parsed) {
    const f = (parsed && parsed.fields) || {};
    rep.idNumber = f.idNumber || "";
    rep.lastName = f.lastName || "";
    rep.firstName = f.firstName || "";
    rep.company = f.company || "";
    rep.location = f.location || "";
    rep.testDateRaw = (f.testDate && f.testDate.raw) || f.testDateRaw || "";
    rep.testDateDisplay = (f.testDate && f.testDate.display) || "";
    rep.testTime = f.testTime || (f.testDate && f.testDate.time) || "";
    rep.dueDateRaw = (f.dueDate && f.dueDate.raw) || f.dueDateRaw || "";
    rep.dueDateDisplay = (f.dueDate && f.dueDate.display) || "";
    rep.dateFlag = (f.testDate && f.testDate.flag) || "";
    rep.testDate = f.testDate || parseTsiDate(rep.testDateRaw);
    rep.dueDate = f.dueDate || parseTsiDate(rep.dueDateRaw);
    rep.portaCountSn = f.portaCountSn || "";
    rep.n95Companion = f.n95Companion || "";
    rep.respirator = f.respirator || "";
    rep.manufacturer = f.manufacturer || "";
    rep.model = f.model || "";
    rep.respiratorStyle = f.respiratorStyle || "";
    rep.respiratorSize = f.respiratorSize || "";
    rep.protocol = f.protocol || "";
    rep.passLevel = f.passLevel != null ? String(f.passLevel) : (f.passLevelRaw || "");
    rep.approval = f.approval || "";
    rep.efficiency = f.efficiency || "";
    rep.exercises = f.exercises || [];
    rep.overallFf = (f.overallFf && f.overallFf.raw) || f.overallFfRaw || "";
    rep.overallPass = f.overallPass;
    rep.result = f.result || "";
    rep.operator = f.operator || "";
    rep.operatorName = f.operatorName || "";
    rep.note = f.note || "";
    rep.exerciseFails = f.exerciseFails || [];
    rep.flags = parsed.flags || [];
    rep.missing = parsed.missing || [];
    rep.low = parsed.low || [];
    return rep;
  }

  function collectForm(rep) {
    const g = id => (document.getElementById(id) || {}).value || "";
    rep.idNumber = trim(g("fitIdNumber"));
    rep.lastName = trim(g("fitLast"));
    rep.firstName = trim(g("fitFirst"));
    rep.company = trim(g("fitCompany"));
    rep.location = trim(g("fitLocation"));
    rep.testDateDisplay = trim(g("fitTestDate"));
    rep.testDateRaw = rep.testDateDisplay || rep.testDateRaw;
    rep.testDate = parseTsiDate(rep.testDateDisplay || rep.testDateRaw);
    if (rep.testDate.flag === "us" || rep.testDate.flag === "ambiguous") rep.dateFlag = rep.testDate.flag;
    else if (rep.testDate.display) { rep.testDateDisplay = rep.testDate.display; rep.dateFlag = rep.testDate.flag; }
    rep.testTime = trim(g("fitTestTime"));
    rep.dueDateDisplay = trim(g("fitDueDate"));
    rep.dueDateRaw = rep.dueDateDisplay || rep.dueDateRaw;
    rep.dueDate = parseTsiDate(rep.dueDateDisplay || rep.dueDateRaw);
    rep.portaCountSn = trim(g("fitPorta"));
    rep.n95Companion = trim(g("fitN95"));
    rep.respirator = trim(g("fitRespirator"));
    rep.manufacturer = trim(g("fitMfr"));
    rep.model = trim(g("fitModel"));
    rep.respiratorStyle = trim(g("fitStyle"));
    rep.respiratorSize = trim(g("fitSize"));
    rep.protocol = trim(g("fitProtocol"));
    rep.passLevel = trim(g("fitPassLevel"));
    rep.approval = trim(g("fitApproval"));
    rep.efficiency = trim(g("fitEfficiency"));
    rep.overallFf = trim(g("fitOverallFf"));
    rep.result = trim(g("fitResult"));
    rep.operator = trim(g("fitOperator"));
    rep.operatorName = trim(g("fitOperatorName"));
    rep.note = trim(g("fitNote"));
    const pl = parseFloat(rep.passLevel);
    const of = parseFf(rep.overallFf);
    if (rep.result !== "PASS" && rep.result !== "FAIL") {
      const meet = ffMeets(of, pl);
      if (meet === true) rep.result = "PASS";
      else if (meet === false) rep.result = "FAIL";
    }
    rep.overallPass = rep.result === "PASS";
    const ex = [];
    document.querySelectorAll("[data-fit-ex]").forEach(row => {
      const i = row.getAttribute("data-fit-ex");
      ex.push({
        exercise: trim((document.getElementById("fitExN" + i) || {}).value),
        duration: trim((document.getElementById("fitExD" + i) || {}).value),
        fitFactorRaw: trim((document.getElementById("fitExF" + i) || {}).value),
        pass: parseYesNo((document.getElementById("fitExP" + i) || {}).value),
        fitFactor: parseFf((document.getElementById("fitExF" + i) || {}).value)
      });
    });
    if (ex.length) {
      const level = parseFloat(rep.passLevel);
      ex.forEach(r => { r.fail = r.pass === "no" || ffMeets(r.fitFactor, level) === false; });
      rep.exercises = ex;
      rep.exerciseFails = ex.filter(r => r.fail).map(r => r.exercise);
    }
    return rep;
  }

  function lowClass(rep, field) {
    return (rep.low || []).indexOf(field) >= 0 || (rep.missing || []).indexOf(field) >= 0 ? " fit-low" : "";
  }

  function photoSrc(rep) {
    if (rep.photoDataUrl && String(rep.photoDataUrl).indexOf("data:") === 0) return rep.photoDataUrl;
    if (rep.photo && String(rep.photo).indexOf("data:") === 0) return rep.photo;
    return "";
  }

  function confirmHtml(rep, ev) {
    const psrc = photoSrc(rep);
    const flags = (rep.flags || []).map(f => "<li>" + esc(f.reason) + "</li>").join("");
    const msg = rep.ocrMessage ? "<p class=\"help\" id=\"fitOcrMsg\">" + esc(rep.ocrMessage) + "</p>" : "";
    const fails = (rep.exerciseFails || []).length
      ? "<p class=\"fit-warn\">Exercise fail" + (rep.exerciseFails.length === 1 ? "" : "s") + ": " + esc(rep.exerciseFails.join(", ")) + "</p>"
      : "";
    const exRows = (rep.exercises && rep.exercises.length ? rep.exercises : [{ exercise: "", duration: "", fitFactorRaw: "", pass: "" }]).map((ex, i) => {
      return "<tr data-fit-ex=\"" + i + "\"><td><input id=\"fitExN" + i + "\" value=\"" + esc(ex.exercise || "") + "\"></td>"
        + "<td><input id=\"fitExD" + i + "\" value=\"" + esc(ex.duration || "") + "\"></td>"
        + "<td><input id=\"fitExF" + i + "\" value=\"" + esc(ex.fitFactorRaw || (ex.fitFactor && ex.fitFactor.raw) || "") + "\"></td>"
        + "<td><select id=\"fitExP" + i + "\"><option value=\"\"></option>"
        + "<option value=\"yes\"" + (ex.pass === "yes" ? " selected" : "") + ">Pass</option>"
        + "<option value=\"no\"" + (ex.pass === "no" ? " selected" : "") + ">Fail</option></select></td></tr>";
    }).join("");
    const inp = (id, field, label, val, extra) =>
      "<label class=\"" + lowClass(rep, field) + "\">" + esc(label) + "<input id=\"" + id + "\" value=\"" + esc(val || "") + "\" " + (extra || "") + "></label>";
    return "<div class=\"wrap fit-screen\" id=\"fitConfirm\">"
      + "<button class=\"btn ghost back-ctl\" id=\"fitBackEvent\">← " + esc(ev.code) + "</button>"
      + "<h2 class=\"brand-type\" style=\"color:var(--navy)\">Confirm fit-test report</h2>"
      + "<p class=\"help\">Check every field against the photo before you sign. Nothing is signed automatically.</p>"
      + msg
      + (flags ? "<ul class=\"fit-flags\">" + flags + "</ul>" : "")
      + fails
      + "<div class=\"fit-grid\">"
      + "<div class=\"fit-photo-col\"><div class=\"card\">"
      + (psrc ? "<img id=\"fitPhotoImg\" alt=\"Fit-test report photo\" src=\"" + psrc + "\">" : "<p class=\"help\">No photo attached.</p>")
      + "<div class=\"row\" style=\"margin-top:8px\"><button type=\"button\" class=\"btn mid\" id=\"fitRetake\">Retake photo</button>"
      + "<input id=\"fitPhotoInput\" type=\"file\" accept=\"image/*\" capture=\"environment\" hidden></div>"
      + "</div></div>"
      + "<div class=\"fit-fields card\">"
      + inp("fitIdNumber", "idNumber", "ID number", rep.idNumber)
      + inp("fitLast", "lastName", "Last name", rep.lastName)
      + inp("fitFirst", "firstName", "First name", rep.firstName)
      + inp("fitCompany", "company", "Company", rep.company)
      + inp("fitLocation", "location", "Location", rep.location)
      + inp("fitTestDate", "testDate", "Test date (DD/MM/YYYY)", rep.testDateDisplay || (rep.testDate && rep.testDate.display) || "")
      + inp("fitTestTime", "testTime", "Test time", rep.testTime)
      + inp("fitDueDate", "dueDate", "Due date (DD/MM/YYYY)", rep.dueDateDisplay || (rep.dueDate && rep.dueDate.display) || "")
      + inp("fitPorta", "portaCountSn", "PortaCount S/N", rep.portaCountSn)
      + inp("fitN95", "n95Companion", "N95-Companion", rep.n95Companion)
      + "<label class=\"" + lowClass(rep, "respirator") + "\">Respirator<textarea id=\"fitRespirator\" rows=\"2\">" + esc(rep.respirator || "") + "</textarea></label>"
      + inp("fitMfr", "manufacturer", "Manufacturer", rep.manufacturer)
      + inp("fitModel", "model", "Model", rep.model)
      + "<label>Respirator style<textarea id=\"fitStyle\" rows=\"2\">" + esc(rep.respiratorStyle || "") + "</textarea></label>"
      + inp("fitSize", "respiratorSize", "Respirator size", rep.respiratorSize)
      + inp("fitProtocol", "protocol", "Protocol", rep.protocol)
      + inp("fitPassLevel", "passLevel", "Pass level", rep.passLevel)
      + inp("fitApproval", "approval", "Approval", rep.approval)
      + inp("fitEfficiency", "efficiency", "Efficiency &lt;99%", rep.efficiency)
      + inp("fitOverallFf", "overallFf", "Overall fit factor", rep.overallFf)
      + "<label class=\"" + lowClass(rep, "result") + "\">Overall result<select id=\"fitResult\">"
      + "<option value=\"\"></option><option value=\"PASS\"" + (rep.result === "PASS" ? " selected" : "") + ">PASS</option>"
      + "<option value=\"FAIL\"" + (rep.result === "FAIL" ? " selected" : "") + ">FAIL</option></select></label>"
      + inp("fitOperator", "operator", "Fit-test operator", rep.operator)
      + inp("fitOperatorName", "operatorName", "Name on report", rep.operatorName)
      + "<label>Note<textarea id=\"fitNote\" rows=\"2\">" + esc(rep.note || "") + "</textarea></label>"
      + "<h3 class=\"brand-type\" style=\"margin-top:12px\">Exercises</h3>"
      + "<div class=\"fit-ex-wrap\"><table class=\"fit-ex\"><thead><tr><th>Exercise</th><th>Duration</th><th>Fit factor</th><th>Pass</th></tr></thead><tbody>"
      + exRows + "</tbody></table></div>"
      + "<button type=\"button\" class=\"btn ghost\" id=\"fitAddEx\">Add exercise</button>"
      + "</div></div>"
      + "<div class=\"footer-actions\">"
      + "<button type=\"button\" class=\"btn mid\" id=\"fitSaveDraft\">Save without signing</button>"
      + "<button type=\"button\" class=\"btn orange\" id=\"fitToSign\">Continue to signatures</button>"
      + "</div></div>";
  }

  function signHtml(rep, ev) {
    return "<div class=\"wrap fit-screen\" id=\"fitSign\">"
      + "<button class=\"btn ghost back-ctl\" id=\"fitBackConfirm\">← Back to details</button>"
      + "<h2 class=\"brand-type\" style=\"color:var(--navy)\">Sign fit-test report</h2>"
      + "<p class=\"help\">" + esc([rep.lastName, rep.firstName].filter(Boolean).join(", ") || "Unnamed") + " · " + esc(rep.model || rep.respirator || "") + " · " + esc(rep.result || "result not set") + "</p>"
      + "<p class=\"help\">The ENVSS technician signs first, then hand the phone to the client. Signatures are not filled in automatically.</p>"
      + "<div class=\"card\"><label>ENVSS technician</label><canvas id=\"fitSigTech\" class=\"fit-sig\" width=\"700\" height=\"220\"></canvas>"
      + "<button type=\"button\" class=\"btn ghost\" id=\"fitClearTech\">Clear</button></div>"
      + "<div class=\"card\"><label>Client</label><canvas id=\"fitSigClient\" class=\"fit-sig\" width=\"700\" height=\"220\"></canvas>"
      + "<button type=\"button\" class=\"btn ghost\" id=\"fitClearClient\">Clear</button></div>"
      + "<div class=\"footer-actions\"><button type=\"button\" class=\"btn orange\" id=\"fitMakePdf\">Save signed PDF</button></div>"
      + "</div>";
  }

  function eventFitHtml(ev) {
    const p = root.project && root.project(ev.projectId);
    const reps = reportsOf(ev.id);
    const parents = parentOptions(ev);
    const parentSel = "<label>Linked hygiene event (optional)<select id=\"fitParent\">"
      + "<option value=\"\">None</option>"
      + parents.map(e => "<option value=\"" + esc(e.id) + "\"" + (ev.parentEventId === e.id ? " selected" : "") + ">" + esc(e.code + (e.date ? " · " + e.date : "")) + "</option>").join("")
      + "</select></label>";
    const rows = reps.length ? reps.map(r => {
      const signed = !!(r.signedAt || (r.sigTech && r.sigClient));
      const who = [r.lastName, r.firstName].filter(Boolean).join(", ") || "Details not filled in";
      const res = r.result ? "<strong>" + esc(r.result) + "</strong>" : "No result yet";
      const fail = (r.exerciseFails || []).length ? " · exercise fail: " + esc(r.exerciseFails.join(", ")) : "";
      return "<div class=\"train\" data-fit-open=\"" + esc(r.id) + "\">"
        + "<div class=\"pouch\">" + (signed ? "✓" : "…") + "</div>"
        + "<div><div class=\"row-title\">" + esc(who) + " · " + esc(r.model || r.respirator || "Respirator not set") + "</div>"
        + "<div class=\"muted\">" + res + fail + (signed ? " · signed" : " · not signed") + (r.pdfName ? " · " + esc(r.pdfName) : "") + "</div></div>"
        + "<span class=\"badge " + (signed ? "s-ok" : "s-needs") + "\">" + (signed ? "Signed" : "In progress") + "</span></div>";
    }).join("") : "<div class=\"empty\">No fit-test reports yet. Add one from a PortaCount report photo, or enter the details by hand.</div>";
    const st = stageOf(ev);
    return "<div class=\"wrap\" id=\"fitEvent\">"
      + "<button class=\"btn ghost back-ctl\" onclick=\"openProject('" + ev.projectId + "')\">← Project events</button>"
      + "<div class=\"row\" style=\"margin-top:10px\"><div class=\"grow\">"
      + "<div class=\"muted\" onclick=\"openEditEvent('" + ev.id + "')\" style=\"cursor:pointer\">" + esc(p ? p.number + " · " + (p.name || "") : "") + " · tap to edit event</div>"
      + "<h2 class=\"brand-type\" style=\"margin:4px 0;color:var(--navy)\">" + esc(ev.code) + "</h2>"
      + "<div class=\"muted\">" + esc((root.eventTypeLabel && root.eventTypeLabel(ev)) || "Respirator fit testing") + (ev.date ? " · " + esc(ev.date) : "") + "</div>"
      + "</div>" + (root.eventBadge ? root.eventBadge(ev) : "") + "</div>"
      + "<div class=\"card\" style=\"margin-top:10px\">" + parentSel + "</div>"
      + "<div class=\"row\" style=\"margin:10px 0\">"
      + "<button type=\"button\" class=\"btn mid\" id=\"fitAddReport\">Add individual report</button>"
      + "<input id=\"fitNewPhoto\" type=\"file\" accept=\"image/*\" capture=\"environment\" hidden>"
      + "<button type=\"button\" class=\"btn mid\" id=\"fitAddManual\">Enter manually</button>"
      + "<button type=\"button\" class=\"btn green\" id=\"fitMarkComplete\">Mark event complete</button>"
      + (reps.some(r => r.signedAt || r.pdfBlob || r.pdfName) ? "<button type=\"button\" class=\"btn mid\" id=\"fitZip\">Download all (zip)</button>" : "")
      + "</div>"
      + rows
      + "<p class=\"help\">ENVSS Field v" + (root.APP_VERSION || VERSION) + " · Status follows signed reports, not samples. There is no laboratory COC for fit testing.</p>"
      + "</div>";
  }

  function wirePad(canvas, existing) {
    const ctx = canvas.getContext("2d");
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 700, h = canvas.clientHeight || 180;
    canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.strokeStyle = "#111";
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    if (existing) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, w, h); };
      img.src = existing;
    }
    let drawing = false, dirty = !!existing;
    function pos(ev) {
      const r = canvas.getBoundingClientRect();
      const t = ev.touches ? ev.touches[0] : ev;
      return { x: (t.clientX - r.left) * (w / r.width), y: (t.clientY - r.top) * (h / r.height) };
    }
    function start(ev) { ev.preventDefault(); drawing = true; dirty = true; const p = pos(ev); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
    function move(ev) { if (!drawing) return; ev.preventDefault(); const p = pos(ev); ctx.lineTo(p.x, p.y); ctx.stroke(); }
    function end(ev) { if (!drawing) return; ev.preventDefault(); drawing = false; }
    canvas.addEventListener("pointerdown", start);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointerleave", end);
    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end);
    return {
      clear: () => { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); dirty = false; },
      isDirty: () => dirty,
      toDataURL: () => canvas.toDataURL("image/png")
    };
  }

  function loadScript(src) {
    return new Promise(function (res, rej) {
      const ready = () => (src.indexOf("pdf-lib") >= 0 && (root.PDFLib || (typeof PDFLib !== "undefined" && PDFLib)))
        || (src.indexOf("jszip") >= 0 && (root.JSZip || (typeof JSZip !== "undefined" && JSZip)));
      if (ready()) return res();
      const existing = [...document.getElementsByTagName("script")].find(s => s.src === src || s.getAttribute("src") === src);
      if (existing && ready()) return res();
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => ready() || src ? res() : rej(new Error("Library loaded but the global was missing: " + src));
      s.onerror = () => rej(new Error("Could not load " + src));
      document.head.appendChild(s);
    });
  }

  function downscaleBlob(file, maxEdge, quality) {
    return new Promise(function (res, rej) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, (maxEdge || 1600) / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(b => res(b || file), "image/jpeg", quality == null ? 0.72 : quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); res(file); };
      img.src = url;
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  }
  function dataUrlToBase64(dataUrl) { return String(dataUrl || "").replace(/^data:[^;]+;base64,/, ""); }

  async function runOcr(rep, file) {
    rep.ocrStatus = "running";
    rep.ocrMessage = "Reading the photo…";
    try {
      const small = await downscaleBlob(file, 1600, 0.72);
      const dataUrl = await blobToDataUrl(small);
      const cfg = root.sbCfg && root.sbCfg();
      if (!cfg || !cfg.supabaseUrl) {
        rep.ocrStatus = "unavailable";
        rep.ocrMessage = "OCR not set up yet, enter manually";
        return;
      }
      const headers = (root.sbHeaders && root.sbHeaders()) || {};
      const res = await fetch(cfg.supabaseUrl + "/functions/v1/" + OCR_FN, {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, headers),
        body: JSON.stringify({ image: dataUrlToBase64(dataUrl), mime: "image/jpeg" })
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 503 || j.error === "OCR_NOT_CONFIGURED") {
        rep.ocrStatus = "not_configured";
        rep.ocrMessage = "OCR not set up yet, enter manually";
        return;
      }
      if (!res.ok) {
        rep.ocrStatus = "failed";
        rep.ocrMessage = j.message || "Could not read the photo. Enter the details manually, or retake it.";
        return;
      }
      const parsed = parseReport(j.text || "", { confidence: null });
      applyParsed(rep, parsed);
      rep.ocrText = j.text || "";
      rep.ocrStatus = "ok";
      rep.ocrMessage = parsed.missing.length || parsed.flags.length
        ? "Check the highlighted fields against the photo."
        : "Fields were filled from the photo. Please check them before signing.";
    } catch (e) {
      rep.ocrStatus = "failed";
      rep.ocrMessage = "Could not reach OCR (" + (e && e.message || e) + "). Enter the details manually, or try again when you are online.";
    }
  }

  async function attachPhoto(rep, ev, file) {
    const dataUrl = await blobToDataUrl(file);
    rep.photoDataUrl = dataUrl;
    try {
      if (root.envssPhotos && root.envssPhotos.attach) {
        const fakeTrain = { id: rep.id, eventId: ev.id, photoRefs: {} };
        const ref = await root.envssPhotos.attach(file, fakeTrain, "photo");
        rep.photo = ref;
        rep.photoRefs = fakeTrain.photoRefs;
      } else {
        const small = await downscaleBlob(file, 2000, 0.8);
        rep.photoDataUrl = await blobToDataUrl(small);
        rep.photo = "inline";
      }
    } catch (e) {
      console.warn("[ENVSS] fit photo store", e);
      rep.photo = "inline";
    }
  }

  function openConfirm(rep) {
    view.page = "event";
    if (rep && rep.eventId) view.eventId = rep.eventId;
    view.fitScreen = "confirm";
    view.fitReportId = rep.id;
    if (typeof root.render === "function") root.render();
  }
  function openSign(rep) {
    view.page = "event";
    if (rep && rep.eventId) view.eventId = rep.eventId;
    view.fitScreen = "sign";
    view.fitReportId = rep.id;
    if (typeof root.render === "function") root.render();
  }

  async function startFromFile(ev, file, manual) {
    const rep = blankReport(ev);
    (db.fitReports || (db.fitReports = [])).push(rep);
    if (file) {
      await attachPhoto(rep, ev, file);
      if (!manual) await runOcr(rep, file);
      else { rep.ocrStatus = "skipped"; rep.ocrMessage = "Entered manually."; }
    } else {
      rep.ocrStatus = "skipped";
      rep.ocrMessage = "Entered manually. You can attach a photo with Retake photo.";
    }
    evLog(ev, "Fit-test report added", rep.lastName || "new report");
    save();
    openConfirm(rep);
  }

  async function jpegForPdf(rep) {
    const src = photoSrc(rep);
    if (!src) return null;
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const k = Math.min(1, 1400 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const data = c.toDataURL("image/jpeg", 0.62);
    return { data, w: c.width, h: c.height, bytes: dataUrlToBase64(data) };
  }

  function formatAwst(iso) {
    const d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) return String(iso || "");
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Australia/Perth",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false
    }).formatToParts(d);
    const g = t => (parts.find(x => x.type === t) || {}).value || "";
    return g("day") + "/" + g("month") + "/" + g("year") + " " + g("hour") + ":" + g("minute") + " AWST";
  }

  async function buildPdf(rep, ev) {
    await loadScript(PDF_LIB);
    const lib = root.PDFLib || (typeof PDFLib !== "undefined" ? PDFLib : null);
    if (!lib) throw new Error("The PDF library did not load. Go online once, then try again.");
    const doc = await lib.PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]);
    const font = await doc.embedFont(lib.StandardFonts.Helvetica);
    const bold = await doc.embedFont(lib.StandardFonts.HelveticaBold);
    const navy = lib.rgb(0.05, 0.08, 0.16);
    const mid = lib.rgb(0.2, 0.22, 0.28);
    let y = 812;
    const line = (text, x, yy, size, f, color) => { page.drawText(String(text || ""), { x, y: yy, size: size || 10, font: f || font, color: color || mid }); };
    line("ENVSS", 40, y, 16, bold, navy); y -= 16;
    line("Respirator fit-test report", 40, y, 14, bold, navy); y -= 18;
    line((ev && ev.code) || "", 40, y, 10, font, mid); y -= 16;
    const rows = [
      ["ID number", rep.idNumber], ["Last name", rep.lastName], ["First name", rep.firstName],
      ["Company", rep.company], ["Location", rep.location],
      ["Test date", (rep.testDate && rep.testDate.display) || rep.testDateDisplay || rep.testDateRaw],
      ["Test time", rep.testTime],
      ["Due date", (rep.dueDate && rep.dueDate.display) || rep.dueDateDisplay || rep.dueDateRaw],
      ["PortaCount S/N", rep.portaCountSn], ["N95-Companion", rep.n95Companion],
      ["Respirator", rep.respirator], ["Manufacturer", rep.manufacturer], ["Model", rep.model],
      ["Style", rep.respiratorStyle], ["Size", rep.respiratorSize],
      ["Protocol", rep.protocol], ["Pass level", String(rep.passLevel || "")],
      ["Approval", rep.approval], ["Efficiency <99%", rep.efficiency],
      ["Overall fit factor", rep.overallFf], ["Overall result", rep.result],
      ["Operator", rep.operator], ["Name", rep.operatorName]
    ];
    rows.forEach(function (r) {
      if (!trim(r[1])) return;
      if (y < 260) return;
      line(r[0], 40, y, 8, bold, navy);
      const val = String(r[1]);
      const wrapped = val.length > 78 ? val.slice(0, 78) + "…" : val;
      line(wrapped, 160, y, 9, font, mid);
      y -= 12;
    });
    if ((rep.exerciseFails || []).length) {
      line("Exercise fails: " + rep.exerciseFails.join(", "), 40, y, 9, bold, lib.rgb(0.6, 0.1, 0.1));
      y -= 14;
    }
    if (rep.exercises && rep.exercises.length) {
      y -= 4;
      line("Exercises", 40, y, 10, bold, navy); y -= 14;
      line("Exercise", 40, y, 8, bold, navy);
      line("Duration", 250, y, 8, bold, navy);
      line("Fit factor", 330, y, 8, bold, navy);
      line("Pass", 430, y, 8, bold, navy);
      y -= 12;
      rep.exercises.forEach(function (ex) {
        if (y < 200) return;
        line(ex.exercise || "", 40, y, 8);
        line(ex.duration || "", 250, y, 8);
        line(ex.fitFactorRaw || (ex.fitFactor && ex.fitFactor.raw) || "", 330, y, 8);
        line((ex.pass === "no" ? "FAIL" : ex.pass === "yes" ? "PASS" : ""), 430, y, 8);
        y -= 11;
      });
    }
    y = Math.min(y - 10, 190);
    line("ENVSS technician", 40, y, 9, bold, navy);
    line("Client", 320, y, 9, bold, navy);
    y -= 8;
    async function paintSig(data, x) {
      if (!data) return;
      try {
        const b64 = String(data).replace(/^data:[^;]+;base64,/, "");
        const png = await doc.embedPng(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
        const w = 220, h = w * (png.height / png.width);
        page.drawImage(png, { x, y: y - Math.min(70, h), width: w, height: Math.min(70, h) });
      } catch (e) {}
    }
    await paintSig(rep.sigTech, 40);
    await paintSig(rep.sigClient, 320);
    line("Signed " + formatAwst(rep.signedAt), 40, 36, 8, font, mid);

    const photo = await jpegForPdf(rep);
    if (photo) {
      const p2 = doc.addPage([595.28, 841.89]);
      const raw = Uint8Array.from(atob(photo.bytes), c => c.charCodeAt(0));
      const jpg = await doc.embedJpg(raw);
      const maxW = 515, maxH = 740;
      let pw = maxW, ph = pw * (photo.h / photo.w);
      if (ph > maxH) { ph = maxH; pw = ph * (photo.w / photo.h); }
      p2.drawText("Original PortaCount report photo", { x: 40, y: 812, size: 12, font: bold, color: navy });
      p2.drawImage(jpg, { x: 40, y: 800 - ph - 24, width: pw, height: ph });
    }

    const bytes = await doc.save();
    const name = fileNameFor(Object.assign({}, rep, { testDate: rep.testDate || parseTsiDate(rep.testDateDisplay || rep.testDateRaw) }));
    const blob = new Blob([bytes], { type: "application/pdf" });
    return { blob, name, bytes: bytes.byteLength };
  }

  function downloadBlob(blob, name) {
    if (typeof root.download === "function") { root.download(blob, name); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  async function finishPdf(rep, ev) {
    const out = await buildPdf(rep, ev);
    rep.pdfName = out.name;
    rep.pdfBytes = out.bytes;
    evLog(ev, "Fit-test PDF created", out.name + " (" + out.bytes + " bytes)");
    save();
    try {
      if (root.envssDrive && root.envssDrive.enqueueExport) root.envssDrive.enqueueExport(out.blob, out.name);
    } catch (e) { console.warn("[ENVSS] fit drive enqueue", e); }
    downloadBlob(out.blob, out.name);
    return out;
  }

  async function zipAll(ev) {
    const reps = reportsOf(ev.id).filter(r => r.signedAt || r.sigTech);
    if (!reps.length) { alert("Sign at least one report first."); return; }
    await loadScript(ZIP_LIB);
    const JSZ = root.JSZip || (typeof JSZip !== "undefined" ? JSZip : null);
    if (!JSZ) throw new Error("The zip library did not load. Go online once, then try again.");
    const zip = new JSZ();
    const used = [];
    for (const r of reps) {
      const out = await buildPdf(r, ev);
      let name = out.name;
      if (root.envssDrive && root.envssDrive.versionedName) name = root.envssDrive.versionedName(name, used);
      else if (used.indexOf(name) >= 0) name = name.replace(/\.pdf$/i, "_2.pdf");
      used.push(name);
      zip.file(name, out.blob);
    }
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const zipName = ev.code + "_Fit-Tests.zip";
    try { if (root.envssDrive && root.envssDrive.enqueueExport) root.envssDrive.enqueueExport(blob, zipName); } catch (e) {}
    downloadBlob(blob, zipName);
    evLog(ev, "Fit-test zip downloaded", zipName);
    save();
  }

  function hookUi() {
    const _etl = root.eventTypeLabel;
    root.eventTypeLabel = function (e) {
      if (isFitEvent(e)) return "Respirator fit testing";
      return _etl ? _etl(e) : (e && e.type === "fibre" ? "Airborne fibre monitoring" : "Hygiene event");
    };
    root.window && (root.eventTypeLabel = root.eventTypeLabel);

    const _neh = root.newEventHtml;
    if (_neh) {
      root.newEventHtml = function () {
        let html = _neh.apply(this, arguments);
        if (html.indexOf("value=\"fit\"") === -1) {
          html = html.replace("<option value=\"fibre\">Airborne fibre monitoring (AFM)</option>",
            "<option value=\"fibre\">Airborne fibre monitoring (AFM)</option>\n      <option value=\"fit\">Respirator fit testing</option>");
        }
        if (html.indexOf("id=\"fitEventFields\"") === -1) {
          html = html.replace("<div class=\"footer-actions\">",
            "<div id=\"fitEventFields\" style=\"display:none\">"
            + "<p class=\"help\">Code: {job}-FIT-001, 002, … — a sibling event under this job, not a hygiene -001 number. You can link it to today’s hygiene event after it is created. There is no laboratory COC for fit testing.</p>"
            + "</div><div class=\"footer-actions\">");
        }
        return html;
      };
    }
    const _tog = root.toggleEventTypeFields;
    root.toggleEventTypeFields = function () {
      if (_tog) _tog.apply(this, arguments);
      const type = (document.getElementById("ntype") || {}).value;
      const box = document.getElementById("fitEventFields");
      const fibre = document.getElementById("fibreEventFields");
      const hyg = document.getElementById("hygieneEventFields");
      if (box) box.style.display = type === "fit" ? "" : "none";
      if (type === "fit") {
        if (fibre) fibre.style.display = "none";
        if (hyg) hyg.style.display = "none";
      }
    };
    root.toggleEventTypeFields = root.toggleEventTypeFields;

    const _ce = root.createEvent;
    root.createEvent = function () {
      const type = (document.getElementById("ntype") || {}).value || "hygiene";
      if (type !== "fit") return _ce ? _ce.apply(this, arguments) : null;
      const projectId = view.projectId;
      const p = root.project && root.project(projectId);
      if (!p) { alert("Open a project first."); return; }
      const date = (document.getElementById("ndate") || {}).value || "";
      const ev = {
        id: uid("e"), projectId, type: "fit", stage: "planned", date,
        code: fitEventCode(p, nextFitSeq(projectId)),
        multiDay: false, notes: "", uploadReady: false, operators: [], parentEventId: "",
        audit: []
      };
      db.events.push(ev);
      evLog(ev, "Fit-testing event created", ev.code);
      save();
      if (typeof root.openEvent === "function") root.openEvent(ev.id);
      return ev;
    };
    root.createEvent = root.createEvent;

    const _des = root.deriveEventStage;
    root.deriveEventStage = function (ev) {
      if (isFitEvent(ev)) return stageOf(ev);
      return _des ? _des(ev) : "planned";
    };

    const _coc = root.createCoc;
    if (_coc) {
      root.createCoc = async function () {
        const ev = root.eventById && root.eventById(view.eventId);
        if (isFitEvent(ev)) { alert("Fit-testing events do not have a laboratory COC."); return false; }
        return _coc.apply(this, arguments);
      };
      root.createCoc = root.createCoc;
    }
    const _mark = root.markEventUpload;
    root.markEventUpload = function (id) {
      const ev = root.eventById && root.eventById(id);
      if (!isFitEvent(ev)) return _mark ? _mark.apply(this, arguments) : null;
      const reps = reportsOf(ev.id);
      if (!reps.length) { alert("Add and sign at least one fit-test report before marking this event complete."); return; }
      const unsigned = reps.filter(r => !(r.signedAt || (r.sigTech && r.sigClient)));
      if (unsigned.length) { alert("This event cannot be marked complete until every report is signed.\nUnsigned: " + unsigned.length + "."); return; }
      ev.uploadReady = true;
      evLog(ev, "Marked event complete", "All fit-test reports signed");
      saveQuiet();
      if (typeof root.render === "function") root.render();
      alert("Event marked complete.");
    };

    const _opt = root.openPickType;
    root.openPickType = function (eventId) {
      const ev = root.eventById && root.eventById(eventId);
      if (isFitEvent(ev)) { const inp = document.getElementById("fitNewPhoto"); if (inp) inp.click(); else startFromFile(ev, null, true); return; }
      return _opt ? _opt.apply(this, arguments) : null;
    };

    const _eh = root.eventHtml;
    root.eventHtml = function () {
      const ev = root.eventById && root.eventById(view.eventId);
      if (ev && isFitEvent(ev)) {
        if (view.fitScreen === "confirm") {
          const rep = reportById(view.fitReportId);
          if (rep) return confirmHtml(rep, ev);
        }
        if (view.fitScreen === "sign") {
          const rep = reportById(view.fitReportId);
          if (rep) return signHtml(rep, ev);
        }
        view.fitScreen = "";
        return eventFitHtml(ev);
      }
      let html = _eh ? _eh.apply(this, arguments) : "";
      return html;
    };

    const _bind = root.bind;
    root.bind = function () {
      if (_bind) _bind.apply(this, arguments);
      const ev = root.eventById && root.eventById(view.eventId);
      if (!ev || !isFitEvent(ev)) return;
      const parent = document.getElementById("fitParent");
      if (parent) parent.onchange = () => { ev.parentEventId = parent.value || ""; evLog(ev, "Linked hygiene event", ev.parentEventId || "cleared"); saveQuiet(); };
      const add = document.getElementById("fitAddReport");
      const inp = document.getElementById("fitNewPhoto") || document.getElementById("fitPhotoInput");
      if (add && document.getElementById("fitNewPhoto")) add.onclick = () => document.getElementById("fitNewPhoto").click();
      const newInp = document.getElementById("fitNewPhoto");
      if (newInp && !newInp.dataset.bound) {
        newInp.dataset.bound = "1";
        newInp.onchange = () => { const f = newInp.files && newInp.files[0]; newInp.value = ""; if (f) startFromFile(ev, f, false); };
      }
      const man = document.getElementById("fitAddManual");
      if (man) man.onclick = () => startFromFile(ev, null, true);
      const mark = document.getElementById("fitMarkComplete");
      if (mark) mark.onclick = () => root.markEventUpload(ev.id);
      const zip = document.getElementById("fitZip");
      if (zip) zip.onclick = () => zipAll(ev).catch(e => alert(e.message || String(e)));
      document.querySelectorAll("[data-fit-open]").forEach(row => {
        row.onclick = () => { const r = reportById(row.getAttribute("data-fit-open")); if (r) openConfirm(r); };
      });
      const backEv = document.getElementById("fitBackEvent");
      if (backEv) backEv.onclick = () => { view.fitScreen = ""; view.fitReportId = ""; root.render(); };
      const retake = document.getElementById("fitRetake");
      const retakeInp = document.getElementById("fitPhotoInput");
      if (retake && retakeInp) {
        retake.onclick = () => retakeInp.click();
        if (!retakeInp.dataset.bound) {
          retakeInp.dataset.bound = "1";
          retakeInp.onchange = async () => {
            const f = retakeInp.files && retakeInp.files[0];
            retakeInp.value = "";
            const rep = reportById(view.fitReportId);
            if (!f || !rep) return;
            await attachPhoto(rep, ev, f);
            await runOcr(rep, f);
            evLog(ev, "Fit-test photo retaken", "");
            save();
            openConfirm(rep);
          };
        }
      }
      const addEx = document.getElementById("fitAddEx");
      if (addEx) addEx.onclick = () => {
        const rep = reportById(view.fitReportId);
        if (!rep) return;
        collectForm(rep);
        rep.exercises = (rep.exercises || []).concat([{ exercise: "", duration: "", fitFactorRaw: "", pass: "" }]);
        saveQuiet();
        openConfirm(rep);
      };
      const draft = document.getElementById("fitSaveDraft");
      if (draft) draft.onclick = () => {
        const rep = reportById(view.fitReportId);
        if (!rep) return;
        collectForm(rep);
        evLog(ev, "Fit-test report saved", "unsigned draft");
        save();
        view.fitScreen = "";
        root.render();
      };
      const toSign = document.getElementById("fitToSign");
      if (toSign) toSign.onclick = () => {
        const rep = reportById(view.fitReportId);
        if (!rep) return;
        collectForm(rep);
        if (!trim(rep.lastName) || !trim(rep.firstName)) { alert("Enter the worker’s last and first name before signing."); return; }
        saveQuiet();
        openSign(rep);
      };
      const backC = document.getElementById("fitBackConfirm");
      if (backC) backC.onclick = () => { const r = reportById(view.fitReportId); if (r) openConfirm(r); };
      const techC = document.getElementById("fitSigTech");
      const cliC = document.getElementById("fitSigClient");
      let pads = null;
      if (techC && cliC) {
        const rec = reportById(view.fitReportId);
        pads = { tech: wirePad(techC, rec && rec.sigTech), client: wirePad(cliC, rec && rec.sigClient) };
        const ct = document.getElementById("fitClearTech");
        const cc = document.getElementById("fitClearClient");
        if (ct) ct.onclick = () => pads.tech.clear();
        if (cc) cc.onclick = () => pads.client.clear();
      }
      const make = document.getElementById("fitMakePdf");
      if (make) make.onclick = async () => {
        const rep = reportById(view.fitReportId);
        if (!rep || !pads) return;
        if (!pads.tech.isDirty() || !pads.client.isDirty()) { alert("Both the ENVSS technician and the client need to sign."); return; }
        rep.sigTech = pads.tech.toDataURL();
        rep.sigClient = pads.client.toDataURL();
        rep.signedAt = new Date().toISOString();
        evLog(ev, "Fit-test report signed", [rep.lastName, rep.firstName].filter(Boolean).join(", "));
        save();
        try {
          make.disabled = true;
          await finishPdf(rep, ev);
          view.fitScreen = "";
          root.render();
        } catch (e) {
          make.disabled = false;
          alert(e.message || String(e));
        }
      };
    };

    if (root.envssFit && typeof root.envssFit === "object") {
      /* keep */
    }
    const pl = root.envssProjlist;
    /* typeLab is inside review.js IIFE; patched in review.js source. */
  }

  function injectCss() {
    if (document.getElementById("fitTestCss")) return;
    const st = document.createElement("style");
    st.id = "fitTestCss";
    st.textContent = ".fit-grid{display:grid;grid-template-columns:minmax(220px,1fr) 1.4fr;gap:14px;margin-top:10px}"
      + "@media(max-width:800px){.fit-grid{grid-template-columns:1fr}}"
      + ".fit-photo-col img{width:100%;max-height:70vh;object-fit:contain;border-radius:10px;background:#0b1020}"
      + ".fit-fields label,.fit-screen label{display:block;margin:8px 0 0;font-weight:700}"
      + ".fit-fields input,.fit-fields textarea,.fit-fields select,.fit-screen select{width:100%;box-sizing:border-box}"
      + ".fit-low{background:#3A1616;border-radius:10px;padding:6px 8px;color:#FFC9C4}"
      + ".fit-flags{color:#FFD9A8;font-weight:600}.fit-warn{color:#FFC9C4;font-weight:700}"
      + ".fit-ex-wrap{overflow:auto}.fit-ex{width:100%;border-collapse:collapse;font-size:13px}"
      + ".fit-ex th,.fit-ex td{padding:4px;border-bottom:1px solid var(--edge,#3A4A7A)}"
      + ".fit-sig{width:100%;height:180px;background:#fff;border:2px solid var(--edge,#3A4A7A);border-radius:12px;touch-action:none}"
      + ".s-ok{background:#E5F4EE;color:#1F6B4A}.s-needs{background:#FFF4E5;color:#8A4B08}";
    document.head.appendChild(st);
  }

  function boot() {
    installSync();
    injectCss();
    hookUi();
    root.isFitEvent = isFitEvent;
    api.reportsOf = reportsOf;
    api.stageOf = stageOf;
    api.applyParsed = applyParsed;
    api.startFromFile = startFromFile;
    api.buildPdf = buildPdf;
    api.zipAll = zipAll;
    api.blankReport = blankReport;
    api.runOcr = runOcr;
    root.envssFit = api;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(typeof window !== "undefined" ? window : globalThis);

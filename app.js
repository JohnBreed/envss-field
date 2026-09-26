const KEY = "envss-field-v04";

const REJECTS = [
  { code: "pump_fault", label: "Pump fault / equipment failure", photo: false },
  { code: "damaged_filter", label: "Damaged filter / cassette", photo: true },
  { code: "flow_tolerance", label: "Flow outside tolerance", photo: false },
  { code: "unused", label: "Unused / not deployed", photo: false },
  { code: "other", label: "Other", photo: false }
];

const DEFAULT = {
  catalogs: {
    contaminants: [
      { id: "INH", name: "Inhalable dust", code: "INH", kind: "airborne", headHint: "IESS", flowTolPct: 10, defaultFlow: "2.0", minMinutes: "", minVolumeL: "", desiredVolumeL: "" },
      { id: "ASB", name: "Asbestos fibres", code: "ASB", kind: "airborne", headHint: "RESS", flowTolPct: 5, defaultFlow: "1.0", minMinutes: "", minVolumeL: "", desiredVolumeL: "" },
      { id: "SIL", name: "Respirable silica", code: "SIL", kind: "airborne", headHint: "RESS", flowTolPct: 5, defaultFlow: "2.2", minMinutes: "", minVolumeL: "", desiredVolumeL: "" },
      { id: "DP", name: "Diesel particulate", code: "DP", kind: "airborne", headHint: "DP", flowTolPct: 5, defaultFlow: "2.0", minMinutes: "", minVolumeL: "", desiredVolumeL: "" },
      { id: "WLD", name: "Welding fume", code: "WLD", kind: "airborne", headHint: "IESS", flowTolPct: 10, defaultFlow: "2.0", minMinutes: "", minVolumeL: "", desiredVolumeL: "" },
      { id: "NOISE", name: "Noise dose", code: "NOISE", kind: "noise", headHint: "", flowTolPct: "", defaultFlow: "", minMinutes: "", minVolumeL: "", desiredVolumeL: "" }
    ],
    pumps: [{ serial: "123456" }, { serial: "234567" }],
    heads: [{ id: "IESS01", kind: "inhalable" }, { id: "RESS001", kind: "respirable" }, { id: "DP01", kind: "diesel" }],
    dosimeters: [{ serial: "N0001" }],
    occupations: ["Plant operator","Maintainer / fitter","Boilermaker / welder","Shotfirer","Supervisor","Labourer","HV driver","Process technician"],
    respirators: [{ brand: "3M", model: "6000 series" }, { brand: "Unknown", model: "" }],
    hpds: [{ brand: "Unknown", model: "", style: "earmuff", classRating: "" }]
  },
  projects: [],
  events: [],
  trains: [],
  deletions: []
};

const WHO_KEY = "envss-field-operator";

function deviceLabel() {
  const ua = navigator.userAgent || "";
  if (/CrOS/i.test(ua)) return "Chromebook";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad/i.test(ua)) return "iOS";
  if (/Mac/i.test(ua)) return "Mac";
  if (/Win/i.test(ua)) return "Windows";
  return "Browser";
}
function getOperator() {
  try { return JSON.parse(localStorage.getItem(WHO_KEY) || "null"); } catch { return null; }
}
function setOperator(name, extra) {
  const rec = {
    name: (name || "").trim() || "Unknown",
    email: extra && extra.email ? extra.email : "",
    source: extra && extra.source ? extra.source : "manual",
    device: deviceLabel(),
    setAt: nowIso()
  };
  localStorage.setItem(WHO_KEY, JSON.stringify(rec));
  return rec;
}
function whoText() {
  const o = getOperator();
  if (!o) return deviceLabel();
  return o.email ? `${o.name} <${o.email}> · ${o.device}` : `${o.name} · ${o.device}`;
}
function allowedEmail(email) {
  const domain = (window.ENVSS_CONFIG && window.ENVSS_CONFIG.allowedDomain) || "envss.com.au";
  return String(email || "").toLowerCase().endsWith("@" + domain.toLowerCase());
}

let db = load();
let view = { page: "dash", filter: "all", eventId: null, trainId: null, projectId: null };
let tickMin = null;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT);
    const parsed = JSON.parse(raw);
    const d = { ...structuredClone(DEFAULT), ...parsed };
    d.catalogs = { ...DEFAULT.catalogs, ...(parsed.catalogs || {}) };
    if (!d.catalogs.contaminants?.some(c => c.code === "INH")) d.catalogs.contaminants = DEFAULT.catalogs.contaminants;
    if (!Array.isArray(d.deletions)) d.deletions = [];
    (d.trains || []).forEach(t => { if (!t.audit) t.audit = []; });
    return d;
  } catch {
    return structuredClone(DEFAULT);
  }
}
function saveQuiet() { localStorage.setItem(KEY, JSON.stringify(db)); }
function save() {
  saveQuiet();
  render();
}
function uid(p) { return p + Math.random().toString(36).slice(2, 9); }
function nowIso() { return new Date().toISOString(); }
function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-AU", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
}
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(val) {
  if (!val) return "";
  const d = new Date(val);
  return isNaN(d) ? "" : d.toISOString();
}
function project(id) { return db.projects.find(p => p.id === id); }
function eventById(id) { return db.events.find(e => e.id === id); }
function trainsOf(eventId) {
  return db.trains.filter(t => t.eventId === eventId).sort((a,b) => {
    const an = isNoise(a) ? 1 : 0, bn = isNoise(b) ? 1 : 0;
    if (an !== bn) return an - bn;
    return sampleNoOf(a) - sampleNoOf(b);
  });
}
function sampleNoOf(t) { return Number(t.sampleNo || t.pouch) || 0; }
function nextSampleNo(eventId, noise) {
  const n = trainsOf(eventId).filter(t => isNoise(t) === noise).map(sampleNoOf);
  return (n.sort((a,b)=>b-a)[0] || 0) + 1;
}
function displayNo(t) {
  const n = sampleNoOf(t) || t.pouch || "";
  return isNoise(t) ? ("Noise Dosimeter " + n) : ("Sample " + n);
}
function contam(id) { return db.catalogs.contaminants.find(c => c.id === id || c.code === id); }

function num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : null; }

function runtimeMinutes(t) {
  if (!t.startAt || !t.endAt) return null;
  const ms = new Date(t.endAt) - new Date(t.startAt);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / 60000;
}
function avgFlow(t) {
  const a = num(t.startFlow), b = num(t.endFlow);
  if (a == null && b == null) return null;
  if (a == null) return b;
  if (b == null) return a;
  return (a + b) / 2;
}
function volumeLitres(t) {
  const mins = runtimeMinutes(t), q = avgFlow(t);
  if (mins == null || q == null) return null;
  return mins * q;
}
function flowCheck(t) {
  const c = contam(t.contaminantId);
  const tol = c?.flowTolPct ?? 5;
  const a = num(t.startFlow), b = num(t.endFlow);
  if (a == null || b == null || a === 0) return { ok: true, tol, pct: null };
  const pct = Math.abs(b - a) / a * 100;
  return { ok: pct <= tol, tol, pct };
}

function deriveEventStage(ev) {
  const ts = trainsOf(ev.id);
  if (ev.uploadReady) return "upload_ready";
  if (!ts.length) return "planned";
  if (ts.some(t => t.status === "running")) return "running";
  if (ts.some(t => t.status === "ended")) return "ended";
  if (ts.some(t => t.status === "prepped")) return "prepped";
  if (ts.some(t => t.status === "field_blank")) return "field_blank";
  return ev.stage || "planned";
}
function eventTypeLabel(e) { return e.type === "fibre" ? "Airborne fibre monitoring" : "Hygiene event"; }
function elapsedLabel(startAt) {
  const ms = Date.now() - new Date(startAt);
  if (!Number.isFinite(ms) || ms < 0) return "";
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return (h ? h + "h " : "") + (m % 60) + "m running";
}
function startGaps(t) {
  const miss = [];
  if (isBlank(t)) return miss;
  if (isNoise(t)) {
    if (!t.dosimeterSerial) miss.push("Dosimeter serial");
    if (isStatic(t)) { if (!t.location) miss.push("Location"); }
    else {
      if (!t.person?.first) miss.push("First name");
      if (!t.person?.last) miss.push("Last name");
    }
    return miss;
  }
  if (!t.contaminantId) miss.push("Contaminant");
  if (!t.pumpSerial) miss.push("Pump serial");
  if (!t.headId) miss.push("Sample head");
  if (!t.mediaId) miss.push("Cassette / filter / tube");
  if (!t.startFlow) miss.push("Start flow");
  if (isStatic(t)) { if (!t.location) miss.push("Location"); }
  else {
    if (!t.person?.first) miss.push("First name");
    if (!t.person?.last) miss.push("Last name");
  }
  return miss;
}
function optionalGaps(t) {
  if (isBlank(t)) return [];
  const miss = [];
  if (!isStatic(t) && !t.person?.occupation) miss.push("Occupation");
  if (!isNoise(t) && t.status === "ended" && !t.endFlow) miss.push("End flow");
  if (!t.comments) miss.push("Comments");
  return miss;
}
function rowTint(t) {
  const st = displayStatus(t);
  if (st === "sample_complete") return "tint-green";
  if (st === "incomplete" || st === "incomplete_blank" || st === "running_incomplete") return "tint-amber";
  if (startGaps(t).length && t.status !== "running") return "tint-red";
  return "";
}

function kindLabel(t) {
  return ({
    airborne_personal: "Airborne · personal",
    airborne_static: "Airborne · static",
    blank: "Field blank",
    noise_personal: "Noise · personal",
    noise_static: "Noise · static"
  })[t.trainKind || (t.mode === "static" ? "airborne_static" : "airborne_personal")] || t.trainKind || "";
}
function isNoise(t) { return (t.trainKind || "").startsWith("noise") || t.contaminantId === "NOISE"; }
function isBlank(t) { return t.trainKind === "blank"; }
function isAirbornePersonal(t) { return (t.trainKind || "airborne_personal") === "airborne_personal"; }
function isStatic(t) { return (t.trainKind || "").endsWith("static") || t.mode === "static"; }

function displayStatus(t) {
  if (typeof t === "string") return t;
  if (isBlank(t)) {
    return (t.contaminantId && t.headId) ? "field_blank" : "incomplete_blank";
  }
  if (t.status === "running") return followUpComplete(t) ? "running" : "running_incomplete";
  if (t.status === "ended" || t.status === "sample_stopped") {
    return followUpComplete(t) ? "sample_complete" : "incomplete";
  }
  if (t.status === "prepped" && !followUpComplete(t) && (t.startAt || t.rejectAsked)) return "incomplete";
  return t.status;
}
function personComplete(t) {
  if (isBlank(t) || isStatic(t)) return true;
  const p = t.person || {};
  return !!(p.sex && p.dob && p.occupation && p.company && p.hours && p.daysOn && p.daysOff);
}
function followUpComplete(t) {
  if (isBlank(t)) return !!(t.contaminantId && t.headId);
  if (t.rejectAsked !== "yes" && t.rejectAsked !== "no") return false;
  if (t.rejectAsked === "yes" && !t.rejectCode) return false;
  if (t.equipAsked !== "yes" && t.equipAsked !== "no") return false;
  if (t.equipAsked === "yes" && !(t.equipNote || t.equipPhoto)) return false;
  if (t.commentAsked !== "yes" && t.commentAsked !== "no") return false;
  if (t.commentAsked === "yes" && !(t.comments || "").trim()) return false;
  if (isAirbornePersonal(t)) {
    const worn = t.rpdAsked || "";
    if (worn !== "yes" && worn !== "no" && worn !== "unknown") return false;
    if (worn === "yes" && !(t.rpd?.model || "").trim()) return false;
  }
  if (isNoise(t) && !isStatic(t)) {
    const worn = t.hpdAsked || "";
    if (worn !== "yes" && worn !== "no" && worn !== "unknown") return false;
    if (worn === "yes" && !(t.hpd?.model || "").trim()) return false;
  }
  if (!personComplete(t)) return false;
  if (!isNoise(t) && !isBlank(t) && t.status === "ended" && !t.endFlow) return false;
  return true;
}
function badge(status) {
  const label = ({
    planned: "Planned", prepped: "Prepped", active: "Active", complete: "Complete",
    uploaded: "Uploaded", running: "Running", ended: "Sample stopped",
    sample_stopped: "Sample stopped", incomplete: "Sample stopped — complete fields",
    incomplete_blank: "Complete fields", running_incomplete: "Running — complete fields",
    sample_complete: "Sample complete — ready for upload",
    rejected: "Rejected",
    field_blank: "Field blank", fault: "Fault", upload_ready: "Upload event"
  })[status] || status;
  return `<span class="badge s-${status}">${label}</span>`;
}

function tRunNeed() {
  const tr = db.trains.find(x => x.id === view.trainId);
  return !!(tr && tr.status === "running" && tr.startAt);
}
function setOnline() {
  const el = document.getElementById("onlineDot");
  if (el) el.classList.toggle("off", !navigator.onLine);
}

function render() {
  setOnline();
  const whoEl = document.getElementById("whoLabel");
  if (whoEl) whoEl.textContent = whoText();
  paintLogin();
  const root = document.getElementById("app");
  if (tickMin) { clearInterval(tickMin); tickMin = null; }
  if (view.page === "dash") root.innerHTML = dashHtml();
  else if (view.page === "project") root.innerHTML = projectHtml();
  else if (view.page === "event") root.innerHTML = eventHtml();
  else if (view.page === "train") root.innerHTML = trainHtml();
  else if (view.page === "newEvent") root.innerHTML = newEventHtml();
  else if (view.page === "editEvent") root.innerHTML = editEventHtml();
  else if (view.page === "pickType") root.innerHTML = pickTypeHtml();
  bind();
}

function dashHtml() {
  return `
    <div class="wrap">
      <div class="row">
        <h2 class="brand-type" style="margin:0;color:var(--navy)">Projects</h2>
        <button class="btn orange" onclick="openNewEvent()">New project / event</button>
      </div>
      ${db.projects.map(p => {
        const evs = db.events.filter(e => e.projectId === p.id);
        const stages = evs.map(deriveEventStage);
        const stage = stages.includes("running") ? "running" : stages.includes("ended") ? "ended" : evs.length ? stages[0] : "planned";
        return `<div class="card" onclick="openProject('${p.id}')" style="cursor:pointer">
          <div class="row">
            <div class="grow">
              <div class="brand-type" style="font-weight:700;color:var(--navy);font-size:18px">${p.number}</div>
              <div class="muted">${esc(p.name || "")} · ${esc(p.site || "")} · ${evs.length} event${evs.length===1?"":"s"}</div>
            </div>
            ${badge(stage)}
          </div>
        </div>`;
      }).join("") || `<div class="empty">No projects yet.</div>`}
      <p class="muted">Signed in as ${esc(whoText())} — <button class="btn ghost" onclick="changeOperator()">Change operator</button></p>
    </div>`;
}
function projectHtml() {
  const p = project(view.projectId);
  if (!p) return `<div class="wrap">Missing project.</div>`;
  const list = db.events.filter(e => e.projectId === p.id).map(e => ({ ...e, stageNow: deriveEventStage(e) }))
    .filter(e => view.filter === "all" || e.stageNow === view.filter);
  return `
    <div class="wrap">
      <button class="btn ghost" onclick="goDash()">← Projects</button>
      <div class="row" style="margin-top:10px">
        <div class="grow">
          <h2 class="brand-type" style="margin:0;color:var(--navy)">${p.number}</h2>
          <div class="muted">${esc(p.name || "")} · ${esc(p.site || "")}</div>
        </div>
        <button class="btn orange" onclick="openNewEvent('${p.id}')">New event</button>
      </div>
      <div class="filters">
        ${["all","running","ended","prepped","field_blank","planned","upload_ready"].map(s =>
          `<button class="chip ${view.filter===s?"on":""}" data-filter="${s}">${s==="all"?"All":s.replace("_"," ")}</button>`
        ).join("")}
      </div>
      ${list.length ? list.map(e => {
        const n = trainsOf(e.id).length;
        return `<div class="card" onclick="openEvent('${e.id}')" style="cursor:pointer">
          <div class="row">
            <div class="grow">
              <div class="brand-type" style="font-weight:700;color:var(--navy);font-size:18px">${e.code}</div>
              <div class="muted">${eventTypeLabel(e)} · ${e.date || ""} · ${n} sample${n===1?"":"s"}</div>
            </div>
            ${badge(e.stageNow)}
          </div>
        </div>`;
      }).join("") : `<div class="empty">No events in this filter.</div>`}
    </div>`;
}
function eventHtml() {
  const ev = eventById(view.eventId);
  if (!ev) return `<div class="wrap">Missing event.</div>`;
  const p = project(ev.projectId);
  const ts = trainsOf(ev.id);
  return `
    <div class="wrap">
      <div class="row">
        <div class="grow">
          <div class="muted" onclick="openEditEvent('${ev.id}')" style="cursor:pointer">${p ? p.number + " · " + p.name : ""} · tap to edit</div>
          <h2 class="brand-type" style="margin:4px 0;color:var(--navy)">${ev.code}</h2>
          <div class="muted">${eventTypeLabel(ev)}</div>
        </div>
        ${badge(deriveEventStage(ev))}
      </div>
      <div class="row" style="margin:10px 0">
        <button class="btn ghost" onclick="openProject('${ev.projectId}')">Dashboard</button>
        <button class="btn mid" onclick="openPickType('${ev.id}')">Add sample</button>
        <button class="btn green" onclick="markEventUpload('${ev.id}')">Upload event</button>
        <div class="menu-wrap">
          <button class="btn ghost" type="button" id="btnMenu">☰</button>
          <div class="menu" id="eventMenu" hidden>
            <button type="button" onclick="exportEvent('${ev.id}')">Export JSON</button>
            <button type="button" onclick="exportCsv('${ev.id}')">Export CSV</button>
            <button type="button" onclick="window.print()">Print</button>
          </div>
        </div>
      </div>
      ${eventListHtml(ts)}
      ${deletionLogHtml(ev.id)}
    </div>`;
}
function dash(v) { return (v && String(v).trim()) ? String(v).trim() : "—"; }
function runPhrase(t) {
  const mins = runtimeMinutes(t);
  if (mins != null) return Math.round(mins) + " min";
  return "";
}
function summaryLine(t) {
  if (isBlank(t)) return t.mediaId ? dash(t.mediaId) : "";
  const who = isStatic(t)
    ? dash(t.location)
    : dash([t.person?.first, t.person?.last].filter(Boolean).join(" "));
  const role = isStatic(t) ? "" : dash(t.person?.occupation);
  const bits = [who, role, t.startAt ? "start " + fmtTime(t.startAt) : "", t.endAt ? "stop " + fmtTime(t.endAt) : "", runPhrase(t)].filter(Boolean);
  return bits.join(" · ");
}
function titleLine(t) {
  const c = contam(t.contaminantId);
  const parts = [displayNo(t), kindLabel(t)];
  if (c && !isNoise(t)) parts.push(c.code);
  if (isBlank(t)) { parts.push(dash(t.headId)); return parts.join(" · "); }
  if (isNoise(t)) { parts.push(dash(t.dosimeterSerial)); return parts.join(" · "); }
  parts.push(dash(t.pumpSerial), dash(t.headId), dash(t.mediaId));
  return parts.join(" · ");
}
function trainRowHtml(t) {
  const run = t.status === "running" && !isBlank(t) && t.startAt;
  const tint = rowTint(t);
  const line = summaryLine(t).replace("LIVE", `<span data-run="${t.id}">${elapsedLabel(t.startAt)}</span>`);
  return `<div class="train ${tint}" onclick="openTrain('${t.id}')">
    <div class="pouch">${sampleNoOf(t) || "–"}</div>
    <div>
      <div class="row-title">${titleLine(t)}</div>
      <div class="muted">${line}</div>
    </div>
    ${badge(displayStatus(t))}
  </div>`;
}
function eventListHtml(ts) {
  const air = ts.filter(t => !isNoise(t));
  const noise = ts.filter(isNoise);
  if (!ts.length) return `<div class="empty">No samples yet.</div>`;
  return `${air.length ? `<h3 class="brand-type" style="color:var(--navy);margin:16px 0 8px">Airborne</h3>` : ""}
    ${air.map(trainRowHtml).join("")}
    ${noise.length ? `<h3 class="brand-type" style="color:var(--navy);margin:16px 0 8px">Noise</h3>` : ""}
    ${noise.map(trainRowHtml).join("")}`;
}
function deletionLogHtml(eventId) {
  const rows = (db.deletions || []).filter(d => d.eventId === eventId);
  if (!rows.length) return "";
  return `<h3 class="brand-type" style="color:var(--navy);margin-top:22px">Deleted sample trains</h3>
    <p class="help">These cannot be undone on this device.</p>
    ${rows.map(d => `<div class="muted" style="margin-bottom:6px">${fmtTime(d.at)} · ${esc(d.who || "")} · pouch ${esc(d.pouch)} · ${esc(d.kind || "")} · ${esc(d.detail || "Deleted")}</div>`).join("")}`;
}

function trainHtml() {
  const t = db.trains.find(x => x.id === view.trainId);
  if (!t) return `<div class="wrap">Missing sample train.</div>`;
  const ev = eventById(t.eventId);
  const c = contam(t.contaminantId);
  const running = t.status === "running";
  const ended = t.status === "ended" || t.status === "uploaded";
  const mins = runtimeMinutes(t);
  const avg = avgFlow(t);
  const vol = volumeLitres(t);
  const chk = flowCheck(t);
  const audit = t.audit || [];
  return `
    <div class="wrap">
      <button class="btn ghost" onclick="leaveSample('${t.id}','${t.eventId}')">← ${ev ? ev.code : "Event"}</button>
      <div class="row" style="margin-top:10px">
        <h2 class="brand-type" style="margin:0;color:var(--navy)">${displayNo(t)}</h2>
        ${badge(displayStatus(t))}
      </div>
      <label>Sample train type</label>
      <select id="trainKind">${trainKindOptions(t)}</select>
      <p class="help">${isNoise(t)
        ? "Noise trains can switch personal ↔ static only."
        : "Airborne and field blank can switch between personal, static and blank."}</p>
      <input type="hidden" id="mode" value="${esc(t.mode || "personal")}">
      <div class="grid2">
        <div>
          <label>${isNoise(t) ? "Noise Dosimeter Number" : "Sample No."}</label>
          <input id="pouch" value="${esc(String(t.sampleNo || t.pouch || ""))}">
          <label>Contaminant</label>
          ${isNoise(t) ? `<input value="NOISE — Noise dose" disabled>` : `<div class="combo">
            <input id="contam" value="${esc(c ? c.code + " — " + c.name : "")}" placeholder="INH, SIL, DP, WLD, ASB">
            <div class="suggest" id="sug-contam"></div>
          </div>`}
          ${isNoise(t) ? `
          <label>Dosimeter serial</label>
          <div class="combo">
            <input id="dosimeter" value="${esc(t.dosimeterSerial)}" placeholder="Badge serial">
            <div class="suggest" id="sug-dosimeter"></div>
          </div>` : isBlank(t) ? `
          <label>Sample head</label>
          <div class="combo">
            <input id="head" value="${esc(t.headId)}" placeholder="IESS… / RESS… / DP…">
            <div class="suggest" id="sug-head"></div>
          </div>
          <label>Cassette / filter / tube</label>
          <input id="media" value="${esc(t.mediaId)}">` : `
          <label>Pump serial</label>
          <div class="combo">
            <input id="pump" value="${esc(t.pumpSerial)}" placeholder="Type serial — fleet or hire">
            <div class="suggest" id="sug-pump"></div>
          </div>
          <label>Sample head</label>
          <div class="combo">
            <input id="head" value="${esc(t.headId)}" placeholder="IESS… / RESS… / DP…">
            <div class="suggest" id="sug-head"></div>
          </div>
          <label>Cassette / filter / tube</label>
          <input id="media" value="${esc(t.mediaId)}">`}
        </div>
        <div>
          ${isBlank(t) || isNoise(t) ? (isBlank(t) ? `<p class="muted">Field blank is not started. No flow or volume.</p>` : "") : `
          <label>Start flow (L/min)</label>
          <input id="startFlow" value="${esc(t.startFlow)}" inputmode="decimal">
          <label>End flow (L/min)</label>
          <input id="endFlow" value="${esc(t.endFlow)}" inputmode="decimal">
          <label>Average flow (L/min)</label>
          <input value="${t.endFlow && avg != null ? avg.toFixed(3) : "—"}" disabled>
          <label>Runtime</label>
          <input value="${mins == null ? "—" : mins.toFixed(1) + " min"}" disabled>
          <label>Volume sampled (L)</label>
          <input value="${t.endFlow && vol != null ? vol.toFixed(1) : "—"}" disabled>
          <label class="check-row"><input type="checkbox" id="methodOn" ${t.methodOn || t.desiredVolumeL || t.minMinutes ? "checked" : ""}> Method minimum volume or minutes</label>
          <div id="methodBox" style="${t.methodOn || t.desiredVolumeL || t.minMinutes ? "" : "display:none"}">
            <label>Desired / method minimum volume (L)</label>
            <input id="desiredVolume" value="${esc(t.desiredVolumeL || "")}" inputmode="decimal">
            <label>Method minimum minutes</label>
            <input id="minMinutes" value="${esc(t.minMinutes || "")}" inputmode="decimal">
          </div>`}
        </div>
      </div>
      ${!isBlank(t) && !isNoise(t) && chk.pct != null ? `<p class="${chk.ok ? "muted" : ""}" style="${chk.ok ? "" : "color:var(--danger);font-weight:700"}">
        End flow is ${chk.pct.toFixed(1)}% from start. Tolerance ±${chk.tol}%.
        ${chk.ok ? "Within tolerance." : "Outside tolerance — reject unless you have a documented reason."}
      </p>` : ""}
      <div id="modeFields">${isBlank(t) ? "" : modeFields(t)}</div>
      ${isBlank(t) ? "" : `
      <div class="times" style="margin-top:8px">
        <div>
          <label>Start time (editable)</label>
          <input id="startAt" type="datetime-local" value="${toLocalInput(t.startAt)}">
        </div>
        <div>
          <label>Stop time (editable)</label>
          <input id="endAt" type="datetime-local" value="${toLocalInput(t.endAt)}">
        </div>
      </div>
      <div class="startstop">
        <button class="btn orange lg" id="btnStart" ${running||t.status==="rejected"?"disabled":""}>START</button>
        <button class="btn green lg" id="btnStop" ${!running?"disabled":""}>STOP</button>
      </div>
      <p class="help">Accidental START/STOP: edit the times. Leaving the field saves it. Location is stored when START or STOP gets a GPS fix.</p>
      ${t.startLoc ? `<p class="help">Start location ${Number(t.startLoc.lat).toFixed(5)}, ${Number(t.startLoc.lng).toFixed(5)}</p>` : ""}
      ${t.endLoc ? `<p class="help">Stop location ${Number(t.endLoc.lat).toFixed(5)}, ${Number(t.endLoc.lng).toFixed(5)}</p>` : ""}
      `}
      ${isBlank(t) ? "" : followUpHtml(t)}
      ${isAirbornePersonal(t) ? rpdFields(t) : ""}
      ${isNoise(t) && !isStatic(t) ? hpdFields(t) : ""}
      ${isBlank(t) ? "" : commentHtml(t)}
      <div class="footer-actions">
        <button class="btn danger" id="btnDelete" type="button" onclick="event.stopPropagation(); deleteSample('${t.id}')">Delete sample</button>
      </div>
      <h3 class="brand-type" style="color:var(--navy);margin-top:22px;cursor:pointer" id="auditToggle">Audit log ▸</h3>
      <div id="auditBox" hidden>
      ${audit.length ? `<div class="card">${audit.slice().reverse().map(a =>
        `<div class="muted" style="margin-bottom:6px">${fmtTime(a.at)} · ${esc(a.who || "")} · ${esc(a.action)}${a.detail ? " · " + esc(a.detail) : ""}</div>`
      ).join("")}</div>` : `<p class="muted">No edits yet.</p>`}
      </div>
    </div>`;
}

function noiseRejects() {
  return [
    { code: "battery_fault", label: "Battery fault", photo: false },
    { code: "measurement_fault", label: "Measurement fault", photo: false }
  ];
}
function rejectList(t) { return isNoise(t) ? noiseRejects() : REJECTS; }

function yn(name, val, extra) {
  const opts = extra || [["yes","Yes"],["no","No"]];
  return `<div class="filters">
    ${opts.map(([v,l]) => `<button type="button" class="chip ${val===v?"on":""}" data-yn="${name}" data-val="${v}">${l}</button>`).join("")}
  </div>`;
}
function followUpHtml(t) {
  const list = rejectList(t);
  const need = (t.status === "ended" || t.status === "running" || t.status === "rejected" || t.status === "fault");
  const askC = t.commentAsked || "";
  return `
    <div class="${t.rejectAsked ? "" : "need-yn"}">
      <label>${isNoise(t) ? "Fault?" : "Sample rejected?"}</label>
      ${yn("reject", t.rejectAsked || "")}
    </div>
    <div id="rejectBox" style="${t.rejectAsked==="yes" ? "" : "display:none"}">
      <div class="filters" id="rejectChips">
        ${list.map(r => `<button type="button" class="chip ${t.rejectCode===r.code?"on":""}" data-rej="${r.code}">${r.label}</button>`).join("")}
      </div>
      ${t.rejectCode === "damaged_filter" ? `<label>Photo of filter (optional)</label>
        <input id="photo" type="file" accept="image/*" capture="environment">
        ${t.photo ? `<img alt="filter" src="${t.photo}" style="max-width:220px;border-radius:8px">` : ""}` : ""}
    </div>
    <div class="${t.equipAsked ? "" : "need-yn"}">
      <label>ENVSS equipment damaged?</label>
      ${yn("equip", t.equipAsked || "")}
    </div>
    <div id="equipBox" style="${t.equipAsked==="yes" ? "" : "display:none"}">
      <label>Photo</label>
      <input id="equipPhoto" type="file" accept="image/*" capture="environment">
      ${t.equipPhoto ? `<img alt="equipment" src="${t.equipPhoto}" style="max-width:220px;border-radius:8px">` : ""}
      <label>What was damaged</label>
      <input id="equipNote" value="${esc(t.equipNote || "")}">
    </div>
    `;
}
function commentHtml(t) {
  return `<div class="${t.commentAsked ? "" : "need-yn"}">
      <label>Comments?</label>
      ${yn("comment", t.commentAsked || "")}
    </div>
    <div id="commentBox" style="${t.commentAsked==="yes" ? "" : "display:none"}">
      <div class="comment-wrap">
        <textarea id="comments">${esc(t.comments)}</textarea>
        <button type="button" class="mic-btn" id="btnSpeak" title="Voice to text">${micSvg()}</button>
      </div>
      <div class="mic-bars" id="micBars" hidden>${"<span></span>".repeat(12)}</div>
      <p class="help">Tap mic to start, tick to stop.</p>
    </div>`;
}
function rejectBlockHtml(t) {
  const list = rejectList(t);
  const on = t.status === "rejected" || t.status === "fault" || !!t.rejectCode;
  return `<label class="check-row"><input type="checkbox" id="rejectedOn" ${on ? "checked" : ""}> ${isNoise(t) ? "Fault" : "Sample rejected"}</label>
    <p class="help">${isNoise(t) ? "Tick if the badge did not record a valid dose." : "Tick only if this sample must not go to the lab as valid."}</p>
    <div id="rejectBox" style="${on ? "" : "display:none"}">
      <div class="filters" id="rejectChips">
        ${list.map(r => `<button type="button" class="chip ${t.rejectCode===r.code?"on":""}" data-rej="${r.code}">${r.label}</button>`).join("")}
      </div>
      <p class="help">Tap the same reason again to deselect it.</p>
      ${t.rejectCode ? `<label>Extra detail (optional)</label>
        <input id="rejectReason" value="${esc(t.rejectReason && t.rejectReason !== (list.find(r=>r.code===t.rejectCode)||{}).label ? t.rejectReason : "")}">` : ""}
      ${t.rejectCode === "damaged_filter" ? `<label>Photo of filter (optional)</label>
        <input id="photo" type="file" accept="image/*" capture="environment">
        ${t.photo ? `<img alt="filter" src="${t.photo}" style="max-width:220px;border-radius:8px">` : ""}` : ""}
    </div>`;
}
function tickSvg() {
  return `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M9 16.2l-3.5-3.5-1.4 1.4L9 19 20.3 7.7l-1.4-1.4z"/></svg>`;
}
let micAnim = null;
function startMicBars(bars) {
  const spans = [...bars.querySelectorAll("span")];
  if (micAnim) clearInterval(micAnim);
  micAnim = setInterval(() => {
    spans.forEach(sp => { sp.style.height = (4 + Math.random()*18) + "px"; });
  }, 120);
}
function stopMicUi(btn, bars) {
  if (micAnim) { clearInterval(micAnim); micAnim = null; }
  if (btn) { btn.classList.remove("live"); btn.innerHTML = micSvg(); }
  if (bars) bars.hidden = true;
}
function micSvg() {
  return `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>`;
}

function modeFields(t) {
  if (isStatic(t)) {
    return `<label>Static location</label><input id="location" value="${esc(t.location)}" placeholder="e.g. Crusher west">`;
  }
  const p = t.person || {};
  return `<div class="grid2">
    <div><label>First name</label><input id="first" value="${esc(p.first)}"></div>
    <div><label>Last name</label><input id="last" value="${esc(p.last)}"></div>
    <div><label>Sex</label>
      <select id="sex">
        <option value="">Not stated</option>
        <option value="male" ${p.sex==="male"?"selected":""}>Male</option>
        <option value="female" ${p.sex==="female"?"selected":""}>Female</option>
      </select>
    </div>
    <div><label>Date of birth</label>
      <div class="dob-row">
        <input id="dobD" maxlength="2" inputmode="numeric" placeholder="DD" value="${esc(p.dobD || (p.dob||"").split("-")[2]||"")}">
        <input id="dobM" maxlength="2" inputmode="numeric" placeholder="MM" value="${esc(p.dobM || (p.dob||"").split("-")[1]||"")}">
        <input id="dobY" maxlength="4" inputmode="numeric" placeholder="YYYY" value="${esc(p.dobY || (p.dob||"").split("-")[0]||"")}">
      </div>
    </div>
    <div><label>Occupation</label>
      <div class="combo">
        <input id="occupation" value="${esc(p.occupation)}" placeholder="Type or pick">
        <div class="suggest" id="sug-occupation"></div>
      </div>
    </div>
    <div><label>Company / contractor</label><input id="company" value="${esc(p.company)}"></div>
    <div><label>Hours / shift</label><input id="hours" value="${esc(p.hours)}"></div>
    <div><label>Days on</label><input id="daysOn" value="${esc(p.daysOn)}"></div>
    <div><label>Days off</label><input id="daysOff" value="${esc(p.daysOff)}"></div>
  </div>`;
}
function rpdFields(t) {
  const r = t.rpd || {};
  const asked = t.rpdAsked || "";
  const on = asked === "yes";
  return `<div class="${asked ? "" : "need-yn"}">
      <label>Respirator worn?</label>
      ${yn("rpd", asked, [["yes","Yes"],["no","No"],["unknown","Unknown"]])}
    </div>
    <div id="rpdBox" style="${on ? "" : "display:none"}">
      <label>Brand / model</label>
      <input id="rpdModel" value="${esc(r.model)}" placeholder="3M 6000 or Unknown">
      <label class="check-row"><input type="checkbox" id="rpdShaven" ${r.shaven==="yes"?"checked":""}> Clean-shaven</label>
      <label class="check-row"><input type="checkbox" id="rpdFit" ${r.fit==="yes"?"checked":""}> Fit-tested</label>
    </div>`;
}
function hpdFields(t) {
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
      <input id="hpdClass" value="${esc(h.classRating)}" placeholder="if known">
    </div>`;
}

function pickTypeHtml() {
  const ev = eventById(view.eventId);
  const opts = [
    ["airborne_personal", "Airborne · personal", "Worn pump. Person, RPD, flow, start/stop."],
    ["airborne_static", "Airborne · static", "Fixed location. No person, no RPD."],
    ["blank", "Field blank", "Control. Contaminant + cassette only. Not run."],
    ["noise_personal", "Noise · personal", "Dose badge on a person. HPD. No cassette."],
    ["noise_static", "Noise · static", "Dose badge at a location."]
  ];
  return `<div class="wrap">
    <button class="btn ghost" onclick="openEvent('${view.eventId}')">← ${ev ? ev.code : "Event"}</button>
    <h2 class="brand-type" style="color:var(--navy)">Add sample</h2>
    ${opts.map(([id, title, blurb]) => `<div class="card" style="cursor:pointer" onclick="addTrain('${view.eventId}','${id}')">
      <strong>${title}</strong><div class="muted">${blurb}</div>
    </div>`).join("")}
  </div>`;
}

function newEventHtml() {
  const opts = db.projects.map(p => `<option value="${p.id}" ${view.projectId===p.id?"selected":""}>${p.number} — ${p.name}</option>`).join("");
  return `<div class="wrap">
    <button class="btn ghost" onclick="view.projectId ? openProject(view.projectId) : goDash()">← Back</button>
    <h2 class="brand-type" style="color:var(--navy)">New event</h2>
    <label>Event type</label>
    <select id="ntype">
      <option value="hygiene">Hygiene event</option>
      <option value="fibre" disabled>Airborne fibre monitoring (soon)</option>
    </select>
    <label>Project</label>
    <select id="np">${opts}</select>
    <label>Or new project number</label>
    <input id="nnum" placeholder="001900">
    <label>Project name / site</label>
    <input id="nname" placeholder="Client / site">
    <label>Event date</label>
    <input id="ndate" type="date" value="${new Date().toISOString().slice(0,10)}">
    <div class="footer-actions"><button class="btn orange" id="btnCreateEv">Create event</button></div>
  </div>`;
}
function editEventHtml() {
  const ev = eventById(view.eventId);
  const p = ev ? project(ev.projectId) : null;
  if (!ev || !p) return `<div class="wrap">Missing.</div>`;
  return `<div class="wrap">
    <button class="btn ghost" onclick="openEvent('${ev.id}')">← ${ev.code}</button>
    <h2 class="brand-type" style="color:var(--navy)">Edit project / event</h2>
    <label>Project number</label><input id="enum" value="${esc(p.number)}">
    <label>Project name</label><input id="ename" value="${esc(p.name)}">
    <label>Site</label><input id="esite" value="${esc(p.site || "")}">
    <label>Event date</label><input id="edate" type="date" value="${esc(ev.date || "")}">
    <label>Notes</label><textarea id="enotes">${esc(ev.notes || "")}</textarea>
    <div class="footer-actions"><button class="btn orange" id="btnSaveEv">Save</button></div>
  </div>`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}

function audit(t, action, detail) {
  t.audit = t.audit || [];
  t.audit.push({ at: nowIso(), action, detail: detail || "", who: whoText() });
}

function bind() {
  document.querySelectorAll("[data-filter]").forEach(b => b.onclick = () => { view.filter = b.dataset.filter; render(); });
  const menuBtn = document.getElementById("btnMenu");
  const menu = document.getElementById("eventMenu");
  if (menuBtn && menu) menuBtn.onclick = ev => { ev.stopPropagation(); menu.hidden = !menu.hidden; };
  const sMenuBtn = document.getElementById("btnSampleMenu");
  const sMenu = document.getElementById("sampleMenu");
  if (sMenuBtn && sMenu) sMenuBtn.onclick = ev => { ev.stopPropagation(); sMenu.hidden = !sMenu.hidden; };
  const auditToggle = document.getElementById("auditToggle");
  const auditBox = document.getElementById("auditBox");
  if (auditToggle && auditBox) auditToggle.onclick = () => {
    auditBox.hidden = !auditBox.hidden;
    auditToggle.textContent = auditBox.hidden ? "Audit log ▸" : "Audit log ▾";
  };
  const saveEv = document.getElementById("btnSaveEv");
  if (saveEv) saveEv.onclick = saveEventEdits;
  const t = db.trains.find(x => x.id === view.trainId);
  if (view.page === "train" && t) {
    const names = db.catalogs.contaminants.map(c => c.code + " — " + c.name);
    wireCombo("contam", names, (val) => {
      const code = val.split("—")[0].trim().toUpperCase();
      let c = db.catalogs.contaminants.find(x => x.code === code || x.name.toLowerCase() === val.toLowerCase());
      if (!c) {
        c = { id: code || uid("c"), name: val, code: code || val.slice(0,3).toUpperCase(), headHint: "", flowTolPct: 5, defaultFlow: "" };
        db.catalogs.contaminants.push(c);
      }
      t.contaminantId = c.id;
      if (c.defaultFlow && !t.startFlow) {
        t.startFlow = String(c.defaultFlow);
        const sf = document.getElementById("startFlow");
        if (sf) sf.value = t.startFlow;
      }
      if (c.minMinutes && !t.minMinutes) t.minMinutes = String(c.minMinutes);
      if (c.desiredVolumeL && !t.desiredVolumeL) t.desiredVolumeL = String(c.desiredVolumeL);
    });
    wireCombo("pump", (db.catalogs.pumps || []).map(p => p.serial), (val) => { t.pumpSerial = val.trim(); });
    wireCombo("head", (db.catalogs.heads || []).map(h => h.id), (val) => { t.headId = val.trim().toUpperCase(); });
    wireCombo("dosimeter", (db.catalogs.dosimeters || []).map(d => d.serial), (val) => { t.dosimeterSerial = val.trim(); });
    wireCombo("occupation", db.catalogs.occupations || [], (val) => { t.person = t.person || {}; t.person.occupation = val; });
    document.querySelectorAll("[data-yn]").forEach(b => b.onclick = () => {
      const field = b.dataset.yn, val = b.dataset.val;
      const cur = field === "reject" ? t.rejectAsked : field === "equip" ? t.equipAsked : field === "rpd" ? t.rpdAsked : field === "hpd" ? t.hpdAsked : t.commentAsked;
      const next = cur === val ? "" : val;
      if (field === "reject") {
        t.rejectAsked = next;
        if (next !== "yes") { t.rejectCode = ""; if (t.status === "rejected" || t.status === "fault") t.status = t.endAt ? "ended" : t.status; }
        if (next === "yes" && t.endAt) t.status = isNoise(t) ? "fault" : "rejected";
      }
      if (field === "equip") { t.equipAsked = next; t.equipDamaged = next === "yes"; }
      if (field === "comment") t.commentAsked = next;
      if (field === "rpd") { t.rpdAsked = next; t.rpd = t.rpd || {}; t.rpd.worn = next; }
      if (field === "hpd") { t.hpdAsked = next; t.hpd = t.hpd || {}; t.hpd.worn = next; }
      audit(t, field + " set", (cur || "unset") + " → " + (next || "cleared"));
      save();
    });
    document.querySelectorAll("[data-rej]").forEach(b => b.onclick = () => {
      if (t.rejectCode === b.dataset.rej) {
        t.rejectCode = "";
        t.rejectReason = "";
      } else {
        t.rejectCode = b.dataset.rej;
        t.rejectReason = rejectList(t).find(r => r.code === t.rejectCode)?.label || "";
        t.status = isNoise(t) ? "fault" : "rejected";
      }
      save();
    });
    const rejectedOn = document.getElementById("rejectedOn");
    if (rejectedOn) rejectedOn.onchange = () => {
      const box = document.getElementById("rejectBox");
      if (rejectedOn.checked) {
        if (box) box.style.display = "";
      } else {
        t.rejectCode = "";
        t.rejectReason = "";
        if (t.status === "rejected") t.status = t.endAt ? "ended" : (t.startAt ? "running" : "prepped");
        audit(t, "Reject cleared", "");
        save();
      }
    };
    const equipDamaged = document.getElementById("equipDamaged");
    if (equipDamaged) equipDamaged.onchange = () => {
      const box = document.getElementById("equipBox");
      t.equipDamaged = equipDamaged.checked;
      if (box) box.style.display = t.equipDamaged ? "" : "none";
      if (!t.equipDamaged) save();
    };
    const rpdOn = document.getElementById("rpdOn");
    if (rpdOn) rpdOn.onchange = () => {
      const box = document.getElementById("rpdBox");
      if (box) box.style.display = rpdOn.checked ? "" : "none";
    };
    const hpdOn = document.getElementById("hpdOn");
    if (hpdOn) hpdOn.onchange = () => {
      const box = document.getElementById("hpdBox");
      if (box) box.style.display = hpdOn.checked ? "" : "none";
    };
    const methodOn = document.getElementById("methodOn");
    if (methodOn) methodOn.onchange = () => {
      t.methodOn = methodOn.checked;
      const box = document.getElementById("methodBox");
      if (box) box.style.display = t.methodOn ? "" : "none";
      if (!t.methodOn) { t.desiredVolumeL = ""; t.minMinutes = ""; }
      audit(t, "Method minimum", t.methodOn ? "on" : "off");
      save();
    };
    const kindSel = document.getElementById("trainKind");
    if (kindSel) kindSel.onchange = () => {
      collectTrain(t);
      applyTrainKind(t, kindSel.value);
      audit(t, "Train type changed", t.trainKind);
      save();
    };
    const equipPhoto = document.getElementById("equipPhoto");
    if (equipPhoto) equipPhoto.onchange = () => {
      const f = equipPhoto.files && equipPhoto.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => { t.equipPhoto = reader.result; t.equipDamaged = true; audit(t, "Equipment damage photo", nowIso()); save(); };
      reader.readAsDataURL(f);
    };
    const speak = document.getElementById("btnSpeak");
    if (speak) speak.onclick = () => startSpeech();
    const photo = document.getElementById("photo");
    if (photo) photo.onchange = () => {
      const f = photo.files && photo.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => { t.photo = reader.result; audit(t, "Photo attached", "damaged filter"); save(); };
      reader.readAsDataURL(f);
    };
    const stopBtn = document.getElementById("btnStop");
    if (stopBtn) stopBtn.onclick = () => {
      collectTrain(t);
      const mins = (() => {
        const start = t.startAt ? new Date(t.startAt) : new Date();
        return (Date.now() - start) / 60000;
      })();
      const vol = volumeLitres({ ...t, endAt: nowIso() });
      const needM = parseFloat(t.minMinutes || "");
      const needV = parseFloat(t.desiredVolumeL || "");
      let warn = "";
      if (Number.isFinite(needM) && mins < needM) warn = `Runtime about ${mins.toFixed(0)} min is under the method minimum of ${needM} min.`;
      if (Number.isFinite(needV) && vol != null && vol < needV) warn += ` Volume about ${vol.toFixed(0)} L is under the desired ${needV} L.`;
      if (warn && !confirm(warn + " Stop anyway? This is logged.")) return;
      const prev = t.endAt;
      t.endAt = nowIso();
      t.status = "ended";
      audit(t, "STOP pressed", (prev ? `previous stop ${fmtTime(prev)}` : "") + (warn ? " · early-stop confirmed" : ""));
      const chk = flowCheck(t);
      if (!chk.ok) audit(t, "Flow outside tolerance", `${chk.pct.toFixed(1)}% vs ±${chk.tol}%`);
      save();
      captureLocation().then(loc => {
        if (!loc) { audit(t, "Stop location", "no fix"); save(); return; }
        t.endLoc = loc;
        audit(t, "Stop location", loc.lat.toFixed(5) + ", " + loc.lng.toFixed(5));
        save();
      });
    };
    const startBtn = document.getElementById("btnStart");
    if (startBtn) startBtn.onclick = () => {
      collectTrain(t);
      const gaps = startGaps(t);
      if (gaps.length) { alert("Cannot start until these are filled:\n• " + gaps.join("\n• ")); return; }
      const prev = t.startAt;
      t.startAt = nowIso();
      t.status = "running";
      audit(t, "START pressed", prev ? `previous start ${fmtTime(prev)}` : "");
      save();
      captureLocation().then(loc => {
        if (!loc) { audit(t, "Start location", "no fix"); save(); return; }
        t.startLoc = loc;
        audit(t, "Start location", loc.lat.toFixed(5) + ", " + loc.lng.toFixed(5));
        save();
      });
    };
    bindAutosave(t);
    const rejBtn = document.getElementById("btnReject");
    if (rejBtn) rejBtn.onclick = () => {
      collectTrain(t);
      if (!t.rejectCode) {
        alert("Tick Sample rejected and pick a reason first.");
        return;
      }
      t.status = "rejected";
      audit(t, "Rejected", t.rejectCode);
      save();
    };
    const delBtn = document.getElementById("btnDelete");
    if (delBtn) delBtn.onclick = () => deleteTrain(t);
    const ur = document.getElementById("btnUnreject");
    if (ur) ur.onclick = () => { collectTrain(t); t.status = t.endAt ? "ended" : (t.startAt ? "running" : "prepped"); audit(t, "Reject cleared"); save(); };
    const up = document.getElementById("btnUploaded");
    if (up) up.onclick = () => { collectTrain(t); t.status = "uploaded"; audit(t, "Marked uploaded"); save(); };
    const addPump = document.getElementById("btnAddPump");
    if (addPump) addPump.onclick = () => {
      collectTrain(t);
      if (isNoise(t)) {
        const s = t.dosimeterSerial;
        if (s && !(db.catalogs.dosimeters || []).some(d => d.serial === s)) {
          db.catalogs.dosimeters = db.catalogs.dosimeters || [];
          db.catalogs.dosimeters.push({ serial: s }); audit(t, "Dosimeter added to fleet", s); save();
          alert("Dosimeter " + s + " added.");
        }
        return;
      }
      if (t.pumpSerial && !db.catalogs.pumps.some(p => p.serial === t.pumpSerial)) {
        db.catalogs.pumps.push({ serial: t.pumpSerial }); audit(t, "Pump added to fleet", t.pumpSerial); save();
        alert("Pump " + t.pumpSerial + " added to fleet list.");
      }
    };
    const addHead = document.getElementById("btnAddHead");
    if (addHead) addHead.onclick = () => {
      collectTrain(t);
      const id = (t.headId || "").toUpperCase();
      if (id && !db.catalogs.heads.some(h => h.id === id)) {
        const kind = id.startsWith("RESS") ? "respirable" : id.startsWith("IESS") ? "inhalable" : id.startsWith("DP") ? "diesel" : "other";
        db.catalogs.heads.push({ id, kind }); audit(t, "Cassette added", id); save();
        alert("Cassette " + id + " added.");
      }
    };
    ["startFlow","endFlow","startAt","endAt"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", () => { collectTrain(t); render(); });
    });
  }
  const ce = document.getElementById("btnCreateEv");
  if (ce) ce.onclick = createEvent;
}

function snapshotTrain(t) {
  return JSON.stringify({
    pouch: t.pouch, sampleNo: t.sampleNo, contaminantId: t.contaminantId, pumpSerial: t.pumpSerial,
    dosimeterSerial: t.dosimeterSerial, headId: t.headId, mediaId: t.mediaId, startFlow: t.startFlow,
    endFlow: t.endFlow, comments: t.comments, location: t.location, person: t.person, rpd: t.rpd, hpd: t.hpd,
    rejectCode: t.rejectCode, startAt: t.startAt, endAt: t.endAt, desiredVolumeL: t.desiredVolumeL
  });
}
function bindAutosave(t) {
  const root = document.getElementById("app");
  if (!root) return;
  root.querySelectorAll("input, textarea, select").forEach(el => {
    if (el.type === "file" || el.id === "rejectedOn" || el.id === "equipDamaged" || el.id === "rpdOn" || el.id === "hpdOn" || el.id === "trainKind") return;
    const persist = () => {
      collectTrain(t);
      saveQuiet();
    };
    el.addEventListener("change", persist);
    el.addEventListener("blur", persist);
  });
}
function captureLocation() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, at: nowIso() }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }
    );
  });
}

function collectTrain(t) {
  const g = id => document.getElementById(id);
  t.pouch = g("pouch")?.value.trim() || t.pouch;
  const sn = parseInt(t.pouch, 10);
  if (Number.isFinite(sn)) t.sampleNo = sn;
  if (isBlank(t) && (t.contaminantId || t.headId)) t.status = "field_blank";
  t.pumpSerial = g("pump")?.value.trim() || "";
  t.headId = (g("head")?.value || "").trim().toUpperCase();
  t.mediaId = g("media")?.value.trim() || "";
  t.startFlow = g("startFlow")?.value || "";
  t.endFlow = g("endFlow")?.value || "";
  t.mode = g("mode")?.value || t.mode;
  t.comments = g("comments")?.value || "";
  t.rejectReason = g("rejectReason")?.value || "";
  t.dosimeterSerial = g("dosimeter")?.value.trim() || t.dosimeterSerial || "";
  t.desiredVolumeL = g("desiredVolume")?.value || t.desiredVolumeL || "";
  t.minMinutes = g("minMinutes")?.value || t.minMinutes || "";
  if (g("sex") || g("first")) {
    t.person = t.person || {};
    t.person.sex = g("sex")?.value || t.person.sex || "";
  }
  t.rpd = {
    worn: t.rpdAsked || t.rpd?.worn || "",
    model: g("rpdModel")?.value || t.rpd?.model || "",
    shaven: g("rpdShaven")?.checked ? "yes" : (g("rpdShaven") ? "no" : (t.rpd?.shaven || "")),
    fit: g("rpdFit")?.checked ? "yes" : (g("rpdFit") ? "no" : (t.rpd?.fit || ""))
  };
  t.hpd = {
    worn: t.hpdAsked || t.hpd?.worn || "",
    model: g("hpdModel")?.value || t.hpd?.model || "",
    style: g("hpdStyle")?.value || t.hpd?.style || "",
    classRating: g("hpdClass")?.value || t.hpd?.classRating || ""
  };
  t.equipDamaged = !!(g("equipDamaged") && g("equipDamaged").checked);
  t.equipNote = g("equipNote")?.value || t.equipNote || "";
  if (g("startAt")) t.startAt = fromLocalInput(g("startAt").value) || t.startAt;
  if (g("endAt")) {
    const v = fromLocalInput(g("endAt").value);
    t.endAt = g("endAt").value ? v : t.endAt;
  }
  if (t.mode === "static") t.location = g("location")?.value || "";
  else {
    const dd = (g("dobD")?.value || "").replace(/\D/g,"");
    const mm = (g("dobM")?.value || "").replace(/\D/g,"");
    const yy = (g("dobY")?.value || "").replace(/\D/g,"");
    const dob = (yy.length===4 && dd && mm) ? (yy+"-"+mm.padStart(2,"0")+"-"+dd.padStart(2,"0")) : (t.person?.dob || "");
    t.person = {
      first: g("first")?.value || "", last: g("last")?.value || "", sex: g("sex")?.value || "",
      dob, dobD: dd, dobM: mm, dobY: yy,
      occupation: g("occupation")?.value || "", company: g("company")?.value || "",
      hours: g("hours")?.value || "", daysOn: g("daysOn")?.value || "", daysOff: g("daysOff")?.value || ""
    };
  }
}

function wireCombo(inputId, items, onPick) {
  const input = document.getElementById(inputId);
  const box = document.getElementById("sug-" + inputId);
  if (!input || !box) return;
  const show = () => {
    const q = input.value.toLowerCase();
    const hits = items.filter(x => x.toLowerCase().includes(q)).slice(0, 8);
    box.innerHTML = hits.map(h => `<div data-v="${esc(h)}">${esc(h)}</div>`).join("") +
      (q && !items.some(x => x.toLowerCase() === q) ? `<div data-v="${esc(input.value)}"><em>Add “${esc(input.value)}”</em></div>` : "");
    box.classList.add("on");
    box.querySelectorAll("div").forEach(d => d.onclick = () => { input.value = d.dataset.v; onPick(d.dataset.v); box.classList.remove("on"); });
  };
  input.addEventListener("input", show);
  input.addEventListener("focus", show);
  input.addEventListener("blur", () => setTimeout(() => box.classList.remove("on"), 180));
}

function leaveSample(trainId, eventId) {
  const t = db.trains.find(x => x.id === trainId);
  if (t) { collectTrain(t); localStorage.setItem(KEY, JSON.stringify(db)); }
  openEvent(eventId);
}
function openEvent(id) { view.page = "event"; view.eventId = id; render(); }
function openTrain(id) { view.page = "train"; view.trainId = id; render(); }
function goDash() { view.page = "dash"; view.projectId = null; render(); }
function openProject(id) { view.page = "project"; view.projectId = id; render(); }
function openNewEvent(projectId) { view.page = "newEvent"; if (projectId) view.projectId = projectId; render(); }
function openEditEvent(id) { view.page = "editEvent"; view.eventId = id; render(); }
function markEventUpload(id) {
  const ev = eventById(id);
  if (!ev) return;
  const bad = trainsOf(id).filter(t => {
    if (isBlank(t)) return !(t.contaminantId && t.headId);
    if (t.status === "running") return true;
    if (t.status === "prepped") return true;
    if ((t.status === "ended" || t.status === "rejected" || t.status === "fault") && !followUpComplete(t)) return true;
    return false;
  });
  if (bad.length) {
    alert("This event cannot be uploaded until all samples are complete.\nIncomplete: " + bad.map(displayNo).join(", "));
    return;
  }
  ev.uploadReady = true;
  save();
  alert("Event flagged for upload. Export from the menu until Podio is connected.");
}
function saveEventEdits() {
  const ev = eventById(view.eventId);
  const p = ev && project(ev.projectId);
  if (!ev || !p) return;
  p.number = document.getElementById("enum").value.trim() || p.number;
  p.name = document.getElementById("ename").value.trim();
  p.site = document.getElementById("esite").value.trim();
  ev.date = document.getElementById("edate").value;
  ev.notes = document.getElementById("enotes").value;
  const parts = ev.code.split("-");
  if (parts.length >= 2) ev.code = p.number + "-" + parts.slice(1).join("-");
  save();
  openEvent(ev.id);
}

function trainKindOptions(t) {
  const cur = t.trainKind || (t.mode === "static" ? "airborne_static" : "airborne_personal");
  const noiseSet = [
    ["noise_personal", "Noise · personal"],
    ["noise_static", "Noise · static"]
  ];
  const airSet = [
    ["airborne_personal", "Airborne · personal"],
    ["airborne_static", "Airborne · static"],
    ["blank", "Field blank"]
  ];
  const set = cur.startsWith("noise") ? noiseSet : airSet;
  return set.map(([id, label]) => `<option value="${id}" ${cur===id?"selected":""}>${label}</option>`).join("");
}
function applyTrainKind(t, kind) {
  const prev = t.trainKind;
  t.trainKind = kind;
  t.mode = kind.endsWith("static") ? "static" : (kind === "blank" ? "blank" : "personal");
  if (kind.startsWith("noise")) t.contaminantId = "NOISE";
  else if (prev && prev.startsWith("noise") && t.contaminantId === "NOISE") t.contaminantId = "";
  if (kind === "blank") {
    t.startAt = t.startAt || "";
    t.endAt = t.endAt || "";
  }
}
function applyPlacement(t, placement) {
  applyTrainKind(t, isNoise(t)
    ? (placement === "static" ? "noise_static" : "noise_personal")
    : (placement === "static" ? "airborne_static" : "airborne_personal"));
}
function deleteSample(id) {
  try {
    const t = db.trains.find(x => x.id === id) || db.trains.find(x => x.id === view.trainId);
    if (!t) { alert("That sample is already gone."); openEvent(view.eventId); return; }
    if (!confirm("Delete " + displayNo(t) + "? This cannot be undone on this device.")) return;
    const eventId = t.eventId;
    db.deletions = db.deletions || [];
    db.deletions.push({
      at: nowIso(),
      who: whoText(),
      eventId: eventId,
      trainId: t.id,
      pouch: t.pouch || t.sampleNo,
      kind: t.trainKind,
      detail: "deleted"
    });
    db.trains = db.trains.filter(x => x.id !== t.id);
    view.trainId = null;
    view.page = "event";
    view.eventId = eventId;
    localStorage.setItem(KEY, JSON.stringify(db));
    render();
  } catch (err) {
    alert("Delete failed: " + err.message);
  }
}
function deleteTrain(t) { deleteSample(t && t.id); }
function openPickType(eventId) { view.page = "pickType"; view.eventId = eventId; render(); }
function addTrain(eventId, trainKind) {
  const noise = (trainKind || "").startsWith("noise");
  const blank = trainKind === "blank";
  const stat = (trainKind || "").endsWith("static");
  const next = nextSampleNo(eventId, noise);
  const t = {
    id: uid("t"), eventId, pouch: String(next), sampleNo: next, trainKind: trainKind || "airborne_personal",
    contaminantId: noise ? "NOISE" : "", pumpSerial: "", dosimeterSerial: "", headId: "",
    mediaId: "", startFlow: "", endFlow: "", desiredVolumeL: "", minMinutes: "",
    mode: stat ? "static" : "personal",
    person: { first: "", last: "", sex: "", dob: "", occupation: "", company: "", hours: "", daysOn: "", daysOff: "" },
    rpd: { worn: "", model: "", shaven: "", fit: "" },
    hpd: { worn: "", model: "", style: "", classRating: "" },
    location: "", startAt: "", endAt: "", status: "prepped", comments: "",
    rejectReason: "", rejectCode: "", photo: "",
    audit: [{ at: nowIso(), action: "Created", detail: trainKind || "" }]
  };
  db.trains.push(t);
  save();
  openTrain(t.id);
}

function createEvent() {
  let projectId = document.getElementById("np").value;
  const num = document.getElementById("nnum").value.trim();
  const name = document.getElementById("nname").value.trim();
  if (num) {
    let p = db.projects.find(x => x.number === num);
    if (!p) { p = { id: uid("p"), number: num, name: name || num, site: name }; db.projects.push(p); }
    projectId = p.id;
  }
  const p = project(projectId);
  const siblings = db.events.filter(e => e.eventId === projectId || e.projectId === projectId);
  const n = String(siblings.length + 1).padStart(3, "0");
  const ev = { id: uid("e"), projectId, type: (document.getElementById("ntype")||{}).value || "hygiene", code: `${p.number}-${n}`, stage: "planned", date: document.getElementById("ndate").value, notes: "", uploadReady: false };
  db.events.push(ev);
  save();
  openEvent(ev.id);
}

function exportEvent(eventId) {
  const ev = eventById(eventId);
  const trains = trainsOf(eventId).map(t => ({
    ...t,
    avgFlow: avgFlow(t),
    runtimeMinutes: runtimeMinutes(t),
    volumeLitres: volumeLitres(t),
    flowCheck: flowCheck(t)
  }));
  const blob = new Blob([JSON.stringify({ event: ev, project: project(ev.projectId), trains }, null, 2)], { type: "application/json" });
  download(blob, ev.code + "-ENVSS-Field.json");
}
function exportCsv(eventId) {
  const ev = eventById(eventId);
  const rows = [["event","pouch","trainKind","status","code","contaminant","pump","dosimeter","cassette","media","mode","who_or_where","sex","start","stop","minutes","startFlow","endFlow","avgFlow","volume_L","rejectCode","rejectReason","rpdWorn","hpdWorn","comments"]];
  trainsOf(eventId).forEach(t => {
    const who = isStatic(t) ? t.location : [t.person.first, t.person.last].filter(Boolean).join(" ");
    const c = contam(t.contaminantId);
    rows.push([ev.code, t.pouch, t.trainKind || "", t.status, c?.code || "", c?.name || "", t.pumpSerial || "", t.dosimeterSerial || "", t.headId, t.mediaId, t.mode, who, t.person?.sex || "", t.startAt, t.endAt, runtimeMinutes(t) ?? "", t.startFlow, t.endFlow, avgFlow(t) ?? "", volumeLitres(t) ?? "", t.rejectCode || "", t.rejectReason, t.rpd?.worn || "", t.hpd?.worn || "", t.comments]);
  });
  const csv = rows.map(r => r.map(x => `"${String(x??"").replace(/"/g,'""')}"`).join(",")).join("\n");
  download(new Blob([csv], { type: "text/csv" }), ev.code + "-ENVSS-Field.csv");
}
function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

window.leaveSample = leaveSample;
window.openEvent = openEvent;
window.openTrain = openTrain;
window.goDash = goDash;
window.openNewEvent = openNewEvent;
window.openPickType = openPickType;
window.addTrain = addTrain;
window.deleteSample = deleteSample;
window.deleteTrain = deleteTrain;

let recHold = null;
function startSpeech() {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const box = document.getElementById("comments");
  const btn = document.getElementById("btnSpeak");
  const bars = document.getElementById("micBars");
  if (!Rec || !box) { alert("Voice to text is not available in this browser. Use Chrome."); return; }
  if (recHold) {
    recHold.stop();
    recHold = null;
    stopMicUi(btn, bars);
    return;
  }
  const r = new Rec();
  recHold = r;
  r.lang = "en-AU";
  r.continuous = true;
  r.interimResults = true;
  if (btn) { btn.classList.add("live"); btn.innerHTML = tickSvg(); }
  if (bars) { bars.hidden = false; startMicBars(bars); }
  let finalText = "";
  r.onresult = ev => {
    let interim = "";
    for (let i = 0; i < ev.results.length; i++) {
      const piece = ev.results[i][0].transcript;
      if (ev.results[i].isFinal) {
        if (i >= (r._finalCount || 0)) finalText += (finalText ? " " : "") + piece;
      } else interim += piece;
    }
    r._finalCount = [...ev.results].filter(x => x.isFinal).length;
    const base = box.dataset.base || "";
    box.value = [base, finalText, interim].filter(Boolean).join(" ").replace(/\s+/g, " ");
  };
  r.onstart = () => { box.dataset.base = box.value || ""; finalText = ""; r._finalCount = 0; };
  r.onend = () => {
    recHold = null;
    stopMicUi(btn, bars);
    box.dispatchEvent(new Event("change"));
  };
  r.onerror = () => { recHold = null; stopMicUi(btn, bars); };
  r.start();
}
window.openProject = openProject;
window.openEditEvent = openEditEvent;
window.markEventUpload = markEventUpload;
window.exportEvent = exportEvent;
window.exportCsv = exportCsv;
window.changeOperator = changeOperator;

function changeOperator() {
  signOut();
}
function ensureOperator() {
  paintLogin();
}
function signOut() {
  localStorage.removeItem(WHO_KEY);
  paintLogin();
  render();
}
function hasGoogle() {
  return !!(window.ENVSS_CONFIG && window.ENVSS_CONFIG.googleClientId);
}
function paintLogin() {
  const gate = document.getElementById("loginGate");
  if (!gate) return;
  if (getOperator()) {
    gate.classList.add("hidden");
    return;
  }
  gate.classList.remove("hidden");
  const slot = document.getElementById("googleBtn");
  if (hasGoogle() && window.google && window.google.accounts && slot && !slot.dataset.ready) {
    slot.dataset.ready = "1";
    window.google.accounts.id.initialize({
      client_id: window.ENVSS_CONFIG.googleClientId,
      callback: onGoogleCredential,
      hd: window.ENVSS_CONFIG.allowedDomain,
      auto_select: true
    });
    window.google.accounts.id.renderButton(slot, { theme: "outline", size: "large", width: 280, text: "signin_with" });
  }
}
function onGoogleCredential(resp) {
  try {
    const payload = JSON.parse(atob(resp.credential.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (!allowedEmail(payload.email)) {
      alert("Use your @" + window.ENVSS_CONFIG.allowedDomain + " Google account.");
      return;
    }
    setOperator(payload.name || payload.email, { email: payload.email, source: "google" });
    paintLogin();
    render();
  } catch (e) {
    alert("Sign-in failed. Try again.");
  }
}
function manualLogin() {
  const name = document.getElementById("manualName")?.value.trim();
  const email = document.getElementById("manualEmail")?.value.trim();
  if (!name) { alert("Enter your name."); return; }
  if (hasGoogle() && email && !allowedEmail(email)) {
    alert("Use an @" + window.ENVSS_CONFIG.allowedDomain + " address.");
    return;
  }
  setOperator(name, { email, source: "manual" });
  paintLogin();
  render();
}
window.onGoogleCredential = onGoogleCredential;
window.manualLogin = manualLogin;
window.signOut = signOut;
window.changeOperator = changeOperator;

window.addEventListener("online", setOnline);
window.addEventListener("offline", setOnline);
ensureOperator();
render();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

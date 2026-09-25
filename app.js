const KEY = "envss-field-v03";

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
  projects: [{ id: "p1900", number: "001900", name: "Demo – Perth site", site: "Perth" }],
  events: [{ id: "e1900-001", projectId: "p1900", code: "001900-001", stage: "prepped", date: new Date().toISOString().slice(0,10), notes: "" }],
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
let view = { page: "dash", filter: "all", eventId: null, trainId: null };

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
function save() {
  localStorage.setItem(KEY, JSON.stringify(db));
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
  if (!ts.length) return "planned";
  if (ts.some(t => t.status === "running")) return "active";
  if (ts.every(t => ["uploaded"].includes(t.status))) return "uploaded";
  if (ts.every(t => ["ended", "uploaded", "rejected", "fault", "field_blank"].includes(t.status))) return "complete";
  if (ts.every(t => ["prepped", "rejected", "fault", "field_blank"].includes(t.status))) return "prepped";
  return ev.stage || "planned";
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

function badge(status) {
  const label = ({
    planned: "Planned", prepped: "Prepped", active: "Active", complete: "Complete",
    uploaded: "Uploaded", running: "Running", ended: "Sample ended", rejected: "Rejected",
    field_blank: "Field blank", fault: "Fault"
  })[status] || status;
  return `<span class="badge s-${status}">${label}</span>`;
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
  if (view.page === "dash") root.innerHTML = dashHtml();
  else if (view.page === "event") root.innerHTML = eventHtml();
  else if (view.page === "train") root.innerHTML = trainHtml();
  else if (view.page === "newEvent") root.innerHTML = newEventHtml();
  else if (view.page === "pickType") root.innerHTML = pickTypeHtml();
  bind();
}

function dashHtml() {
  const list = db.events
    .map(e => ({ ...e, stageNow: deriveEventStage(e) }))
    .filter(e => view.filter === "all" || e.stageNow === view.filter);
  return `
    <div class="wrap">
      <div class="row">
        <h2 class="brand-type" style="margin:0;color:var(--navy)">Events</h2>
        <button class="btn orange" onclick="openNewEvent()">New event</button>
      </div>
      <div class="filters">
        ${["all","planned","prepped","active","complete","uploaded"].map(s =>
          `<button class="chip ${view.filter===s?"on":""}" data-filter="${s}">${s==="all"?"All":s}</button>`
        ).join("")}
      </div>
      ${list.length ? list.map(e => {
        const p = project(e.projectId);
        const n = trainsOf(e.id).length;
        return `<div class="card" onclick="openEvent('${e.id}')" style="cursor:pointer">
          <div class="row">
            <div class="grow">
              <div class="brand-type" style="font-weight:700;color:var(--navy);font-size:18px">${e.code}</div>
              <div class="muted">${p ? p.name : ""} · ${e.date || ""} · ${n} sample train${n===1?"":"s"}</div>
            </div>
            ${badge(e.stageNow)}
          </div>
        </div>`;
      }).join("") : `<div class="empty">No events in this filter.</div>`}
      <p class="muted">Data stays on this device until you export. Signed in as ${esc(whoText())} — <button class="btn ghost" onclick="changeOperator()">Change operator</button></p>
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
          <div class="muted">${p ? p.number + " · " + p.name : ""}</div>
          <h2 class="brand-type" style="margin:4px 0;color:var(--navy)">${ev.code}</h2>
        </div>
        ${badge(deriveEventStage(ev))}
      </div>
      <div class="row" style="margin:10px 0">
        <button class="btn ghost" onclick="goDash()">Dashboard</button>
        <button class="btn mid" onclick="openPickType('${ev.id}')">Add sample</button>
        <button class="btn green" onclick="exportEvent('${ev.id}')">Export JSON</button>
        <button class="btn ghost" onclick="exportCsv('${ev.id}')">Export CSV</button>
      </div>
      ${eventListHtml(ts)}
      ${deletionLogHtml(ev.id)}
    </div>`;
}
function trainRowHtml(t) {
  const c = contam(t.contaminantId);
  const who = isStatic(t)
    ? (t.location || "Static — location not set")
    : ([t.person?.first, t.person?.last].filter(Boolean).join(" ") || "Person not attached");
  const kit = isNoise(t) ? (t.dosimeterSerial || "no badge") : isBlank(t) ? (t.headId || "no head") : ((t.pumpSerial || "no pump") + " · " + (t.headId || "no head"));
  return `<div class="train" onclick="openTrain('${t.id}')">
    <div class="pouch">${sampleNoOf(t) || "–"}</div>
    <div>
      <div><strong>${displayNo(t)}</strong> · ${kindLabel(t)}${c && !isNoise(t) ? " · " + c.code : ""} · ${kit}</div>
      <div class="muted">${who} ${t.startAt ? "· start " + fmtTime(t.startAt) : ""} ${t.endAt ? "· stop " + fmtTime(t.endAt) : ""}</div>
    </div>
    ${badge(t.status)}
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
      <button class="btn ghost" onclick="openEvent('${t.eventId}')">← ${ev ? ev.code : "Event"}</button>
      <div class="row" style="margin-top:10px">
        <h2 class="brand-type" style="margin:0;color:var(--navy)">${displayNo(t)}</h2>
        ${badge(t.status)}
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
          ${isBlank(t) || isNoise(t) ? `<p class="muted">${isBlank(t) ? "Field blank is not started. No flow or volume." : "Noise trains have no pump flow or cassette volume."}</p>` : `
          <label>Start flow (L/min)</label>
          <input id="startFlow" value="${esc(t.startFlow)}" inputmode="decimal">
          <label>End flow (L/min)</label>
          <input id="endFlow" value="${esc(t.endFlow)}" inputmode="decimal">
          <label>Average flow (L/min)</label>
          <input value="${avg == null ? "—" : avg.toFixed(3)}" disabled>
          <label>Runtime (minutes)</label>
          <input value="${mins == null ? "—" : mins.toFixed(1)}" disabled>
          <label>Volume sampled (L)</label>
          <input value="${vol == null ? "—" : vol.toFixed(1)}" disabled>
          <label>Desired / method minimum volume (L)</label>
          <input id="desiredVolume" value="${esc(t.desiredVolumeL || c?.desiredVolumeL || "")}" inputmode="decimal">
          <label>Method minimum minutes</label>
          <input id="minMinutes" value="${esc(t.minMinutes || c?.minMinutes || "")}" inputmode="decimal">`}
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
      ${t.startLoc ? `<p class="help">Start location ±${Math.round(t.startLoc.acc || 0)} m</p>` : ""}
      ${t.endLoc ? `<p class="help">Stop location ±${Math.round(t.endLoc.acc || 0)} m</p>` : ""}
      `}
      ${isBlank(t) ? "" : rejectBlockHtml(t)}
      <label class="check-row"><input type="checkbox" id="equipDamaged" ${t.equipDamaged ? "checked" : ""}> ENVSS equipment damaged</label>
      <p class="help">Use this for kit that needs repair billed to the client. Does not reject the sample by itself.</p>
      <div id="equipBox" style="${t.equipDamaged ? "" : "display:none"}">
        <label>Photo (time-stamped in the audit log)</label>
        <input id="equipPhoto" type="file" accept="image/*" capture="environment">
        ${t.equipPhoto ? `<img alt="equipment" src="${t.equipPhoto}" style="max-width:220px;border-radius:8px">` : ""}
        <label>What was damaged</label>
        <input id="equipNote" value="${esc(t.equipNote || "")}" placeholder="Pump case, tubing, badge clip…">
      </div>
      ${isAirbornePersonal(t) ? rpdFields(t) : ""}
      ${isNoise(t) && !isStatic(t) ? hpdFields(t) : ""}
      <label>Comments</label>
      <div class="comment-wrap">
        <textarea id="comments">${esc(t.comments)}</textarea>
        <button type="button" class="mic-btn" id="btnSpeak" title="Voice to text" aria-label="Microphone">${micSvg()}</button>
      </div>
      <div class="mic-bars" id="micBars" hidden>${"<span></span>".repeat(12)}</div>
      <p class="help">Tap the microphone to start, tap again to stop.</p>
      <div class="footer-actions">
        ${isNoise(t) ? `<button class="btn ghost" id="btnAddPump">Add this dosimeter to fleet</button>` : isBlank(t) ? "" : `<button class="btn ghost" id="btnAddPump">Add this pump to fleet</button>`}
        ${isNoise(t) || isBlank(t) ? "" : `<button class="btn ghost" id="btnAddHead">Add this sample head</button>`}
        <button class="btn danger" id="btnDelete">Delete sample</button>
      </div>
      <h3 class="brand-type" style="color:var(--navy);margin-top:22px">Audit log</h3>
      ${audit.length ? `<div class="card">${audit.slice().reverse().map(a =>
        `<div class="muted" style="margin-bottom:6px">${fmtTime(a.at)} · ${esc(a.who || "")} · ${esc(a.action)}${a.detail ? " · " + esc(a.detail) : ""}</div>`
      ).join("")}</div>` : `<p class="muted">No edits yet.</p>`}
    </div>`;
}

function noiseRejects() {
  return [
    { code: "battery_fault", label: "Battery fault", photo: false },
    { code: "measurement_fault", label: "Measurement fault", photo: false }
  ];
}
function rejectList(t) { return isNoise(t) ? noiseRejects() : REJECTS; }
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
    <div><label>Date of birth</label><input id="dob" type="date" value="${esc(p.dob)}"></div>
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
  const on = r.worn === "yes";
  return `<label class="check-row"><input type="checkbox" id="rpdOn" ${on ? "checked" : ""}> Respirator worn</label>
    <p class="help">Personal airborne samples only. Tick if an RPD was worn.</p>
    <div id="rpdBox" style="${on ? "" : "display:none"}">
      <label>Brand / model</label>
      <input id="rpdModel" value="${esc(r.model)}" placeholder="3M 6000 or Unknown">
      <label>Clean-shaven</label>
      <select id="rpdShaven"><option value="">—</option>
        <option value="yes" ${r.shaven==="yes"?"selected":""}>Yes</option>
        <option value="no" ${r.shaven==="no"?"selected":""}>No</option>
        <option value="na" ${r.shaven==="na"?"selected":""}>NA</option>
      </select>
      <label>Fit-tested</label>
      <select id="rpdFit"><option value="">—</option>
        <option value="yes" ${r.fit==="yes"?"selected":""}>Yes</option>
        <option value="no" ${r.fit==="no"?"selected":""}>No</option>
        <option value="unknown" ${r.fit==="unknown"?"selected":""}>Unknown</option>
      </select>
    </div>`;
}
function hpdFields(t) {
  const h = t.hpd || {};
  const on = h.worn === "yes";
  return `<label class="check-row"><input type="checkbox" id="hpdOn" ${on ? "checked" : ""}> Hearing protection worn</label>
    <p class="help">Noise personal samples only. Tick if an HPD was worn.</p>
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
  const opts = db.projects.map(p => `<option value="${p.id}">${p.number} — ${p.name}</option>`).join("");
  return `<div class="wrap">
    <button class="btn ghost" onclick="goDash()">← Dashboard</button>
    <h2 class="brand-type" style="color:var(--navy)">New project event</h2>
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

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}

function audit(t, action, detail) {
  t.audit = t.audit || [];
  t.audit.push({ at: nowIso(), action, detail: detail || "", who: whoText() });
}

function bind() {
  document.querySelectorAll("[data-filter]").forEach(b => b.onclick = () => { view.filter = b.dataset.filter; render(); });
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
        audit(t, "Stop location", loc.lat.toFixed(5) + "," + loc.lng.toFixed(5) + " ±" + Math.round(loc.acc) + "m");
        save();
      });
    };
    const startBtn = document.getElementById("btnStart");
    if (startBtn) startBtn.onclick = () => {
      collectTrain(t);
      const prev = t.startAt;
      t.startAt = nowIso();
      t.status = "running";
      audit(t, "START pressed", prev ? `previous start ${fmtTime(prev)}` : "");
      save();
      captureLocation().then(loc => {
        if (!loc) { audit(t, "Start location", "no fix"); save(); return; }
        t.startLoc = loc;
        audit(t, "Start location", loc.lat.toFixed(5) + "," + loc.lng.toFixed(5) + " ±" + Math.round(loc.acc) + "m");
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
    el.addEventListener("change", () => {
      const before = snapshotTrain(t);
      collectTrain(t);
      if (snapshotTrain(t) !== before) {
        audit(t, "Field saved", el.id || el.name || "field");
        save();
      }
    });
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
    t.person.sex = g("sex")?.value || "";
  }
  t.rpd = {
    worn: g("rpdOn")?.checked ? "yes" : (t.rpd && t.rpd.worn === "yes" && !g("rpdOn") ? "yes" : "no"),
    model: g("rpdModel")?.value || "",
    shaven: g("rpdShaven")?.value || "",
    fit: g("rpdFit")?.value || ""
  };
  if (g("rpdOn")) t.rpd.worn = g("rpdOn").checked ? "yes" : "no";
  t.hpd = {
    worn: g("hpdOn")?.checked ? "yes" : "no",
    model: g("hpdModel")?.value || "",
    style: g("hpdStyle")?.value || "",
    classRating: g("hpdClass")?.value || ""
  };
  if (g("hpdOn")) t.hpd.worn = g("hpdOn").checked ? "yes" : "no";
  t.equipDamaged = !!(g("equipDamaged") && g("equipDamaged").checked);
  t.equipNote = g("equipNote")?.value || t.equipNote || "";
  if (g("startAt")) t.startAt = fromLocalInput(g("startAt").value) || t.startAt;
  if (g("endAt")) {
    const v = fromLocalInput(g("endAt").value);
    t.endAt = g("endAt").value ? v : t.endAt;
  }
  if (t.mode === "static") t.location = g("location")?.value || "";
  else {
    t.person = {
      first: g("first")?.value || "", last: g("last")?.value || "", dob: g("dob")?.value || "",
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

function openEvent(id) { view.page = "event"; view.eventId = id; render(); }
function openTrain(id) { view.page = "train"; view.trainId = id; render(); }
function goDash() { view.page = "dash"; render(); }
function openNewEvent() { view.page = "newEvent"; render(); }

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
function deleteTrain(t) {
  const ok = confirm("Delete " + displayNo(t) + "?\n\nThis cannot be undone on this device.");
  if (!ok) return;
  db.deletions = db.deletions || [];
  db.deletions.push({
    at: nowIso(),
    who: whoLabel(),
    eventId: t.eventId,
    trainId: t.id,
    pouch: t.pouch,
    kind: t.trainKind,
    detail: (contam(t.contaminantId)?.code || "") + " deleted"
  });
  db.trains = db.trains.filter(x => x.id !== t.id);
  save();
  openEvent(t.eventId);
}
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
  const ev = { id: uid("e"), projectId, code: `${p.number}-${n}`, stage: "planned", date: document.getElementById("ndate").value, notes: "" };
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

window.openEvent = openEvent;
window.openTrain = openTrain;
window.goDash = goDash;
window.openNewEvent = openNewEvent;
window.openPickType = openPickType;
window.addTrain = addTrain;

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
    if (btn) btn.classList.remove("live");
    if (bars) bars.hidden = true;
    return;
  }
  const r = new Rec();
  recHold = r;
  r.lang = "en-AU";
  r.continuous = true;
  r.interimResults = true;
  if (btn) btn.classList.add("live");
  if (bars) bars.hidden = false;
  r.onresult = ev => {
    let said = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) said += ev.results[i][0].transcript;
    if (said) box.value = (box.dataset.base || box.value.replace(/\s+$/, "") + " ").trimStart() + said;
  };
  r.onstart = () => { box.dataset.base = box.value; };
  r.onend = () => {
    recHold = null;
    if (btn) btn.classList.remove("live");
    if (bars) bars.hidden = true;
    box.dispatchEvent(new Event("change"));
  };
  r.onerror = () => { recHold = null; if (btn) btn.classList.remove("live"); if (bars) bars.hidden = true; };
  r.start();
}
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

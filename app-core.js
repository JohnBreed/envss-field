const KEY = "envss-field-v02";

const DEFAULT = {
  catalogs: {
    contaminants: [
      { id: "INH", name: "Inhalable dust", code: "INH", headHint: "IESS", flowTolPct: 10, defaultFlow: "2.0" },
      { id: "ASB", name: "Asbestos fibres", code: "ASB", headHint: "RESS", flowTolPct: 5, defaultFlow: "1.0" },
      { id: "SIL", name: "Respirable silica", code: "SIL", headHint: "RESS", flowTolPct: 5, defaultFlow: "2.2" },
      { id: "DP", name: "Diesel particulate", code: "DP", headHint: "DP", flowTolPct: 5, defaultFlow: "2.0" },
      { id: "WLD", name: "Welding fume", code: "WLD", headHint: "IESS", flowTolPct: 10, defaultFlow: "2.0" }
    ],
    pumps: [{ serial: "123456" }, { serial: "234567" }],
    heads: [{ id: "IESS01", kind: "inhalable" }, { id: "RESS001", kind: "respirable" }, { id: "DP01", kind: "diesel" }]
  },
  projects: [{ id: "p1900", number: "001900", name: "Demo – Perth site", site: "Perth" }],
  events: [{ id: "e1900-001", projectId: "p1900", code: "001900-001", stage: "prepped", date: new Date().toISOString().slice(0,10), notes: "" }],
  trains: []
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
function trainsOf(eventId) { return db.trains.filter(t => t.eventId === eventId).sort((a,b) => Number(a.pouch) - Number(b.pouch)); }
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
  if (ts.every(t => ["ended", "uploaded", "rejected"].includes(t.status))) return "complete";
  if (ts.every(t => t.status === "prepped" || t.status === "rejected")) return "prepped";
  return ev.stage || "planned";
}

function badge(status) {
  const label = ({
    planned: "Planned", prepped: "Prepped", active: "Active", complete: "Complete",
    uploaded: "Uploaded", running: "Running", ended: "Sample ended", rejected: "Rejected"
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
        <button class="btn mid" onclick="addTrain('${ev.id}')">Add sample train</button>
        <button class="btn green" onclick="exportEvent('${ev.id}')">Export JSON</button>
        <button class="btn ghost" onclick="exportCsv('${ev.id}')">Export CSV</button>
      </div>
      ${ts.map(t => {
        const c = contam(t.contaminantId);
        const who = t.mode === "static"
          ? (t.location || "Static — location not set")
          : ([t.person.first, t.person.last].filter(Boolean).join(" ") || "Person not attached");
        return `<div class="train" onclick="openTrain('${t.id}')">
          <div class="pouch">${t.pouch}</div>
          <div>
            <div><strong>${c ? c.code + " · " + c.name : "Contaminant"}</strong> · ${t.pumpSerial || "no pump"} · ${t.headId || "no cassette"}</div>
            <div class="muted">${who} ${t.startAt ? "· start " + fmtTime(t.startAt) : ""} ${t.endAt ? "· stop " + fmtTime(t.endAt) : ""}</div>
          </div>
          ${badge(t.status)}
        </div>`;
      }).join("") || `<div class="empty">No sample trains yet.</div>`}
    </div>`;
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
        <h2 class="brand-type" style="margin:0;color:var(--navy)">Sample train / pouch ${esc(t.pouch)}</h2>
        ${badge(t.status)}
      </div>
      <div class="grid2">
        <div>
          <label>Pouch number</label>
          <input id="pouch" value="${esc(t.pouch)}">
          <label>Contaminant</label>
          <div class="combo">
            <input id="contam" value="${esc(c ? c.code + " — " + c.name : "")}" placeholder="INH, SIL, DP, WLD, ASB">
            <div class="suggest" id="sug-contam"></div>
          </div>
          <label>Pump serial</label>
          <div class="combo">
            <input id="pump" value="${esc(t.pumpSerial)}" placeholder="Type serial — fleet or hire">
            <div class="suggest" id="sug-pump"></div>
          </div>
          <label>Sampling cassette / head</label>
          <div class="combo">
            <input id="head" value="${esc(t.headId)}" placeholder="IESS… / RESS… / DP…">
            <div class="suggest" id="sug-head"></div>
          </div>
          <label>Media / filter ID (if different)</label>
          <input id="media" value="${esc(t.mediaId)}" placeholder="Lab number if not the cassette ID">
        </div>
        <div>
          <label>Start flow (L/min) — set to the intended flow</label>
          <input id="startFlow" value="${esc(t.startFlow)}" inputmode="decimal">
          <label>End flow (L/min)</label>
          <input id="endFlow" value="${esc(t.endFlow)}" inputmode="decimal">
          <label>Average flow (L/min)</label>
          <input value="${avg == null ? "—" : avg.toFixed(3)}" disabled>
          <label>Runtime (minutes)</label>
          <input value="${mins == null ? "—" : mins.toFixed(1)}" disabled>
          <label>Volume sampled (L)</label>
          <input value="${vol == null ? "—" : vol.toFixed(1)}" disabled>
          <label>Sample type</label>
          <select id="mode">
            <option value="personal" ${t.mode==="personal"?"selected":""}>Personal (worn)</option>
            <option value="static" ${t.mode==="static"?"selected":""}>Static (location)</option>
          </select>
        </div>
      </div>
      ${chk.pct != null ? `<p class="${chk.ok ? "muted" : ""}" style="${chk.ok ? "" : "color:var(--danger);font-weight:700"}">
        End flow is ${chk.pct.toFixed(1)}% from start. Tolerance for ${c ? c.code : "this method"} is ±${chk.tol}% (${c?.code === "INH" || c?.code === "WLD" ? "inhalable 10%" : "respirable / fibre / DPM 5%"}).
        ${chk.ok ? "Within tolerance." : "Outside tolerance — reject unless you have a documented reason."}
      </p>` : `<p class="muted">Tolerance check runs when both start and end flow are entered. INH / WLD ±10%. SIL / DP / ASB ±5%. Confirm against the method if this is wrong.</p>`}
      <div id="modeFields">${modeFields(t)}</div>
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
      <p class="muted">If someone hits START or STOP by mistake, change the times above and Save. That write is kept in the audit log.</p>
      <label>Comments</label>
      <textarea id="comments">${esc(t.comments)}</textarea>
      <label>Reject reason</label>
      <input id="rejectReason" value="${esc(t.rejectReason)}" placeholder="Flow out of tolerance, damaged cassette, unused…">
      <div class="footer-actions">
        <button class="btn" id="btnSave">Save changes</button>
        <button class="btn ghost" id="btnAddPump">Add this pump to fleet</button>
        <button class="btn ghost" id="btnAddHead">Add this cassette</button>
        <button class="btn danger" id="btnReject">Reject sample</button>
        ${t.status==="rejected"?`<button class="btn ghost" id="btnUnreject">Clear reject</button>`:""}
        ${t.status==="ended"?`<button class="btn green" id="btnUploaded">Mark uploaded</button>`:""}
      </div>
      <h3 class="brand-type" style="color:var(--navy);margin-top:22px">Audit log</h3>
      ${audit.length ? `<div class="card">${audit.slice().reverse().map(a =>
        `<div class="muted" style="margin-bottom:6px">${fmtTime(a.at)} · ${esc(a.who || "")} · ${esc(a.action)}${a.detail ? " · " + esc(a.detail) : ""}</div>`
      ).join("")}</div>` : `<p class="muted">No edits yet.</p>`}
    </div>`;
}

function modeFields(t) {
  if (t.mode === "static") {
    return `<label>Static location</label><input id="location" value="${esc(t.location)}" placeholder="e.g. Crusher west">`;
  }
  const p = t.person || {};
  return `<div class="grid2">
    <div><label>First name</label><input id="first" value="${esc(p.first)}"></div>
    <div><label>Last name</label><input id="last" value="${esc(p.last)}"></div>
    <div><label>Date of birth</label><input id="dob" type="date" value="${esc(p.dob)}"></div>
    <div><label>Occupation</label><input id="occupation" value="${esc(p.occupation)}"></div>
    <div><label>Company / contractor</label><input id="company" value="${esc(p.company)}"></div>
    <div><label>Hours / shift</label><input id="hours" value="${esc(p.hours)}"></div>
    <div><label>Days on</label><input id="daysOn" value="${esc(p.daysOn)}"></div>
    <div><label>Days off</label><input id="daysOff" value="${esc(p.daysOff)}"></div>
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


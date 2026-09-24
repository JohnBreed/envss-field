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
        <button class="btn mid" onclick="openPickType('${ev.id}')">Add sample train</button>
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
            <div><strong>${kindLabel(t)} · ${c ? c.code + " · " + c.name : "—"}</strong> · ${t.trainKind && t.trainKind.startsWith("noise") ? (t.dosimeterSerial || "no badge") : ((t.pumpSerial || "no pump") + " · " + (t.headId || "no cassette"))}</div>
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
      <p class="muted">${kindLabel(t)}</p>
      <input type="hidden" id="mode" value="${esc(t.mode || "personal")}">
      <div class="grid2">
        <div>
          <label>Pouch number</label>
          <input id="pouch" value="${esc(t.pouch)}">
          <label>Contaminant</label>
          <div class="combo">
            <input id="contam" value="${esc(c ? c.code + " — " + c.name : "")}" placeholder="${isNoise(t) ? "NOISE" : "INH, SIL, DP, WLD, ASB"}">
            <div class="suggest" id="sug-contam"></div>
          </div>
          ${isNoise(t) ? `
          <label>Dosimeter serial</label>
          <div class="combo">
            <input id="dosimeter" value="${esc(t.dosimeterSerial)}" placeholder="Badge serial">
            <div class="suggest" id="sug-dosimeter"></div>
          </div>` : isBlank(t) ? `
          <label>Sampling cassette / head</label>
          <div class="combo">
            <input id="head" value="${esc(t.headId)}" placeholder="IESS… / RESS… / DP…">
            <div class="suggest" id="sug-head"></div>
          </div>
          <label>Media / filter ID (if different)</label>
          <input id="media" value="${esc(t.mediaId)}">` : `
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
      ${isAirbornePersonal(t) ? rpdFields(t) : ""}
      ${isNoise(t) ? hpdFields(t) : ""}
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
      <p class="muted">Accidental START/STOP: edit the times and Save. Logged in the audit trail.</p>`}
      <label>Comments</label>
      <textarea id="comments">${esc(t.comments)}</textarea>
      <button type="button" class="btn ghost" id="btnSpeak">Speak comment</button>
      <label>Reject reason</label>
      <div class="filters" id="rejectChips">
        ${REJECTS.map(r => `<button type="button" class="chip ${t.rejectCode===r.code?"on":""}" data-rej="${r.code}">${r.label}</button>`).join("")}
      </div>
      <input id="rejectReason" value="${esc(t.rejectReason)}" placeholder="Extra detail if Other">
      ${t.rejectCode === "damaged_filter" ? `<label>Photo of damage (optional)</label>
        <input id="photo" type="file" accept="image/*" capture="environment">
        ${t.photo ? `<p class="muted">A photo is saved on this device.</p><img alt="damage" src="${t.photo}" style="max-width:220px;border-radius:8px">` : ""}` : ""}
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
  return `<h3 class="brand-type" style="color:var(--navy)">Respirator</h3>
    <label>Respirator worn</label>
    <select id="rpdWorn"><option value="">—</option>
      <option value="yes" ${r.worn==="yes"?"selected":""}>Yes</option>
      <option value="no" ${r.worn==="no"?"selected":""}>No</option>
    </select>
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
    </select>`;
}
function hpdFields(t) {
  const h = t.hpd || {};
  return `<h3 class="brand-type" style="color:var(--navy)">Hearing protection</h3>
    <label>HPD worn</label>
    <select id="hpdWorn"><option value="">—</option>
      <option value="yes" ${h.worn==="yes"?"selected":""}>Yes</option>
      <option value="no" ${h.worn==="no"?"selected":""}>No</option>
      <option value="unknown" ${h.worn==="unknown"?"selected":""}>Unknown</option>
    </select>
    <label>Brand / model</label>
    <input id="hpdModel" value="${esc(h.model)}" placeholder="Brand model or Unknown">
    <label>Style</label>
    <input id="hpdStyle" value="${esc(h.style)}" placeholder="earmuff / earplug">
    <label>Class / attenuation</label>
    <input id="hpdClass" value="${esc(h.classRating)}" placeholder="if known">`;
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
    <h2 class="brand-type" style="color:var(--navy)">Add sample train</h2>
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
        c = { id: code || uid("c"), name: val, code: code || val.slice(0,3).toUpperCase(), headHint: "", flowTolPct: 5, defaultFlow: "2.0" };
        db.catalogs.contaminants.push(c);
      }
      t.contaminantId = c.id;
    });
    wireCombo("pump", (db.catalogs.pumps || []).map(p => p.serial), (val) => { t.pumpSerial = val.trim(); });
    wireCombo("head", (db.catalogs.heads || []).map(h => h.id), (val) => { t.headId = val.trim().toUpperCase(); });
    wireCombo("dosimeter", (db.catalogs.dosimeters || []).map(d => d.serial), (val) => { t.dosimeterSerial = val.trim(); });
    wireCombo("occupation", db.catalogs.occupations || [], (val) => { t.person = t.person || {}; t.person.occupation = val; });
    document.querySelectorAll("[data-rej]").forEach(b => b.onclick = () => {
      t.rejectCode = b.dataset.rej;
      t.rejectReason = REJECTS.find(r => r.code === t.rejectCode)?.label || t.rejectReason;
      save();
    });
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
    };
    const startBtn = document.getElementById("btnStart");
    if (startBtn) startBtn.onclick = () => {
      collectTrain(t);
      const prev = t.startAt;
      t.startAt = nowIso();
      t.status = "running";
      audit(t, "START pressed", prev ? `previous start ${fmtTime(prev)}` : "");
      save();
    };
    document.getElementById("btnSave").onclick = () => {
      const beforeStart = t.startAt, beforeEnd = t.endAt;
      collectTrain(t);
      if (t.startAt !== beforeStart) audit(t, "Start time edited", `${fmtTime(beforeStart)} → ${fmtTime(t.startAt)}`);
      if (t.endAt !== beforeEnd) audit(t, "Stop time edited", `${fmtTime(beforeEnd)} → ${fmtTime(t.endAt)}`);
      audit(t, "Saved");
      save();
      alert("Saved on this device.");
    };
    document.getElementById("btnReject").onclick = () => {
      collectTrain(t);
      if (!t.rejectReason.trim()) {
        alert("Enter a reject reason first.");
        return;
      }
      t.status = "rejected";
      audit(t, "Rejected", t.rejectReason);
      save();
    };
    const ur = document.getElementById("btnUnreject");
    if (ur) ur.onclick = () => { collectTrain(t); t.status = t.endAt ? "ended" : (t.startAt ? "running" : "prepped"); audit(t, "Reject cleared"); save(); };
    const up = document.getElementById("btnUploaded");
    if (up) up.onclick = () => { collectTrain(t); t.status = "uploaded"; audit(t, "Marked uploaded"); save(); };
    document.getElementById("btnAddPump").onclick = () => {
      collectTrain(t);
      if (t.pumpSerial && !db.catalogs.pumps.some(p => p.serial === t.pumpSerial)) {
        db.catalogs.pumps.push({ serial: t.pumpSerial }); audit(t, "Pump added to fleet", t.pumpSerial); save();
        alert("Pump " + t.pumpSerial + " added to fleet list.");
      }
    };
    document.getElementById("btnAddHead").onclick = () => {
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

function collectTrain(t) {
  const g = id => document.getElementById(id);
  t.pouch = g("pouch")?.value || t.pouch;
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
    worn: g("rpdWorn")?.value || "",
    model: g("rpdModel")?.value || "",
    shaven: g("rpdShaven")?.value || "",
    fit: g("rpdFit")?.value || ""
  };
  t.hpd = {
    worn: g("hpdWorn")?.value || "",
    model: g("hpdModel")?.value || "",
    style: g("hpdStyle")?.value || "",
    classRating: g("hpdClass")?.value || ""
  };
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

function openPickType(eventId) { view.page = "pickType"; view.eventId = eventId; render(); }
function addTrain(eventId, trainKind) {
  const existing = trainsOf(eventId);
  const next = String((existing.map(t => Number(t.pouch) || 0).sort((a,b)=>b-a)[0] || 0) + 1);
  const noise = (trainKind || "").startsWith("noise");
  const blank = trainKind === "blank";
  const stat = (trainKind || "").endsWith("static");
  const t = {
    id: uid("t"), eventId, pouch: next, trainKind: trainKind || "airborne_personal",
    contaminantId: noise ? "NOISE" : "INH", pumpSerial: "", dosimeterSerial: "", headId: "",
    mediaId: "", startFlow: blank || noise ? "" : "2.0", endFlow: "", desiredVolumeL: "", minMinutes: "",
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

function startSpeech() {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const box = document.getElementById("comments");
  if (!Rec || !box) { alert("Voice to text is not available in this browser. Use Chrome."); return; }
  const r = new Rec();
  r.lang = "en-AU";
  r.interimResults = false;
  r.onresult = ev => {
    const said = ev.results[0][0].transcript;
    box.value = (box.value ? box.value + " " : "") + said;
  };
  r.onerror = () => alert("Could not hear that. Check the microphone and try again.");
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

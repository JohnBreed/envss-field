/* v35 AFM sample screen */
window.ENVSS_FIBRE = "35";

const FORM_PAGES = { newProject: 1, newEvent: 1 };
function formTyping() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = (el.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}
if (!window._envssPullWrapped) {
  window._envssPullWrapped = true;
  const _pullRemote = pullRemote;
  pullRemote = async function () {
    const page = view && view.page;
    if (FORM_PAGES[page] || formTyping()) {
      try {
        if (typeof sbCfg === "function" && !sbCfg()) { window._envssSync = "off"; return; }
        const [projects, events, trains, deletions] = await Promise.all([
          sbGet("envss_projects"), sbGet("envss_events"), sbGet("envss_trains"), sbGet("envss_deletions")
        ]);
        window._envssSync = "ok";
        const gone = new Set((deletions || []).map(r => r.payload && r.payload.trainId).filter(Boolean));
        db.projects = mergeById(db.projects, projects);
        db.events = mergeById(db.events, events);
        db.trains = mergeById(db.trains, trains).filter(t => !gone.has(t.id));
        db.deletions = mergeById(db.deletions, deletions);
        db.syncedAt = new Date().toISOString();
        localStorage.setItem(KEY, JSON.stringify(db));
      } catch (e) {
        window._envssSync = "err";
      }
      return;
    }
    return _pullRemote();
  };
}

function toggleFibreEventFields() {
  const type = (document.getElementById("ntype") || {}).value;
  const fibre = type === "fibre";
  const box = document.getElementById("fibreEventFields");
  const multi = document.getElementById("hygieneMultiWrap");
  if (box) box.style.display = fibre ? "" : "none";
  if (multi) multi.style.display = fibre ? "none" : "";
}

newEventHtml = function () {
  const p = project(view.projectId);
  return `<div class="wrap">
    <button class="btn ghost" onclick="openProject('${view.projectId || ""}')">← Project events</button>
    <h2 class="brand-type" style="color:var(--navy)">New event</h2>
    <p class="muted">${p ? p.number + " · " + (p.name || "") : ""}</p>
    <label>Event type</label>
    <select id="ntype" onchange="toggleFibreEventFields()">
      <option value="hygiene">Hygiene event</option>
      <option value="fibre">Airborne fibre monitoring</option>
    </select>
    <label>Event date</label>
    <input id="ndate" type="date" value="${new Date().toISOString().slice(0, 10)}">
    <div id="fibreEventFields" style="display:none">
      <label>Monitoring type</label>
      <select id="nprotocol">
        <option value="background">Background</option>
        <option value="control">Control</option>
        <option value="clearance">Clearance</option>
      </select>
      <label>Task being monitored</label>
      <input id="ntask" placeholder="Earthworks — not the monitoring type">
      <label>Lab turnaround</label>
      <select id="ntat">
        <option value="next_0700">Next day 07:00</option>
        <option value="same_day">Same day</option>
        <option value="emergency">Emergency</option>
      </select>
    </div>
    <div id="hygieneMultiWrap">
      <label class="check-row"><input type="checkbox" id="nmulti"> Multiple days / shifts (mine trip)</label>
      <p class="help">Hygiene only.</p>
    </div>
    <div class="footer-actions"><button class="btn orange" id="btnCreateEv">Create event</button></div>
  </div>`;
};

const _createEventFix = createEvent;
createEvent = function () {
  const typeEl = document.getElementById("ntype");
  const type = (typeEl && typeEl.value) || "hygiene";
  if (type !== "fibre") return _createEventFix();
  const projectId = view.projectId;
  const p = project(projectId);
  if (!p) { alert("Open a project first."); return; }
  const date = document.getElementById("ndate").value;
  const siblings = db.events.filter(e => e.projectId === projectId && e.type === "fibre");
  const n = String(siblings.length + 1).padStart(3, "0");
  const ev = {
    id: uid("e"), projectId, type, stage: "planned", date,
    code: fibreEventCode(p, date, n),
    multiDay: false, notes: "", uploadReady: false, operators: [],
    protocol: (document.getElementById("nprotocol") && document.getElementById("nprotocol").value) || "background",
    taskDesc: (document.getElementById("ntask") && document.getElementById("ntask").value) || "",
    rotameter: "",
    tat: (document.getElementById("ntat") && document.getElementById("ntat").value) || "next_0700"
  };
  db.events.push(ev);
  save();
  openEvent(ev.id);
};

const _openPickType = openPickType;
openPickType = function (eventId) {
  const ev = eventById(eventId);
  if (ev && ev.type === "fibre") { addTrain(eventId, "fibre_static"); return; }
  return _openPickType(eventId);
};

const _avgFlow = avgFlow;
avgFlow = function (t) {
  if (isFibreTrain(t)) {
    const a = num(t.startFlow), b = num(t.endFlow);
    if (a == null || b == null) return null;
    return (a + b) / 2;
  }
  return _avgFlow(t);
};

function fibreLiveMinutes(t) {
  if (!t || !t.startAt) return null;
  const start = new Date(t.startAt);
  const end = t.endAt ? new Date(t.endAt) : new Date();
  const ms = end - start;
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / 60000;
}
function fibreVolume(t) {
  if (!t || isBlank(t)) return null;
  const start = num(t.startFlow);
  if (start == null) return null;
  const mins = fibreLiveMinutes(t);
  if (mins == null) return null;
  const end = num(t.endFlow);
  if (t.endAt && end != null) return mins * ((start + end) / 2);
  if (t.status === "running") return mins * start;
  return null;
}
const _volumeLitres = volumeLitres;
volumeLitres = function (t) {
  if (isFibreTrain(t)) {
    const v = fibreVolume(t);
    return v == null ? null : Math.round(v * 10) / 10;
  }
  return _volumeLitres(t);
};

const _rejectList = rejectList;
rejectList = function (t) {
  if (isFibreTrain(t)) {
    return [
      { code: "pump_fault", label: "Pump failure", photo: false },
      { code: "damaged_filter", label: "Filter failure", photo: false }
    ];
  }
  return _rejectList(t);
};

function toggleFibreBlank() {
  const t = db.trains.find(x => x.id === view.trainId);
  if (!t || !isFibreTrain(t)) return;
  const on = !!(document.getElementById("fibreBlank") && document.getElementById("fibreBlank").checked);
  collectTrain(t);
  if (on) {
    t.trainKind = "blank";
    t.mode = "blank";
    if (!trainsOf(t.eventId).some(x => x.id !== t.id && isBlank(x) && sampleNoOf(x) === 0) && !t.startAt) {
      t.sampleNo = 0; t.pouch = "0";
    }
  } else {
    t.trainKind = "fibre_static";
    t.mode = "static";
    if (!t.startFlow) t.startFlow = "2.0";
  }
  save();
  render();
}

fibreTrainHtml = function (t, ev) {
  const running = t.status === "running";
  const blank = isBlank(t);
  const proto = t.monitorType || (ev && ev.protocol) || "background";
  const cowl = cowlDigits(t.cowlNo || t.mediaId);
  const avg = (num(t.startFlow) != null && num(t.endFlow) != null) ? avgFlow(t) : null;
  const vol = (t.endAt && num(t.endFlow) != null) ? volumeLitres(t) : (running ? volumeLitres(t) : null);
  const mins = fibreLiveMinutes(t);
  const volWarn = (!blank && t.endAt && vol != null && vol < 360)
    ? `<p class="help">Volume ${vol} L is under 360 L. Limit of detection rises to 0.01 f/mL.</p>` : "";
  const protoOpts = [["background","Background"],["control","Control"],["clearance","Clearance"]]
    .map(([v,l]) => `<option value="${v}" ${proto===v?"selected":""}>${l}</option>`).join("");
  return `<div class="wrap">
      <button class="btn ghost" onclick="leaveSample('${t.id}','${t.eventId}')">← ${ev ? ev.code : "Event"}</button>
      <div class="row" style="margin-top:10px">
        <h2 class="brand-type" style="margin:0;color:var(--navy)">${displayNo(t)}</h2>
        ${badge(displayStatus(t))}
      </div>
      <label class="check-row"><input type="checkbox" id="fibreBlank" ${blank ? "checked" : ""} onchange="toggleFibreBlank()"> Field blank</label>
      <label>Cowl number</label>
      <div class="row"><span class="muted" style="padding-top:10px">ENVSS</span>
        <input id="cowlNo" class="grow" inputmode="numeric" value="${esc(cowl)}" placeholder="11850">
      </div>
      <p class="help">Digits only. Printed as ENVSS + number. Never reused.</p>
      ${blank ? `<p class="help">Field blank — pump, times and volume stay n/a.</p>` : `
      <label>Pump serial</label>
      <input id="pump" value="${esc(t.pumpSerial)}" placeholder="Type serial">
      <div class="suggest" id="sug-pump"></div>
      <label>Location</label>
      <input id="location" value="${esc(t.location)}" placeholder="1- North Eastern Boundary">
      <label>Monitoring type</label>
      <select id="monitorType">${protoOpts}</select>
      <label>Start flow (L/min)</label>
      <input id="startFlow" inputmode="decimal" value="${esc(t.startFlow || "2.0")}">
      <div class="footer-actions" style="margin:12px 0">
        <button class="btn orange lg" id="btnStart" ${running || t.status==="rejected" ? "disabled" : ""}>START</button>
      </div>
      <div class="footer-actions" style="margin:0 0 12px">
        <button class="btn mid lg" id="btnStop" ${t.status!=="running" ? "disabled" : ""}>STOP</button>
      </div>
      <label>End flow (L/min)</label>
      <input id="endFlow" inputmode="decimal" value="${esc(t.endFlow)}">
      <div class="grid2">
        <label>Average flow</label>
        <input value="${avg != null ? Number(avg).toFixed(1) : ""}" disabled>
        <label>Volume (L)</label>
        <input value="${vol != null ? vol : ""}" disabled>
      </div>
      <p class="muted">${mins != null ? Math.round(mins) + " min" : ""} ${t.startAt ? " · start " + fmtTime(t.startAt) : ""} ${t.endAt ? " · stop " + fmtTime(t.endAt) : ""}</p>
      ${volWarn}
      <div class="grid2">
        <label>Start time</label>
        <input id="startAt" type="time" value="${esc(toLocalInput(t.startAt))}">
        <label>Stop time</label>
        <input id="endAt" type="time" value="${esc(toLocalInput(t.endAt))}">
      </div>`}
      ${rejectBlockHtml(t)}
      <div class="footer-actions">
        <button class="btn ghost" id="btnDelete">Delete sample</button>
      </div>
    </div>`;
};

const _startGaps = startGaps;
startGaps = function (t) {
  if (isFibreTrain(t)) {
    const miss = [];
    if (!(t.cowlNo || t.mediaId)) miss.push("Cowl number");
    if (isBlank(t)) return miss;
    if (!t.pumpSerial) miss.push("Pump serial");
    if (!t.startFlow) miss.push("Start flow");
    if (!t.location) miss.push("Location");
    return miss;
  }
  return _startGaps(t);
};

const _summaryLine = summaryLine;
summaryLine = function (t) {
  if (!isFibreTrain(t)) return _summaryLine(t);
  if (isBlank(t)) return cowlDisplay(t) || "Field blank";
  const mins = fibreLiveMinutes(t);
  const live = t.status === "running";
  const run = live && mins != null
    ? Math.round(mins) + " min · ~" + Math.round(mins * (num(t.startFlow) || 0)) + " L"
    : (mins != null ? Math.round(mins) + " min" : "");
  const vol = fibreVolume(t);
  const volBit = (!live && vol != null) ? Math.round(vol) + " L" : "";
  return [dash(t.location), t.startAt ? "start " + fmtTime(t.startAt) : "", t.endAt ? "stop " + fmtTime(t.endAt) : "", run, volBit].filter(Boolean).join(" · ");
};

const _titleLine = titleLine;
titleLine = function (t) {
  if (!isFibreTrain(t)) return _titleLine(t);
  const proto = (t.monitorType || "").replace(/^./, c => c.toUpperCase());
  return [displayNo(t), proto || "AFM", cowlDisplay(t) || "no cowl", isBlank(t) ? "Field blank" : dash(t.pumpSerial)].filter(Boolean).join(" · ");
};

if (!window._fibreTick) {
  window._fibreTick = setInterval(function () {
    if (document.hidden) return;
    if (view.page !== "event") return;
    const ev = eventById(view.eventId);
    if (!ev || !isFibreEvent(ev)) return;
    if (!trainsOf(ev.id).some(t => t.status === "running")) return;
    render();
  }, 60000);
}

if (!window._eventHtmlV35) window._eventHtmlV35 = eventHtml;
eventHtml = function () {
  const ev = eventById(view.eventId);
  if (!ev || !isFibreEvent(ev)) return window._eventHtmlV35();
  const p = project(ev.projectId);
  const ts = trainsOf(ev.id);
  return `<div class="wrap">
      <div class="row">
        <div class="grow">
          <div class="muted" onclick="openEditEvent('${ev.id}')" style="cursor:pointer">${p ? p.number + " · " + p.name : ""} · tap to edit</div>
          <h2 class="brand-type" style="margin:4px 0;color:var(--navy)">${ev.code}</h2>
          <div class="muted">${eventTypeLabel(ev)} · ${esc(ev.protocol || "background")} · ${esc(ev.date || "")}</div>
          ${ev.taskDesc ? `<div class="muted">${esc(ev.taskDesc)}</div>` : ""}
        </div>
        ${badge(deriveEventStage(ev))}
      </div>
      <div class="row" style="margin:10px 0">
        <button class="btn ghost" onclick="openProject('${ev.projectId}')">Dashboard</button>
        <button class="btn mid" onclick="openPickType('${ev.id}')">Add sample</button>
        <button class="btn green" onclick="markEventUpload('${ev.id}')">Upload event</button>
      </div>
      ${eventListHtml(ts)}
      ${deletionLogHtml(ev.id)}
      <p class="help">ENVSS Field v35 · AFM · running times refresh each minute</p>
    </div>`;
};

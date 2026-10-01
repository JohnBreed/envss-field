/* AFM fibre overlay — loaded after hygiene app.js. Storage key unchanged. */
try { APP_VERSION; } catch (e) {}
window.ENVSS_FIBRE = "33";

const FORM_PAGES = { newProject: 1, newEvent: 1 };
function formTyping() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = (el.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}
const _pullRemote = pullRemote;
pullRemote = async function() {
  const page = view && view.page;
  if (FORM_PAGES[page] || (formTyping() && page !== "train")) {
    const c = typeof sbCfg === "function" ? sbCfg() : null;
    if (!c) { window._envssSync = "off"; return; }
    try {
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
      // do not render — would wipe the form
    } catch (e) {
      window._envssSync = "err";
    }
    return;
  }
  return _pullRemote();
};


function nextFibreSampleNo(eventId, blank) {
  const ts = trainsOf(eventId);
  if (blank && !ts.some(t => isBlank(t) && sampleNoOf(t) === 0)) return 0;
  const n = ts.map(sampleNoOf);
  return (n.sort((a,b)=>b-a)[0] || 0) + 1;
}
function fibreEventCode(p, date, seq) {
  const d = String(date || "").replace(/-/g, "");
  return "ENVSS-HYG-AFM-" + (p.number || "") + "-" + seq + (d ? "-" + d : "");
}
function cowlDisplay(t) {
  const raw = String(t.cowlNo || t.mediaId || "").replace(/^ENVSS/i, "").replace(/\D/g, "");
  return raw ? "ENVSS" + raw : "";
}
function cowlDigits(v) {
  return String(v || "").replace(/^ENVSS/i, "").replace(/\D/g, "");
}
function isFibreEvent(ev) { return ev && ev.type === "fibre"; }
function isFibreTrain(t) {
  if (!t) return false;
  if ((t.trainKind || "").startsWith("fibre")) return true;
  return isFibreEvent(eventById(t.eventId));
}

const _kindLabel = kindLabel;
kindLabel = function(t) {
  return ({
    airborne_personal: "Airborne · personal",
    airborne_static: "Airborne · static",
    blank: "Field blank",
    fibre_static: "AFM · static",
    fibre_operator: "AFM · operator",
    noise_personal: "Noise · personal",
    noise_static: "Noise · static"
  })[t.trainKind || ""] || _kindLabel(t);
};

const _isStatic = isStatic;
isStatic = function(t) {
  if (isFibreTrain(t) && t.trainKind !== "fibre_operator") return true;
  return _isStatic(t);
};

const _startGaps = startGaps;
startGaps = function(t) {
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

const _optionalGaps = optionalGaps;
optionalGaps = function(t) {
  if (isFibreTrain(t)) {
    if (isBlank(t)) return [];
    const miss = [];
    if (t.status === "ended" && !t.endFlow) miss.push("End flow");
    return miss;
  }
  return _optionalGaps(t);
};

const _personComplete = personComplete;
personComplete = function(t) {
  if (isFibreTrain(t)) return true;
  return _personComplete(t);
};

const _followUpComplete = followUpComplete;
followUpComplete = function(t) {
  if (isBlank(t) && isFibreTrain(t)) return !!(t.cowlNo || t.mediaId);
  return _followUpComplete(t);
};

const _summaryLine = summaryLine;
summaryLine = function(t) {
  if (isFibreTrain(t)) {
    if (isBlank(t)) return cowlDisplay(t) || "Field blank";
    return [dash(t.location), t.role || "", t.startAt ? "start " + fmtTime(t.startAt) : "", t.endAt ? "stop " + fmtTime(t.endAt) : "", runPhrase(t)].filter(Boolean).join(" · ");
  }
  return _summaryLine(t);
};

const _titleLine = titleLine;
titleLine = function(t) {
  if (isFibreTrain(t)) {
    const proto = (t.monitorType || "").replace(/^./, c => c.toUpperCase());
    return [displayNo(t), proto || "AFM", cowlDisplay(t) || "no cowl", isBlank(t) ? "Field blank" : dash(t.pumpSerial)].filter(Boolean).join(" · ");
  }
  return _titleLine(t);
};

const _eventHtml = eventHtml;
eventHtml = function() {
  const ev = eventById(view.eventId);
  if (!ev || !isFibreEvent(ev)) return _eventHtml();
  const p = project(ev.projectId);
  const ts = trainsOf(ev.id);
  return `
    <div class="wrap">
      <div class="row">
        <div class="grow">
          <div class="muted" onclick="openEditEvent('${ev.id}')" style="cursor:pointer">${p ? p.number + " · " + p.name : ""} · tap to edit</div>
          <h2 class="brand-type" style="margin:4px 0;color:var(--navy)">${ev.code}</h2>
          <div class="muted">${eventTypeLabel(ev)} · ${esc(ev.protocol || "background")}</div>
          ${ev.taskDesc ? `<div class="muted">${esc(ev.taskDesc)}</div>` : ""}
          ${ev.rotameter ? `<div class="muted">Rotameter ${esc(ev.rotameter)}</div>` : ""}
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
      <p class="help">ENVSS Field v31 · AFM</p>
    </div>`;
};

const _trainHtml = trainHtml;
trainHtml = function() {
  const t = db.trains.find(x => x.id === view.trainId);
  if (!t) return `<div class="wrap">Missing sample train.</div>`;
  const ev = eventById(t.eventId);
  if (isFibreEvent(ev) || isFibreTrain(t)) return fibreTrainHtml(t, ev);
  return _trainHtml();
};

function fibreTrainHtml(t, ev) {
  const running = t.status === "running";
  const mins = runtimeMinutes(t);
  const avg = avgFlow(t);
  const vol = volumeLitres(t);
  const chk = flowCheck(t);
  const proto = t.monitorType || (ev && ev.protocol) || "background";
  const cowl = cowlDigits(t.cowlNo || t.mediaId);
  return `
    <div class="wrap">
      <button class="btn ghost" onclick="leaveSample('${t.id}','${t.eventId}')">← ${ev ? ev.code : "Event"}</button>
      <div class="row" style="margin-top:10px">
        <h2 class="brand-type" style="margin:0;color:var(--navy)">${displayNo(t)}</h2>
        ${badge(displayStatus(t))}
      </div>
      <label>Sample type</label>
      <select id="trainKind">${trainKindOptions(t)}</select>
      <label>Monitoring type</label>
      <select id="monitorType">
        ${[["background","Background"],["control","Control"],["clearance","Clearance"]].map(([v,l]) =>
          `<option value="${v}" ${proto===v?"selected":""}>${l}</option>`).join("")}
      </select>
      <label>Cowl number</label>
      <div class="row"><span class="muted" style="padding-top:10px">ENVSS</span>
        <input id="cowlNo" class="grow" inputmode="numeric" value="${esc(cowl)}" placeholder="11850">
      </div>
      <p class="help">Type digits only. Printed as ENVSS + number. Never reused.</p>
      ${isBlank(t) ? `<p class="help">Field blank — pump, times and volume stay n/a.</p>` : `
      <label>Location point</label>
      <input id="location" value="${esc(t.location)}" placeholder="1- North Eastern Boundary">
      <label>Role / operator (optional, no names)</label>
      <input id="role" value="${esc(t.role || "")}" placeholder="excavator operator">
      <label>Pump serial</label>
      <input id="pump" value="${esc(t.pumpSerial)}" placeholder="Type serial">
      <div class="suggest" id="sug-pump"></div>
      <div class="grid2">
        <label>Start flow (L/min)</label>
        <input id="startFlow" inputmode="decimal" value="${esc(t.startFlow)}">
        <label>End flow (L/min)</label>
        <input id="endFlow" inputmode="decimal" value="${esc(t.endFlow)}">
      </div>
      <div class="grid2">
        <label>Average flow</label>
        <input value="${avg != null ? Number(avg).toFixed(1) : ""}" disabled>
        <label>Volume (L)</label>
        <input value="${vol != null ? vol : ""}" disabled>
      </div>
      <div class="grid2">
        <label>Start time</label>
        <input id="startAt" type="time" value="${esc(toLocalInput(t.startAt))}">
        <label>Stop time</label>
        <input id="endAt" type="time" value="${esc(toLocalInput(t.endAt))}">
      </div>
      <p class="muted">${mins != null ? Math.round(mins) + " min" : ""} ${t.startedBy ? " · started " + esc(t.startedBy) : ""} ${t.stoppedBy ? " · stopped " + esc(t.stoppedBy) : ""}</p>
      ${chk.pct != null && !chk.ok ? `<p class="help">End flow is ${chk.pct.toFixed(1)}% from start (tolerance ±5%).</p>` : ""}
      `}
      <label>Shift date</label>
      <input id="shiftDate" type="date" value="${esc(t.shiftDate || (ev && ev.date) || "")}">
      <label>Comments</label>
      <textarea id="comments">${esc(t.comments || "")}</textarea>
      ${rejectBlockHtml(t)}
      <div class="footer-actions">
        ${isBlank(t) ? "" : `<button class="btn orange lg" id="btnStart" ${running||t.status==="rejected"?"disabled":""}>START</button>
        <button class="btn mid lg" id="btnStop" ${t.status==="rejected"?"disabled":""}>STOP</button>`}
        <button class="btn ghost" id="btnDelete">Delete sample</button>
      </div>
    </div>`;
}

const _pickTypeHtml = pickTypeHtml;
pickTypeHtml = function() {
  const ev = eventById(view.eventId);
  if (!isFibreEvent(ev)) return _pickTypeHtml();
  const opts = [
    ["fibre_static", "Static sample", "Boundary / enclosure location. Cowl, pump, flow, start/stop."],
    ["fibre_operator", "Operator sample", "On plant or a role. Role text only — no names."],
    ["blank", "Field blank", "Sample 0. Cowl only. Pump and times n/a."]
  ];
  return `<div class="wrap">
    <button class="btn ghost" onclick="openEvent('${view.eventId}')">← ${ev ? ev.code : "Event"}</button>
    <h2 class="brand-type" style="color:var(--navy)">Add sample</h2>
    ${opts.map(([id, title, blurb]) => `<div class="card" style="cursor:pointer" onclick="addTrain('${view.eventId}','${id}')">
      <strong>${title}</strong><div class="muted">${blurb}</div>
    </div>`).join("")}
  </div>`;
};

function toggleFibreEventFields() {
  const type = (document.getElementById("ntype") || {}).value;
  const box = document.getElementById("fibreEventFields");
  if (box) box.style.display = type === "fibre" ? "" : "none";
}
const _newEventHtml = newEventHtml;
newEventHtml = function() {
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
    <input id="ndate" type="date" value="${new Date().toISOString().slice(0,10)}">
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
    <label class="check-row"><input type="checkbox" id="nmulti"> Multiple days / shifts (mine trip)</label>
    <p class="help">Hygiene: date and multi-day only. AFM: type, task and lab turnaround. Rotameter is captured on the sample, not here.</p>
    <div class="footer-actions"><button class="btn orange" id="btnCreateEv">Create event</button></div>
  </div>`;
};

const _editEventHtml = editEventHtml;
editEventHtml = function() {
  const html = _editEventHtml();
  const ev = eventById(view.eventId);
  if (!ev || !isFibreEvent(ev)) return html;
  const extra = `
    <label>Monitoring type</label>
    <select id="eprotocol">
      ${[["background","Background"],["control","Control"],["clearance","Clearance"]].map(([v,l]) =>
        `<option value="${v}" ${(ev.protocol||"background")===v?"selected":""}>${l}</option>`).join("")}
    </select>
    <label>Task being monitored</label>
    <input id="etask" value="${esc(ev.taskDesc || "")}">
    <label>Rotameter serial</label>
    <input id="erota" value="${esc(ev.rotameter || "")}">
    <label>Lab turnaround</label>
    <select id="etat">
      ${[["next_0700","Next day 07:00"],["same_day","Same day"],["emergency","Emergency"]].map(([v,l]) =>
        `<option value="${v}" ${(ev.tat||"next_0700")===v?"selected":""}>${l}</option>`).join("")}
    </select>`;
  return html.replace("<label>Notes</label>", extra + "<label>Notes</label>");
};

const _trainKindOptions = trainKindOptions;
trainKindOptions = function(t) {
  if (isFibreTrain(t) || (t.trainKind || "").startsWith("fibre")) {
    const cur = t.trainKind || "fibre_static";
    return [
      ["fibre_static", "AFM · static"],
      ["fibre_operator", "AFM · operator"],
      ["blank", "Field blank"]
    ].map(([id, label]) => `<option value="${id}" ${cur===id?"selected":""}>${label}</option>`).join("");
  }
  return _trainKindOptions(t);
};

const _addTrain = addTrain;
addTrain = function(eventId, trainKind) {
  const ev = eventById(eventId) || {};
  const fibre = ev.type === "fibre" || (trainKind || "").startsWith("fibre");
  if (!fibre) return _addTrain(eventId, trainKind);
  const blank = trainKind === "blank";
  const next = nextFibreSampleNo(eventId, blank);
  const t = {
    id: uid("t"), eventId, pouch: String(next), sampleNo: next,
    trainKind: trainKind || "fibre_static",
    contaminantId: "ASB", pumpSerial: "", dosimeterSerial: "", headId: "",
    mediaId: "", cowlNo: "", role: "", monitorType: ev.protocol || "background",
    filterDia: "22.1",
    startFlow: blank ? "" : "2.0", endFlow: "", desiredVolumeL: "", minMinutes: "",
    mode: blank ? "blank" : (trainKind === "fibre_operator" ? "personal" : "static"),
    person: { first: "", last: "", sex: "not_stated", dob: "", occupation: "", company: "", hours: "", daysOn: "", daysOff: "" },
    rpd: { worn: "", model: "", shaven: "", fit: "" },
    hpd: { worn: "", model: "", style: "", classRating: "" },
    location: "", startAt: "", endAt: "", status: "prepped", comments: "",
    shiftDate: ev.date || "", shiftKind: "day",
    rejectReason: "", rejectCode: "", photo: "",
    audit: [{ at: nowIso(), action: "Created", detail: trainKind || "" }]
  };
  db.trains.push(t);
  save();
  openTrain(t.id);
};

const _createEvent = createEvent;
createEvent = function() {
  const projectId = view.projectId;
  const p = project(projectId);
  if (!p) { alert("Open a project first."); return; }
  const type = (document.getElementById("ntype")||{}).value || "hygiene";
  if (type !== "fibre") return _createEvent();
  const date = document.getElementById("ndate").value;
  const siblings = db.events.filter(e => e.projectId === projectId && e.type === "fibre");
  const n = String(siblings.length + 1).padStart(3, "0");
  const ev = {
    id: uid("e"), projectId, type, stage: "planned", date,
    code: fibreEventCode(p, date, n),
    multiDay: !!(document.getElementById("nmulti")||{}).checked, notes: "", uploadReady: false, operators: [],
    protocol: document.getElementById("nprotocol")?.value || "background",
    taskDesc: document.getElementById("ntask")?.value || "",
    rotameter: "",
    tat: document.getElementById("ntat")?.value || "next_0700",
    minesAct: !!(document.getElementById("nmines")||{}).checked
  };
  db.events.push(ev);
  save();
  openEvent(ev.id);
};

const _saveEventEdits = saveEventEdits;
saveEventEdits = function() {
  const ev = eventById(view.eventId);
  if (!ev || !isFibreEvent(ev)) return _saveEventEdits();
  _saveEventEdits();
  ev.protocol = document.getElementById("eprotocol")?.value || ev.protocol;
  ev.taskDesc = document.getElementById("etask")?.value || "";
  ev.rotameter = document.getElementById("erota")?.value || "";
  ev.tat = document.getElementById("etat")?.value || ev.tat;
  const p = project(ev.projectId);
  const fibreN = db.events.filter(x => x.projectId === ev.projectId && x.type === "fibre");
  const seq = String(Math.max(1, fibreN.findIndex(x => x.id === ev.id) + 1)).padStart(3, "0");
  ev.code = fibreEventCode(p, ev.date, seq);
  saveQuiet();
  openEvent(ev.id);
};

const _collectTrain = collectTrain;
collectTrain = function(t) {
  _collectTrain(t);
  const g = id => document.getElementById(id);
  if (g("cowlNo")) {
    t.cowlNo = cowlDigits(g("cowlNo").value);
    t.mediaId = cowlDisplay(t);
  }
  if (g("monitorType")) t.monitorType = g("monitorType").value;
  if (g("role")) t.role = g("role").value.trim();
  if (g("location") && isFibreTrain(t)) t.location = g("location").value;
};

const _markEventUpload = markEventUpload;
markEventUpload = function(id) {
  const ev = eventById(id);
  if (ev && isFibreEvent(ev)) {
    const bad = trainsOf(id).filter(t => {
      if (isBlank(t)) return !(t.cowlNo || t.mediaId);
      if (t.status === "running" || t.status === "prepped") return true;
      return false;
    });
    if (bad.length) {
      alert("This event cannot be uploaded until all samples are complete.\nIncomplete: " + bad.map(displayNo).join(", "));
      return;
    }
  }
  return _markEventUpload(id);
};

const _bind = bind;
bind = function() {
  _bind();
  const t = db.trains.find(x => x.id === view.trainId);
  if (view.page === "train" && t && isFibreTrain(t)) {
    const startBtn = document.getElementById("btnStart");
    if (startBtn) {
      const prev = startBtn.onclick;
      startBtn.onclick = function() {
        if (typeof prev === "function") prev();
        t.startedBy = [t.startedBy, whoText()].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join("; ");
      };
    }
    const stopBtn = document.getElementById("btnStop");
    if (stopBtn) {
      const prev = stopBtn.onclick;
      stopBtn.onclick = function() {
        if (typeof prev === "function") prev();
        t.stoppedBy = [t.stoppedBy, whoText()].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join("; ");
      };
    }
  }
};

if (typeof render === "function") render();

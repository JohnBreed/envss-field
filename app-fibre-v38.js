window.ENVSS_FIBRE = "38";
window.ENVSS_EVENT_ADMINS = ["john@envss.com.au"];

function operatorEmail() {
  const o = typeof getOperator === "function" ? getOperator() : null;
  return String((o && o.email) || "").toLowerCase();
}
function canDeleteEvent() {
  return (window.ENVSS_EVENT_ADMINS || []).indexOf(operatorEmail()) !== -1;
}
function isAfmEvent(ev) {
  if (!ev) return false;
  if (ev.type === "fibre") return true;
  return String(ev.code || "").indexOf("AFM") !== -1;
}
function addAfmSample(eventId) {
  addTrain(eventId, "fibre_static");
}
function deleteEvent(id) {
  if (!canDeleteEvent()) {
    alert("Only an admin can delete an event.");
    return;
  }
  const ev = eventById(id);
  if (!ev) return;
  if (!confirm("Delete event " + ev.code + " and all of its samples? This cannot be undone on this device.")) return;
  const trains = trainsOf(id).slice();
  db.deletions = db.deletions || [];
  trains.forEach(function (t) {
    db.deletions.push({ id: t.id, trainId: t.id, at: nowIso(), who: whoText(), eventId: id, reason: "event deleted" });
  });
  db.trains = db.trains.filter(function (t) { return t.eventId !== id; });
  db.events = db.events.filter(function (e) { return e.id !== id; });
  db.deletions.push({ id: ev.id, eventId: id, at: nowIso(), who: whoText(), reason: "event deleted" });
  save();
  openProject(ev.projectId);
}

openPickType = function (eventId) {
  const ev = eventById(eventId);
  if (isAfmEvent(ev)) { addAfmSample(eventId); return; }
  view.page = "pickType"; view.eventId = eventId; render();
};

createEvent = function () {
  const projectId = view.projectId;
  const p = project(projectId);
  if (!p) { alert("Open a project first."); return; }
  const type = (document.getElementById("ntype") && document.getElementById("ntype").value) || "hygiene";
  if (type !== "fibre") {
    const date = document.getElementById("ndate").value;
    const siblings = db.events.filter(function (e) { return e.projectId === projectId && e.type !== "fibre"; });
    const n = String(siblings.length + 1).padStart(3, "0");
    const ev = {
      id: uid("e"), projectId: projectId, type: type, stage: "planned", date: date,
      code: p.number + "-" + n,
      multiDay: !!(document.getElementById("nmulti") || {}).checked,
      notes: "", uploadReady: false, operators: []
    };
    db.events.push(ev); save(); openEvent(ev.id); return;
  }
  const date = document.getElementById("ndate").value;
  const siblings = db.events.filter(function (e) { return e.projectId === projectId && e.type === "fibre"; });
  const n = String(siblings.length + 1).padStart(3, "0");
  const ev = {
    id: uid("e"), projectId: projectId, type: "fibre", stage: "planned", date: date,
    code: fibreEventCode(p, date, n),
    multiDay: false, notes: "", uploadReady: false, operators: [],
    protocol: (document.getElementById("nprotocol") && document.getElementById("nprotocol").value) || "background",
    taskDesc: (document.getElementById("ntask") && document.getElementById("ntask").value) || "",
    rotameter: "",
    tat: (document.getElementById("ntat") && document.getElementById("ntat").value) || "next_0700"
  };
  db.events.push(ev);
  db.trains.push({
    id: uid("t"), eventId: ev.id, pouch: "0", sampleNo: 0,
    trainKind: "blank", contaminantId: "ASB", pumpSerial: "", mediaId: "", cowlNo: "",
    monitorType: ev.protocol, filterDia: "22.1", startFlow: "", endFlow: "", mode: "blank",
    person: { first: "", last: "", sex: "not_stated", dob: "", occupation: "", company: "", hours: "", daysOn: "", daysOff: "" },
    rpd: { worn: "", model: "", shaven: "", fit: "" },
    hpd: { worn: "", model: "", style: "", classRating: "" },
    location: "", startAt: "", endAt: "", status: "prepped", comments: "",
    shiftDate: ev.date || "", rejectReason: "", rejectCode: "", photo: "",
    audit: [{ at: nowIso(), action: "Created", detail: "field blank" }]
  });
  save();
  openEvent(ev.id);
};

newEventHtml = function () {
  const p = project(view.projectId);
  return "<div class=\"wrap\"><button class=\"btn ghost\" onclick=\"openProject('" + (view.projectId || "") + "')\">\u2190 Project events</button>" +
    "<h2 class=\"brand-type\" style=\"color:var(--navy)\">New event</h2>" +
    "<p class=\"muted\">" + (p ? p.number + " · " + (p.name || "") : "") + "</p>" +
    "<label>Event type</label><select id=\"ntype\" onchange=\"toggleFibreEventFields()\">" +
    "<option value=\"hygiene\">Hygiene event</option><option value=\"fibre\">Airborne fibre monitoring</option></select>" +
    "<label>Event date</label><input id=\"ndate\" type=\"date\" value=\"" + new Date().toISOString().slice(0,10) + "\">" +
    "<div id=\"fibreEventFields\" style=\"display:none\">" +
    "<label>Monitoring type</label><select id=\"nprotocol\"><option value=\"background\">Background</option><option value=\"control\">Control</option><option value=\"clearance\">Clearance</option></select>" +
    "<label>Task being monitored</label><input id=\"ntask\" placeholder=\"Earthworks\">" +
    "<label>Lab turnaround</label><select id=\"ntat\"><option value=\"next_0700\">Next day 07:00</option><option value=\"same_day\">Same day</option><option value=\"emergency\">Emergency</option></select></div>" +
    "<div id=\"hygieneMultiWrap\"><label class=\"check-row\"><input type=\"checkbox\" id=\"nmulti\"> Multiple days / shifts (mine trip)</label></div>" +
    "<div class=\"footer-actions\"><button class=\"btn orange\" id=\"btnCreateEv\">Create event</button></div></div>";
};
function toggleFibreEventFields() {
  const fibre = (document.getElementById("ntype") || {}).value === "fibre";
  const box = document.getElementById("fibreEventFields");
  const multi = document.getElementById("hygieneMultiWrap");
  if (box) box.style.display = fibre ? "" : "none";
  if (multi) multi.style.display = fibre ? "none" : "";
}

avgFlow = function (t) {
  if (isFibreTrain(t)) {
    const a = num(t.startFlow), b = num(t.endFlow);
    if (a == null || b == null) return null;
    return (a + b) / 2;
  }
  const a = num(t.startFlow), b = num(t.endFlow);
  if (a == null && b == null) return null;
  if (a == null) return b;
  if (b == null) return a;
  return (a + b) / 2;
};
function fibreLiveMinutes(t) {
  if (!t || !t.startAt) return null;
  const start = new Date(t.startAt);
  const end = t.endAt ? new Date(t.endAt) : new Date();
  const ms = end - start;
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / 60000;
}
volumeLitres = function (t) {
  if (!isFibreTrain(t)) {
    const mins = runtimeMinutes(t), q = avgFlow(t);
    if (mins == null || q == null) return null;
    return mins * q;
  }
  if (isBlank(t)) return null;
  const start = num(t.startFlow);
  if (start == null) return null;
  const mins = fibreLiveMinutes(t);
  if (mins == null) return null;
  const end = num(t.endFlow);
  if (t.endAt && end != null) return Math.round(mins * ((start + end) / 2) * 10) / 10;
  return null;
};
rejectList = function (t) {
  if (isFibreTrain(t)) return [{ code: "pump_fault", label: "Pump failure", photo: false }, { code: "damaged_filter", label: "Filter failure", photo: false }];
  return isNoise(t) ? noiseRejects() : REJECTS;
};
startGaps = function (t) {
  if (!isFibreTrain(t)) {
    const miss = [];
    if (!t.pumpSerial && !isNoise(t) && !isBlank(t)) miss.push("Pump serial");
    return miss;
  }
  const miss = [];
  if (!(t.cowlNo || t.mediaId)) miss.push("Cowl number");
  if (isBlank(t)) return miss;
  if (!t.pumpSerial) miss.push("Pump serial");
  if (!t.startFlow) miss.push("Start flow");
  if (!t.location) miss.push("Location");
  return miss;
};

trainHtml = function () {
  const t = db.trains.find(function (x) { return x.id === view.trainId; });
  if (!t) return "<div class=\"wrap\">Missing sample.</div>";
  const ev = eventById(t.eventId);
  if (isAfmEvent(ev) || isFibreTrain(t)) return fibreTrainHtml(t, ev);
  return window._trainHtmlCore ? window._trainHtmlCore() : "<div class=\"wrap\">Sample</div>";
};
if (!window._trainHtmlCore) window._trainHtmlCore = function () { return "<div class=\"wrap\">Open from event list.</div>"; };

fibreTrainHtml = function (t, ev) {
  try {
    const running = t.status === "running";
    const blank = isBlank(t);
    const proto = t.monitorType || (ev && ev.protocol) || "background";
    const cowl = cowlDigits(t.cowlNo || t.mediaId);
    const avg = (num(t.startFlow) != null && num(t.endFlow) != null) ? avgFlow(t) : null;
    const vol = (t.endAt && num(t.endFlow) != null) ? volumeLitres(t) : null;
    const mins = fibreLiveMinutes(t);
    const volWarn = (!blank && t.endAt && vol != null && vol < 360) ? ("<p class=\"help\">Volume " + vol + " L is under 360 L. Limit of detection rises to 0.01 f/mL.</p>") : "";
    const protoOpts = [["background","Background"],["control","Control"],["clearance","Clearance"]].map(function (x) {
      return "<option value=\"" + x[0] + "\" " + (proto === x[0] ? "selected" : "") + ">" + x[1] + "</option>";
    }).join("");
    var html = "<div class=\"wrap\">";
    html += "<button class=\"btn ghost\" onclick=\"leaveSample('" + t.id + "','" + t.eventId + "')\">\u2190 " + (ev ? ev.code : "Event") + "</button>";
    html += "<div class=\"row\" style=\"margin-top:10px\"><h2 class=\"brand-type\" style=\"margin:0;color:var(--navy)\">" + displayNo(t) + "</h2>" + badge(displayStatus(t)) + "</div>";
    if (!blank) html += "<label>Monitoring type</label><select id=\"monitorType\">" + protoOpts + "</select>";
    html += "<label>Cowl number</label><div class=\"row\"><span class=\"muted\" style=\"padding-top:10px\">ENVSS</span><input id=\"cowlNo\" class=\"grow\" inputmode=\"numeric\" value=\"" + esc(cowl) + "\" placeholder=\"11850\"></div>";
    html += "<p class=\"help\">Digits only. Printed as ENVSS + number.</p>";
    if (blank) {
      html += "<p class=\"help\">Field blank — pump, times and volume stay n/a.</p>";
    } else {
      html += "<label>Pump serial</label><input id=\"pump\" value=\"" + esc(t.pumpSerial) + "\" placeholder=\"Type serial\"><div class=\"suggest\" id=\"sug-pump\"></div>";
      html += "<label>Location</label><input id=\"location\" value=\"" + esc(t.location) + "\" placeholder=\"1- North Eastern Boundary\">";
      html += "<label>Start flow (L/min)</label><input id=\"startFlow\" inputmode=\"decimal\" value=\"" + esc(t.startFlow || "2.0") + "\">";
      html += "<div class=\"row\" style=\"margin:12px 0;gap:10px;align-items:end\"><button class=\"btn orange lg\" id=\"btnStart\" " + (running || t.status === "rejected" ? "disabled" : "") + ">START</button>";
      html += "<div class=\"grow\"><label>Start time</label><input id=\"startAt\" type=\"time\" value=\"" + esc(toLocalInput(t.startAt)) + "\"></div></div>";
      html += "<div class=\"row\" style=\"margin:0 0 12px;gap:10px;align-items:end\"><button class=\"btn mid lg\" id=\"btnStop\" " + (t.status !== "running" ? "disabled" : "") + ">STOP</button>";
      html += "<div class=\"grow\"><label>Stop time</label><input id=\"endAt\" type=\"time\" value=\"" + esc(toLocalInput(t.endAt)) + "\"></div></div>";
      html += "<label>End flow (L/min)</label><input id=\"endFlow\" inputmode=\"decimal\" value=\"" + esc(t.endFlow) + "\">";
      html += "<div class=\"grid2\"><label>Average flow</label><input value=\"" + (avg != null ? Number(avg).toFixed(1) : "") + "\" disabled><label>Volume (L)</label><input value=\"" + (vol != null ? vol : "") + "\" disabled></div>";
      html += "<p class=\"muted\">" + (mins != null ? Math.round(mins) + " min" : "") + "</p>" + volWarn;
    }
    html += rejectBlockHtml(t);
    html += "<div class=\"footer-actions\"><button class=\"btn ghost\" id=\"btnDelete\">Delete sample</button></div></div>";
    return html;
  } catch (err) {
    return "<div class=\"wrap\"><p>Could not open sample. " + esc(String(err && err.message || err)) + "</p><button class=\"btn ghost\" onclick=\"openEvent('" + (t && t.eventId || "") + "')\">Back</button></div>";
  }
};

eventHtml = function () {
  const ev = eventById(view.eventId);
  if (!ev) return "<div class=\"wrap\">Missing event.</div>";
  if (!isAfmEvent(ev)) {
    const p = project(ev.projectId);
    const ts = trainsOf(ev.id);
    var h = "<div class=\"wrap\"><div class=\"muted\">" + (p ? p.number + " · " + p.name : "") + "</div>";
    h += "<h2 class=\"brand-type\" style=\"color:var(--navy)\">" + ev.code + "</h2>";
    h += "<div class=\"row\" style=\"margin:10px 0\"><button class=\"btn ghost\" onclick=\"openProject('" + ev.projectId + "')\">Dashboard</button>";
    h += "<button class=\"btn mid\" onclick=\"openPickType('" + ev.id + "')\">Add sample</button></div>";
    h += eventListHtml(ts) + "<p class=\"help\">ENVSS Field v38</p></div>";
    return h;
  }
  const p = project(ev.projectId);
  const ts = trainsOf(ev.id);
  var html = "<div class=\"wrap\"><div class=\"row\"><div class=\"grow\">";
  html += "<div class=\"muted\" onclick=\"openEditEvent('" + ev.id + "')\" style=\"cursor:pointer\">" + (p ? p.number + " · " + p.name : "") + " · tap to edit</div>";
  html += "<h2 class=\"brand-type\" style=\"margin:4px 0;color:var(--navy)\">" + ev.code + "</h2>";
  html += "<div class=\"muted\">" + eventTypeLabel(ev) + " · " + esc(ev.protocol || "background") + " · " + esc(ev.date || "") + "</div>";
  if (ev.taskDesc) html += "<div class=\"muted\">" + esc(ev.taskDesc) + "</div>";
  html += "</div>" + badge(deriveEventStage(ev)) + "</div>";
  html += "<div class=\"row\" style=\"margin:10px 0\"><button class=\"btn ghost\" onclick=\"openProject('" + ev.projectId + "')\">Dashboard</button>";
  html += "<button class=\"btn mid\" onclick=\"addAfmSample('" + ev.id + "')\">Add sample</button>";
  html += "<button class=\"btn green\" onclick=\"markEventUpload('" + ev.id + "')\">Upload event</button>";
  if (canDeleteEvent()) html += "<button class=\"btn ghost\" onclick=\"deleteEvent('" + ev.id + "')\">Delete event</button>";
  html += "</div>" + eventListHtml(ts) + deletionLogHtml(ev.id);
  html += "<p class=\"help\">ENVSS Field v38 · AFM</p></div>";
  return html;
};

openTrain = function (id) {
  view.page = "train";
  view.trainId = id;
  render();
};

dashHtml = (function (orig) {
  return function () { return orig().replace(/ENVSS Field v\d+/, "ENVSS Field v38"); };
})(dashHtml);
projectHtml = (function (orig) {
  return function () {
    var html = orig().replace(/ENVSS Field v\d+/, "ENVSS Field v38");
    return html;
  };
})(projectHtml);

if (typeof render === "function") render();

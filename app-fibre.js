/* AFM fibre overlay v31. Storage key unchanged. */
window.ENVSS_FIBRE = "31";
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
    airborne_personal: "Airborne \u00b7 personal",
    airborne_static: "Airborne \u00b7 static",
    blank: "Field blank",
    fibre_static: "AFM \u00b7 static",
    fibre_operator: "AFM \u00b7 operator",
    noise_personal: "Noise \u00b7 personal",
    noise_static: "Noise \u00b7 static"
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
    return [dash(t.location), t.role || "", t.startAt ? "start " + fmtTime(t.startAt) : "", t.endAt ? "stop " + fmtTime(t.endAt) : "", runPhrase(t)].filter(Boolean).join(" \u00b7 ");
  }
  return _summaryLine(t);
};
const _titleLine = titleLine;
titleLine = function(t) {
  if (isFibreTrain(t)) {
    const proto = (t.monitorType || "").replace(/^./, c => c.toUpperCase());
    return [displayNo(t), proto || "AFM", cowlDisplay(t) || "no cowl", isBlank(t) ? "Field blank" : dash(t.pumpSerial)].filter(Boolean).join(" \u00b7 ");
  }
  return _titleLine(t);
};
const _eventHtml = eventHtml;
eventHtml = function() {
  const ev = eventById(view.eventId);
  if (!ev || !isFibreEvent(ev)) return _eventHtml();
  const p = project(ev.projectId);
  const ts = trainsOf(ev.id);
  return "<div class=\"wrap\"><div class=\"row\"><div class=\"grow\"><div class=\"muted\" onclick=\"openEditEvent('"+ev.id+"')\" style=\"cursor:pointer\">"+(p?p.number+" \u00b7 "+p.name:"")+" \u00b7 tap to edit</div><h2 class=\"brand-type\" style=\"margin:4px 0;color:var(--navy)\">"+ev.code+"</h2><div class=\"muted\">"+eventTypeLabel(ev)+" \u00b7 "+esc(ev.protocol||"background")+"</div>"+(ev.taskDesc?"<div class=\"muted\">"+esc(ev.taskDesc)+"</div>":"")+(ev.rotameter?"<div class=\"muted\">Rotameter "+esc(ev.rotameter)+"</div>":"")+"</div>"+badge(deriveEventStage(ev))+"</div><div class=\"row\" style=\"margin:10px 0\"><button class=\"btn ghost\" onclick=\"openProject('"+ev.projectId+"')\">Dashboard</button><button class=\"btn mid\" onclick=\"openPickType('"+ev.id+"')\">Add sample</button><button class=\"btn green\" onclick=\"markEventUpload('"+ev.id+"')\">Upload event</button></div>"+eventListHtml(ts)+deletionLogHtml(ev.id)+"<p class=\"help\">ENVSS Field v31 \u00b7 AFM</p></div>";
};
const _trainHtml = trainHtml;
trainHtml = function() {
  const t = db.trains.find(x => x.id === view.trainId);
  if (!t) return "<div class=\"wrap\">Missing sample train.</div>";
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
  const protoOpts = [["background","Background"],["control","Control"],["clearance","Clearance"]].map(function(x){return "<option value=\""+x[0]+"\" "+(proto===x[0]?"selected":"")+">"+x[1]+"</option>";}).join("");
  var body = "<div class=\"wrap\"><button class=\"btn ghost\" onclick=\"leaveSample('"+t.id+"','"+t.eventId+"')\">\u2190 "+(ev?ev.code:"Event")+"</button>";
  body += "<div class=\"row\" style=\"margin-top:10px\"><h2 class=\"brand-type\" style=\"margin:0;color:var(--navy)\">"+displayNo(t)+"</h2>"+badge(displayStatus(t))+"</div>";
  body += "<label>Sample type</label><select id=\"trainKind\">"+trainKindOptions(t)+"</select>";
  body += "<label>Monitoring type</label><select id=\"monitorType\">"+protoOpts+"</select>";
  body += "<label>Cowl number</label><div class=\"row\"><span class=\"muted\" style=\"padding-top:10px\">ENVSS</span><input id=\"cowlNo\" class=\"grow\" inputmode=\"numeric\" value=\""+esc(cowl)+"\" placeholder=\"11850\"></div>";
  body += "<p class=\"help\">Type digits only. Printed as ENVSS + number. Never reused.</p>";
  if (isBlank(t)) {
    body += "<p class=\"help\">Field blank \u2014 pump, times and volume stay n/a.</p>";
  } else {
    body += "<label>Location point</label><input id=\"location\" value=\""+esc(t.location)+"\" placeholder=\"1- North Eastern Boundary\">";
    body += "<label>Role / operator (optional, no names)</label><input id=\"role\" value=\""+esc(t.role||"")+"\" placeholder=\"excavator operator\">";
    body += "<label>Pump serial</label><input id=\"pump\" value=\""+esc(t.pumpSerial)+"\" placeholder=\"Type serial\"><div class=\"suggest\" id=\"sug-pump\"></div>";
    body += "<div class=\"grid2\"><label>Start flow (L/min)</label><input id=\"startFlow\" inputmode=\"decimal\" value=\""+esc(t.startFlow)+"\"><label>End flow (L/min)</label><input id=\"endFlow\" inputmode=\"decimal\" value=\""+esc(t.endFlow)+"\"></div>";
    body += "<div class=\"grid2\"><label>Average flow</label><input value=\""+(avg!=null?Number(avg).toFixed(1):"")+"\" disabled><label>Volume (L)</label><input value=\""+(vol!=null?vol:"")+"\" disabled></div>";
    body += "<div class=\"grid2\"><label>Start time</label><input id=\"startAt\" type=\"time\" value=\""+esc(toLocalInput(t.startAt))+"\"><label>Stop time</label><input id=\"endAt\" type=\"time\" value=\""+esc(toLocalInput(t.endAt))+"\"></div>";
    body += "<p class=\"muted\">"+(mins!=null?Math.round(mins)+" min":"")+(t.startedBy?" \u00b7 started "+esc(t.startedBy):"")+(t.stoppedBy?" \u00b7 stopped "+esc(t.stoppedBy):"")+"</p>";
    if (chk.pct != null && !chk.ok) body += "<p class=\"help\">End flow is "+chk.pct.toFixed(1)+"% from start (tolerance \u00b15%).</p>";
  }
  body += "<label>Shift date</label><input id=\"shiftDate\" type=\"date\" value=\""+esc(t.shiftDate||(ev&&ev.date)||"")+"\">";
  body += "<label>Comments</label><textarea id=\"comments\">"+esc(t.comments||"")+"</textarea>";
  body += rejectBlockHtml(t);
  body += "<div class=\"footer-actions\">";
  if (!isBlank(t)) {
    body += "<button class=\"btn orange lg\" id=\"btnStart\" "+(running||t.status==="rejected"?"disabled":"")+">START</button>";
    body += "<button class=\"btn mid lg\" id=\"btnStop\" "+(t.status==="rejected"?"disabled":"")+">STOP</button>";
  }
  body += "<button class=\"btn ghost\" id=\"btnDelete\">Delete sample</button></div></div>";
  return body;
}
const _pickTypeHtml = pickTypeHtml;
pickTypeHtml = function() {
  const ev = eventById(view.eventId);
  if (!isFibreEvent(ev)) return _pickTypeHtml();
  const opts = [["fibre_static","Static sample","Boundary / enclosure. Cowl, pump, flow, start/stop."],["fibre_operator","Operator sample","Role text only \u2014 no names."],["blank","Field blank","Sample 0. Cowl only."]];
  return "<div class=\"wrap\"><button class=\"btn ghost\" onclick=\"openEvent('"+view.eventId+"')\">\u2190 "+(ev?ev.code:"Event")+"</button><h2 class=\"brand-type\" style=\"color:var(--navy)\">Add sample</h2>"+opts.map(function(o){return "<div class=\"card\" style=\"cursor:pointer\" onclick=\"addTrain('"+view.eventId+"','"+o[0]+"')\"><strong>"+o[1]+"</strong><div class=\"muted\">"+o[2]+"</div></div>";}).join("")+"</div>";
};
const _newEventHtml = newEventHtml;
newEventHtml = function() {
  const p = project(view.projectId);
  return "<div class=\"wrap\"><button class=\"btn ghost\" onclick=\"openProject('"+(view.projectId||"")+"')\">\u2190 Project events</button><h2 class=\"brand-type\" style=\"color:var(--navy)\">New event</h2><p class=\"muted\">"+(p?p.number+" \u00b7 "+(p.name||""):"")+"</p><label>Event type</label><select id=\"ntype\"><option value=\"hygiene\">Hygiene event</option><option value=\"fibre\">Airborne fibre monitoring</option></select><label>Event date</label><input id=\"ndate\" type=\"date\" value=\""+new Date().toISOString().slice(0,10)+"\"><div id=\"fibreEventFields\"><label>Monitoring type</label><select id=\"nprotocol\"><option value=\"background\">Background</option><option value=\"control\">Control</option><option value=\"clearance\">Clearance</option></select><label>Task being monitored</label><input id=\"ntask\" placeholder=\"Earthworks\"><label>Rotameter serial</label><input id=\"nrota\" placeholder=\"2520A4A0BNBN-NL-05\"><label>Lab turnaround</label><select id=\"ntat\"><option value=\"next_0700\">Next day 07:00</option><option value=\"same_day\">Same day</option><option value=\"emergency\">Emergency</option></select></div><label class=\"check-row\"><input type=\"checkbox\" id=\"nmulti\"> Multiple days / shifts</label><div class=\"footer-actions\"><button class=\"btn orange\" id=\"btnCreateEv\">Create event</button></div></div>";
};
const _trainKindOptions = trainKindOptions;
trainKindOptions = function(t) {
  if (isFibreTrain(t) || (t.trainKind || "").startsWith("fibre")) {
    const cur = t.trainKind || "fibre_static";
    return [["fibre_static","AFM \u00b7 static"],["fibre_operator","AFM \u00b7 operator"],["blank","Field blank"]].map(function(x){return "<option value=\""+x[0]+"\" "+(cur===x[0]?"selected":"")+">"+x[1]+"</option>";}).join("");
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
    id: uid("t"), eventId: eventId, pouch: String(next), sampleNo: next,
    trainKind: trainKind || "fibre_static", contaminantId: "ASB",
    pumpSerial: "", dosimeterSerial: "", headId: "", mediaId: "", cowlNo: "", role: "",
    monitorType: ev.protocol || "background", filterDia: "22.1",
    startFlow: blank ? "" : "2.0", endFlow: "", mode: blank ? "blank" : (trainKind === "fibre_operator" ? "personal" : "static"),
    person: { first: "", last: "", sex: "not_stated", dob: "", occupation: "", company: "", hours: "", daysOn: "", daysOff: "" },
    rpd: { worn: "", model: "", shaven: "", fit: "" }, hpd: { worn: "", model: "", style: "", classRating: "" },
    location: "", startAt: "", endAt: "", status: "prepped", comments: "",
    shiftDate: ev.date || "", shiftKind: "day", rejectReason: "", rejectCode: "", photo: "",
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
    id: uid("e"), projectId: projectId, type: type, stage: "planned", date: date,
    code: fibreEventCode(p, date, n),
    multiDay: !!(document.getElementById("nmulti")||{}).checked, notes: "", uploadReady: false, operators: [],
    protocol: document.getElementById("nprotocol") && document.getElementById("nprotocol").value || "background",
    taskDesc: document.getElementById("ntask") && document.getElementById("ntask").value || "",
    rotameter: document.getElementById("nrota") && document.getElementById("nrota").value || "",
    tat: document.getElementById("ntat") && document.getElementById("ntat").value || "next_0700"
  };
  db.events.push(ev);
  save();
  openEvent(ev.id);
};
const _collectTrain = collectTrain;
collectTrain = function(t) {
  _collectTrain(t);
  const g = function(id){ return document.getElementById(id); };
  if (g("cowlNo")) { t.cowlNo = cowlDigits(g("cowlNo").value); t.mediaId = cowlDisplay(t); }
  if (g("monitorType")) t.monitorType = g("monitorType").value;
  if (g("role")) t.role = g("role").value.trim();
  if (g("location") && isFibreTrain(t)) t.location = g("location").value;
};
const _markEventUpload = markEventUpload;
markEventUpload = function(id) {
  const ev = eventById(id);
  if (ev && isFibreEvent(ev)) {
    const bad = trainsOf(id).filter(function(t){
      if (isBlank(t)) return !(t.cowlNo || t.mediaId);
      return t.status === "running" || t.status === "prepped";
    });
    if (bad.length) {
      alert("This event cannot be uploaded until all samples are complete.\nIncomplete: " + bad.map(displayNo).join(", "));
      return;
    }
  }
  return _markEventUpload(id);
};
if (typeof render === "function") render();

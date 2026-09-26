window.ENVSS_FIBRE = "40";

function rotaList() {
  const list = ((db.catalogs && db.catalogs.rotameters) || []).map(function (r) { return r.serial || r; }).filter(Boolean);
  const extra = [];
  (db.events || []).forEach(function (e) { if (e.rotameter && list.indexOf(e.rotameter) === -1 && extra.indexOf(e.rotameter) === -1) extra.push(e.rotameter); });
  return list.concat(extra);
}
function setEventRotameter(eventId, serial) {
  const ev = eventById(eventId);
  if (!ev) return;
  ev.rotameter = serial;
  trainsOf(eventId).forEach(function (t) { if (!isBlank(t)) t.rotameter = serial; });
  save();
}
function setEventProtocol(eventId, proto) {
  const ev = eventById(eventId);
  if (!ev) return;
  ev.protocol = proto;
  trainsOf(eventId).forEach(function (t) { if (!isBlank(t)) t.monitorType = proto; });
  save();
  render();
}
function deleteProject(id) {
  if (!canDeleteEvent()) { alert("Only an admin can delete a project."); return; }
  const p = project(id);
  if (!p) return;
  if (!confirm("Delete project " + p.number + " and all of its events and samples?")) return;
  const evs = db.events.filter(function (e) { return e.projectId === id; });
  db.deletions = db.deletions || [];
  evs.forEach(function (ev) {
    trainsOf(ev.id).forEach(function (t) {
      db.deletions.push({ id: t.id, trainId: t.id, eventId: ev.id, at: nowIso(), who: whoText(), reason: "project deleted" });
    });
    db.deletions.push({ id: ev.id, eventId: ev.id, at: nowIso(), who: whoText(), reason: "project deleted" });
  });
  db.trains = db.trains.filter(function (t) {
    return evs.every(function (ev) { return ev.id !== t.eventId; });
  });
  db.events = db.events.filter(function (e) { return e.projectId !== id; });
  db.projects = db.projects.filter(function (x) { return x.id !== id; });
  db.deletions.push({ id: p.id, at: nowIso(), who: whoText(), reason: "project deleted" });
  save();
  goDash();
}

eventHtml = function () {
  const ev = eventById(view.eventId);
  if (!ev) return "<div class=\"wrap\">Missing event.</div>";
  const p = project(ev.projectId);
  const ts = trainsOf(ev.id);
  const afm = ev.type === "fibre" || String(ev.code || "").indexOf("AFM") !== -1;
  const rotas = rotaList();
  const curR = ev.rotameter || "";
  if (curR && rotas.indexOf(curR) === -1) rotas.unshift(curR);
  var html = "<div class=\"wrap\"><div class=\"row\"><div class=\"grow\">";
  html += "<div class=\"muted\" onclick=\"openEditEvent('" + ev.id + "')\" style=\"cursor:pointer\">" + (p ? p.number + " · " + p.name : "") + " · tap to edit</div>";
  html += "<h2 class=\"brand-type\" style=\"margin:4px 0;color:var(--navy)\">" + ev.code + "</h2>";
  html += "<div class=\"muted\">" + eventTypeLabel(ev) + " · " + esc(ev.date || "") + "</div>";
  if (afm && ev.taskDesc) html += "<div class=\"muted\">" + esc(ev.taskDesc) + "</div>";
  html += "</div>" + badge(deriveEventStage(ev)) + "</div>";
  if (afm) {
    html += "<label>Rotameter serial</label><select id=\"eventRota\" onchange=\"setEventRotameter('" + ev.id + "', this.value)\">";
    html += "<option value=\"\">Select rotameter</option>";
    rotas.forEach(function (s) {
      html += "<option value=\"" + esc(s) + "\" " + (curR === s ? "selected" : "") + ">" + esc(s) + "</option>";
    });
    html += "</select>";
    html += "<label>Sampling protocol</label><select id=\"eventProto\" onchange=\"setEventProtocol('" + ev.id + "', this.value)\">";
    [["background","Background"],["control","Control"],["clearance","Clearance"]].forEach(function (x) {
      html += "<option value=\"" + x[0] + "\" " + ((ev.protocol || "background") === x[0] ? "selected" : "") + ">" + x[1] + "</option>";
    });
    html += "</select>";
  }
  html += "<div class=\"row\" style=\"margin:10px 0;flex-wrap:wrap\">";
  html += "<button class=\"btn ghost\" onclick=\"openProject('" + ev.projectId + "')\">Dashboard</button>";
  html += afm ? "<button class=\"btn mid\" onclick=\"addAfmSample('" + ev.id + "')\">Add sample</button>" : "<button class=\"btn mid\" onclick=\"openPickType('" + ev.id + "')\">Add sample</button>";
  html += "<button class=\"btn green\" onclick=\"markEventUpload('" + ev.id + "')\">Upload event</button>";
  if (canDeleteEvent()) html += "<button class=\"btn ghost\" onclick=\"deleteEvent('" + ev.id + "')\">Delete event</button>";
  html += "</div>";
  html += eventListHtml(ts) + deletionLogHtml(ev.id);
  html += "<p class=\"help\">ENVSS Field v40</p></div>";
  return html;
};

projectHtml = function () {
  const p = project(view.projectId);
  if (!p) return "<div class=\"wrap\">Missing project.</div>";
  const list = db.events.filter(function (e) { return e.projectId === p.id; }).map(function (e) {
    return Object.assign({}, e, { stageNow: deriveEventStage(e) });
  }).filter(function (e) { return view.filter === "all" || e.stageNow === view.filter; });
  var html = "<div class=\"wrap\"><button class=\"btn ghost\" onclick=\"goDash()\">\u2190 Projects</button>";
  html += "<div class=\"row\" style=\"margin-top:10px\"><div class=\"grow\">";
  html += "<h2 class=\"brand-type\" style=\"margin:0;color:var(--navy)\">Project events</h2>";
  html += "<div class=\"muted\">" + p.number + "</div><div class=\"muted\">" + esc(p.name || "") + " · " + esc(p.site || "") + "</div></div>";
  html += "<button class=\"btn orange\" onclick=\"openNewEvent('" + p.id + "')\">New event</button></div>";
  if (canDeleteEvent()) html += "<div class=\"row\" style=\"margin:8px 0\"><button class=\"btn ghost\" onclick=\"deleteProject('" + p.id + "')\">Delete project</button></div>";
  html += "<div class=\"filters\">";
  ["all","running","ended","prepped","field_blank","planned","upload_ready"].forEach(function (s) {
    html += "<button class=\"chip " + (view.filter === s ? "on" : "") + "\" data-filter=\"" + s + "\">" + (s === "all" ? "All" : s.replace("_"," ")) + "</button>";
  });
  html += "</div>";
  if (!list.length) html += "<div class=\"empty\">No events in this filter.</div>";
  list.forEach(function (e) {
    const n = trainsOf(e.id).length;
    html += "<div class=\"card\" onclick=\"openEvent('" + e.id + "')\" style=\"cursor:pointer\"><div class=\"row\"><div class=\"grow\">";
    html += "<div class=\"brand-type\" style=\"font-weight:700;color:var(--navy);font-size:18px\">" + e.code + "</div>";
    html += "<div class=\"muted\">" + eventTypeLabel(e) + " · " + (e.date || "") + " · " + n + " sample" + (n === 1 ? "" : "s") + "</div></div>";
    html += badge(e.stageNow) + "</div></div>";
  });
  html += "<p class=\"help\">ENVSS Field v40</p></div>";
  return html;
};

fibreTrainHtml = function (t, ev) {
  try {
    const running = t.status === "running";
    const blank = isBlank(t);
    const cowl = cowlDigits(t.cowlNo || t.mediaId);
    const avg = (num(t.startFlow) != null && num(t.endFlow) != null) ? avgFlow(t) : null;
    const vol = (t.endAt && num(t.endFlow) != null) ? volumeLitres(t) : null;
    const mins = fibreLiveMinutes(t);
    const volWarn = (!blank && t.endAt && vol != null && vol < 360) ? ("<p class=\"help\">Volume " + vol + " L is under 360 L. Limit of detection rises to 0.01 f/mL.</p>") : "";
    var html = "<div class=\"wrap\">";
    html += "<button class=\"btn ghost\" onclick=\"leaveSample('" + t.id + "','" + t.eventId + "')\">\u2190 " + (ev ? ev.code : "Event") + "</button>";
    html += "<div class=\"row\" style=\"margin-top:10px\"><h2 class=\"brand-type\" style=\"margin:0;color:var(--navy)\">" + displayNo(t) + "</h2>" + badge(displayStatus(t)) + "</div>";
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
    return "<div class=\"wrap\"><p>Could not open sample. " + esc(String(err && err.message || err)) + "</p></div>";
  }
};

titleLine = function (t) {
  if (!isFibreTrain(t)) {
    const c = contam(t.contaminantId);
    const parts = [displayNo(t), kindLabel(t)];
    if (c && !isNoise(t)) parts.push(c.code);
    return parts.join(" · ");
  }
  return [displayNo(t), cowlDisplay(t) || "no cowl", isBlank(t) ? "Field blank" : dash(t.pumpSerial)].filter(Boolean).join(" · ");
};

if (typeof dashHtml === "function") {
  dashHtml = (function (orig) {
    return function () {
      var html = orig().replace(/ENVSS Field v\d+/, "ENVSS Field v40");
      return html;
    };
  })(dashHtml);
}
if (typeof render === "function") render();

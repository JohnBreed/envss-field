window.ENVSS_FIBRE = "39";
window.ENVSS_EVENT_ADMINS = ["john@envss.com.au"];

function operatorEmail() {
  const o = typeof getOperator === "function" ? getOperator() : null;
  return String((o && o.email) || "").toLowerCase();
}
function operatorName() {
  const o = typeof getOperator === "function" ? getOperator() : null;
  return String((o && o.name) || "").toLowerCase();
}
function canDeleteEvent() {
  if ((window.ENVSS_EVENT_ADMINS || []).indexOf(operatorEmail()) !== -1) return true;
  const n = operatorName();
  return n.indexOf("john breed") !== -1 || n === "john" || n.indexOf("j breed") !== -1;
}

function applyRotameterAll(eventId) {
  const el = document.getElementById("eventRota");
  const serial = ((el && el.value) || "").trim();
  if (!serial) { alert("Enter a rotameter serial first."); return; }
  trainsOf(eventId).forEach(function (t) {
    if (isBlank(t)) return;
    t.rotameter = serial;
  });
  const ev = eventById(eventId);
  if (ev) ev.rotameter = serial;
  save();
  render();
}
function applyTypeAll(eventId, proto) {
  trainsOf(eventId).forEach(function (t) {
    if (isBlank(t)) return;
    t.monitorType = proto;
  });
  const ev = eventById(eventId);
  if (ev) ev.protocol = proto;
  save();
  render();
}

collectTrain = (function (orig) {
  return function (t) {
    orig(t);
    const rota = document.getElementById("rota");
    if (rota) t.rotameter = rota.value.trim();
  };
})(collectTrain);

eventHtml = function () {
  const ev = eventById(view.eventId);
  if (!ev) return "<div class=\"wrap\">Missing event.</div>";
  const p = project(ev.projectId);
  const ts = trainsOf(ev.id);
  const afm = ev.type === "fibre" || String(ev.code || "").indexOf("AFM") !== -1;
  var html = "<div class=\"wrap\"><div class=\"row\"><div class=\"grow\">";
  html += "<div class=\"muted\" onclick=\"openEditEvent('" + ev.id + "')\" style=\"cursor:pointer\">" + (p ? p.number + " · " + p.name : "") + " · tap to edit</div>";
  html += "<h2 class=\"brand-type\" style=\"margin:4px 0;color:var(--navy)\">" + ev.code + "</h2>";
  html += "<div class=\"muted\">" + eventTypeLabel(ev) + (afm ? " · " + esc(ev.protocol || "background") : "") + " · " + esc(ev.date || "") + "</div>";
  if (afm && ev.taskDesc) html += "<div class=\"muted\">" + esc(ev.taskDesc) + "</div>";
  html += "</div>" + badge(deriveEventStage(ev)) + "</div>";
  html += "<div class=\"row\" style=\"margin:10px 0;flex-wrap:wrap\">";
  html += "<button class=\"btn ghost\" onclick=\"openProject('" + ev.projectId + "')\">Dashboard</button>";
  html += afm ? "<button class=\"btn mid\" onclick=\"addAfmSample('" + ev.id + "')\">Add sample</button>" : "<button class=\"btn mid\" onclick=\"openPickType('" + ev.id + "')\">Add sample</button>";
  html += "<button class=\"btn green\" onclick=\"markEventUpload('" + ev.id + "')\">Upload event</button>";
  if (canDeleteEvent()) html += "<button class=\"btn ghost\" onclick=\"deleteEvent('" + ev.id + "')\">Delete event</button>";
  html += "</div>";
  if (afm) {
    html += "<label>Rotameter serial</label><input id=\"eventRota\" value=\"" + esc(ev.rotameter || "") + "\" placeholder=\"2520A4A0BNBN-NL-05\">";
    html += "<div class=\"row\" style=\"margin:8px 0;flex-wrap:wrap\"><button class=\"btn mid\" onclick=\"applyRotameterAll('" + ev.id + "')\">Use this rotameter on all samples</button></div>";
    html += "<p class=\"help\">Set every sample (not the blank) to the same monitoring type:</p>";
    html += "<div class=\"row\" style=\"margin:0 0 12px;flex-wrap:wrap\">";
    html += "<button class=\"btn ghost\" onclick=\"applyTypeAll('" + ev.id + "','background')\">All background</button>";
    html += "<button class=\"btn ghost\" onclick=\"applyTypeAll('" + ev.id + "','control')\">All control</button>";
    html += "<button class=\"btn ghost\" onclick=\"applyTypeAll('" + ev.id + "','clearance')\">All clearance</button></div>";
  }
  html += eventListHtml(ts) + deletionLogHtml(ev.id);
  html += "<p class=\"help\">ENVSS Field v39" + (canDeleteEvent() ? " · admin delete on" : "") + "</p></div>";
  return html;
};

projectHtml = (function (orig) {
  return function () {
    var html = orig().replace(/ENVSS Field v\d+/, "ENVSS Field v39");
    if (!canDeleteEvent()) return html;
    return html.replace(/onclick="openEvent\('([^']+)'\)"/g, function (_, id) {
      return "onclick=\"openEvent('" + id + "')\"";
    }).replace(/<div class="card" onclick="openEvent\('([^']+)'\)" style="cursor:pointer">/g, function (_, id) {
      return "<div class=\"card\" style=\"cursor:pointer\"><div class=\"row\"><div class=\"grow\" onclick=\"openEvent('" + id + "')\">";
    }).replace(/<\/div>\s*<\/div>\s*<\/div>/g, function (m) {
      return m;
    });
  };
})(projectHtml);

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
    const rota = t.rotameter || (ev && ev.rotameter) || "";
    var html = "<div class=\"wrap\">";
    html += "<button class=\"btn ghost\" onclick=\"leaveSample('" + t.id + "','" + t.eventId + "')\">\u2190 " + (ev ? ev.code : "Event") + "</button>";
    html += "<div class=\"row\" style=\"margin-top:10px\"><h2 class=\"brand-type\" style=\"margin:0;color:var(--navy)\">" + displayNo(t) + "</h2>" + badge(displayStatus(t)) + "</div>";
    if (!blank) html += "<label>Monitoring type</label><select id=\"monitorType\">" + protoOpts + "</select>";
    html += "<label>Cowl number</label><div class=\"row\"><span class=\"muted\" style=\"padding-top:10px\">ENVSS</span><input id=\"cowlNo\" class=\"grow\" inputmode=\"numeric\" value=\"" + esc(cowl) + "\" placeholder=\"11850\"></div>";
    html += "<p class=\"help\">Digits only. Printed as ENVSS + number.</p>";
    if (blank) {
      html += "<p class=\"help\">Field blank — pump, rotameter, times and volume stay n/a.</p>";
    } else {
      html += "<label>Pump serial</label><input id=\"pump\" value=\"" + esc(t.pumpSerial) + "\" placeholder=\"Type serial\"><div class=\"suggest\" id=\"sug-pump\"></div>";
      html += "<label>Rotameter serial</label><input id=\"rota\" value=\"" + esc(rota) + "\" placeholder=\"2520A4A0BNBN-NL-05\">";
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

if (typeof dashHtml === "function") {
  dashHtml = (function (orig) {
    return function () { return orig().replace(/ENVSS Field v\d+/, "ENVSS Field v39"); };
  })(dashHtml);
}
if (typeof render === "function") render();

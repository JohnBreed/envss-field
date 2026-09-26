window.ENVSS_FIBRE = "37";
const _createEventV37 = createEvent;
createEvent = function () {
  const typeEl = document.getElementById("ntype");
  const type = (typeEl && typeEl.value) || "hygiene";
  if (type !== "fibre") return _createEventV37();
  const projectId = view.projectId;
  const p = project(projectId);
  if (!p) { alert("Open a project first."); return; }
  const date = document.getElementById("ndate").value;
  const siblings = db.events.filter(e => e.projectId === projectId && e.type === "fibre");
  const n = String(siblings.length + 1).padStart(3, "0");
  const ev = {
    id: uid("e"), projectId: projectId, type: type, stage: "planned", date: date,
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
    trainKind: "blank", contaminantId: "ASB",
    pumpSerial: "", mediaId: "", cowlNo: "", role: "",
    monitorType: ev.protocol || "background", filterDia: "22.1",
    startFlow: "", endFlow: "", mode: "blank",
    person: { first: "", last: "", sex: "not_stated", dob: "", occupation: "", company: "", hours: "", daysOn: "", daysOff: "" },
    rpd: { worn: "", model: "", shaven: "", fit: "" },
    hpd: { worn: "", model: "", style: "", classRating: "" },
    location: "", startAt: "", endAt: "", status: "prepped", comments: "",
    shiftDate: ev.date || "", shiftKind: "day",
    rejectReason: "", rejectCode: "", photo: "",
    audit: [{ at: nowIso(), action: "Created", detail: "field blank" }]
  });
  save();
  openEvent(ev.id);
};

fibreTrainHtml = function (t, ev) {
  const running = t.status === "running";
  const blank = isBlank(t);
  const proto = t.monitorType || (ev && ev.protocol) || "background";
  const cowl = cowlDigits(t.cowlNo || t.mediaId);
  const avg = (num(t.startFlow) != null && num(t.endFlow) != null) ? avgFlow(t) : null;
  const vol = (t.endAt && num(t.endFlow) != null) ? volumeLitres(t) : null;
  const mins = fibreLiveMinutes(t);
  const volWarn = (!blank && t.endAt && vol != null && vol < 360)
    ? "<p class=\"help\">Volume " + vol + " L is under 360 L. Limit of detection rises to 0.01 f/mL.</p>" : "";
  const protoOpts = [["background","Background"],["control","Control"],["clearance","Clearance"]]
    .map(function (x) { return "<option value=\"" + x[0] + "\" " + (proto === x[0] ? "selected" : "") + ">" + x[1] + "</option>"; }).join("");
  var html = "<div class=\"wrap\">";
  html += "<button class=\"btn ghost\" onclick=\"leaveSample('" + t.id + "','" + t.eventId + "')\">\u2190 " + (ev ? ev.code : "Event") + "</button>";
  html += "<div class=\"row\" style=\"margin-top:10px\"><h2 class=\"brand-type\" style=\"margin:0;color:var(--navy)\">" + displayNo(t) + "</h2>" + badge(displayStatus(t)) + "</div>";
  if (!blank) {
    html += "<label>Monitoring type</label><select id=\"monitorType\">" + protoOpts + "</select>";
  }
  html += "<label>Cowl number</label><div class=\"row\"><span class=\"muted\" style=\"padding-top:10px\">ENVSS</span>";
  html += "<input id=\"cowlNo\" class=\"grow\" inputmode=\"numeric\" value=\"" + esc(cowl) + "\" placeholder=\"11850\"></div>";
  html += "<p class=\"help\">Digits only. Printed as ENVSS + number.</p>";
  if (blank) {
    html += "<p class=\"help\">Field blank — pump, times and volume stay n/a.</p>";
  } else {
    html += "<label>Pump serial</label><input id=\"pump\" value=\"" + esc(t.pumpSerial) + "\" placeholder=\"Type serial\"><div class=\"suggest\" id=\"sug-pump\"></div>";
    html += "<label>Location</label><input id=\"location\" value=\"" + esc(t.location) + "\" placeholder=\"1- North Eastern Boundary\">";
    html += "<label>Start flow (L/min)</label><input id=\"startFlow\" inputmode=\"decimal\" value=\"" + esc(t.startFlow || "2.0") + "\">";
    html += "<div class=\"row\" style=\"margin:12px 0;gap:10px;align-items:end\">";
    html += "<button class=\"btn orange lg\" id=\"btnStart\" " + (running || t.status === "rejected" ? "disabled" : "") + ">START</button>";
    html += "<div class=\"grow\"><label>Start time</label><input id=\"startAt\" type=\"time\" value=\"" + esc(toLocalInput(t.startAt)) + "\"></div></div>";
    html += "<div class=\"row\" style=\"margin:0 0 12px;gap:10px;align-items:end\">";
    html += "<button class=\"btn mid lg\" id=\"btnStop\" " + (t.status !== "running" ? "disabled" : "") + ">STOP</button>";
    html += "<div class=\"grow\"><label>Stop time</label><input id=\"endAt\" type=\"time\" value=\"" + esc(toLocalInput(t.endAt)) + "\"></div></div>";
    html += "<label>End flow (L/min)</label><input id=\"endFlow\" inputmode=\"decimal\" value=\"" + esc(t.endFlow) + "\">";
    html += "<div class=\"grid2\"><label>Average flow</label><input value=\"" + (avg != null ? Number(avg).toFixed(1) : "") + "\" disabled>";
    html += "<label>Volume (L)</label><input value=\"" + (vol != null ? vol : "") + "\" disabled></div>";
    html += "<p class=\"muted\">" + (mins != null ? Math.round(mins) + " min" : "") + "</p>" + volWarn;
  }
  html += rejectBlockHtml(t);
  html += "<div class=\"footer-actions\"><button class=\"btn ghost\" id=\"btnDelete\">Delete sample</button></div></div>";
  return html;
};

if (typeof dashHtml === "function") {
  const d = dashHtml;
  dashHtml = function () { return d().replace(/ENVSS Field v\d+/, "ENVSS Field v37"); };
}
if (typeof projectHtml === "function") {
  const p = projectHtml;
  projectHtml = function () { return p().replace(/ENVSS Field v\d+/, "ENVSS Field v37"); };
}
if (typeof render === "function") render();

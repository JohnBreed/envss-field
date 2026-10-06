/* One clean layer. Does not wrap render. */
window.ENVSS_SIMPLE = "1";

function activeProject(p) {
  if (!p || p.source !== "podio") return true;
  var s = String(p.status || "").toLowerCase();
  return s && s !== "closed" && s !== "cancelled" && s !== "on hold" && p.active !== false;
}

dashHtml = function () {
  var controllers = [], statuses = [];
  (db.projects || []).forEach(function (p) {
    if (!activeProject(p)) return;
    if (p.controller && controllers.indexOf(p.controller) < 0) controllers.push(p.controller);
    if (p.status && statuses.indexOf(p.status) < 0) statuses.push(p.status);
  });
  controllers.sort(); statuses.sort();
  view.controller = view.controller || "all";
  view.statusFilter = view.statusFilter || "all";
  var list = (db.projects || []).filter(function (p) {
    if (!activeProject(p)) return false;
    if (view.controller !== "all" && p.controller !== view.controller) return false;
    if (view.statusFilter !== "all" && p.status !== view.statusFilter) return false;
    return true;
  }).sort(function (a, b) { return String(b.number || "").localeCompare(String(a.number || "")); });
  var html = "<div class=\"wrap\"><div class=\"row\"><h2 class=\"brand-type\" style=\"margin:0;color:var(--navy)\">Active projects</h2><button class=\"btn orange\" id=\"btnNewProject\">New project</button></div>";
  html += "<label>Controller</label><select id=\"controllerFilter\"><option value=\"all\">All controllers</option>";
  controllers.forEach(function (n) { html += "<option value=\"" + esc(n) + "\"" + (view.controller === n ? " selected" : "") + ">" + esc(n) + "</option>"; });
  html += "</select><label>Status</label><select id=\"statusFilter\"><option value=\"all\">All active statuses</option>";
  statuses.forEach(function (n) { html += "<option value=\"" + esc(n) + "\"" + (view.statusFilter === n ? " selected" : "") + ">" + esc(n) + "</option>"; });
  html += "</select><p class=\"help\">" + list.length + " active job" + (list.length === 1 ? "" : "s") + ".</p>";
  list.forEach(function (p) {
    html += "<button class=\"card open-project\" data-project=\"" + esc(p.id) + "\" style=\"display:block;width:100%;text-align:left\"><div class=\"row\"><div class=\"grow\">";
    html += "<div class=\"brand-type\" style=\"font-weight:700;color:var(--navy);font-size:18px\">" + esc(p.name || p.number || "No title") + "</div>";
    html += "<div class=\"muted\">" + esc(p.number || "") + (p.client ? " · " + esc(p.client) : "") + (p.site ? " · " + esc(p.site) : "") + "</div>";
    html += "<div class=\"muted\">" + esc(p.controller || "No controller") + "</div></div>";
    html += "<div style=\"font-weight:700;color:var(--navy);text-align:right;max-width:160px\">" + esc(p.status || "") + "</div></div></button>";
  });
  html += "<p class=\"help\">ENVSS Field simple</p></div>";
  return html;
};

newProjectHtml = function () {
  var statuses = ["New", "ENVSS to propose start date", "In Progress", "Awaiting Start Date/PO/Information from Client", "Lab Results Pending", "Report Pending", "Report in Review", "On Hold", "Closed", "Cancelled"];
  var opts = statuses.map(function (s) { return "<option" + (s === "In Progress" ? " selected" : "") + ">" + esc(s) + "</option>"; }).join("");
  return "<div class=\"wrap\"><button class=\"btn ghost\" id=\"btnBackDash\">← Projects</button><h2 class=\"brand-type\" style=\"color:var(--navy)\">New project</h2>" +
    "<label>Job number</label><input id=\"nnum\">" +
    "<label>Project title</label><input id=\"nname\">" +
    "<label>Client</label><input id=\"nclient\">" +
    "<label>Site</label><input id=\"nsite\">" +
    "<label>Status</label><select id=\"nstatus\">" + opts + "</select>" +
    "<label>Project controller</label><input id=\"ncontroller\">" +
    "<label>Controller email</label><input id=\"ncontrollerEmail\">" +
    "<label>Job type</label><input id=\"njobType\" value=\"HYG - Occupational Hygiene\">" +
    "<div class=\"footer-actions\"><button class=\"btn orange\" id=\"btnCreateProj\">Create project</button></div></div>";
};

createProject = function () {
  var num = ((document.getElementById("nnum") || {}).value || "").trim();
  if (!num) { alert("Enter a job number."); return; }
  var status = ((document.getElementById("nstatus") || {}).value || "In Progress");
  var p = {
    id: uid("p"), source: "field", number: num,
    name: ((document.getElementById("nname") || {}).value || "").trim() || num,
    client: ((document.getElementById("nclient") || {}).value || "").trim(),
    site: ((document.getElementById("nsite") || {}).value || "").trim(),
    status: status, active: status !== "Closed" && status !== "Cancelled" && status !== "On Hold",
    controller: ((document.getElementById("ncontroller") || {}).value || "").trim(),
    controllerEmail: ((document.getElementById("ncontrollerEmail") || {}).value || "").trim(),
    jobType: ((document.getElementById("njobType") || {}).value || "").trim()
  };
  db.projects.push(p);
  save();
  openProject(p.id);
};

function analysesOf(t) {
  if (!Array.isArray(t.analyses)) t.analyses = [];
  return t.analyses;
}
function analysisBlock(t) {
  var rows = analysesOf(t).map(function (a, i) {
    return "<div class=\"row\"><span class=\"grow\">" + esc(a.code) + (a.name ? " — " + esc(a.name) : "") + "</span><button type=\"button\" class=\"btn ghost drop-analysis\" data-i=\"" + i + "\">Remove</button></div>";
  }).join("");
  return "<div class=\"analysis-box\"><label>Add analysis</label><input id=\"addAnalysis\" placeholder=\"Type a contaminant\" autocomplete=\"off\"><div id=\"sug-analysis\"></div><div id=\"analysisList\">" + (rows || "<p class=\"muted\">None yet. Each analysis becomes its own row in the sheet.</p>") + "</div></div>";
}
var _trainSimple = trainHtml;
trainHtml = function () {
  var html; try { html = _trainSimple(); } catch (e) { return "<div class=\"wrap\">Sample could not be drawn.</div>"; }
  var t = (db.trains || []).find(function (x) { return x.id === view.trainId; });
  if (!t || html.indexOf("analysisList") >= 0) return html;
  html = html.replace(/<label>Contaminant<\/label>\s*(?:<input[^>]*>|<div class="combo">[\s\S]*?id="sug-contam"><\/div>\s*<\/div>)/, analysisBlock(t));
  if (t.trainKind === "blank") html = html.replace(/<label>Sample head<\/label>\s*<div class="combo">[\s\S]*?id="sug-head"><\/div>\s*<\/div>/, "");
  return html;
};

var _bindSimple = bind;
bind = function () {
  try { _bindSimple(); } catch (e) {}
  var np = document.getElementById("btnNewProject");
  if (np) np.onclick = function () { openNewProject(); };
  var back = document.getElementById("btnBackDash");
  if (back) back.onclick = function () { goDash(); };
  var create = document.getElementById("btnCreateProj");
  if (create) create.onclick = function () { createProject(); };
  var cf = document.getElementById("controllerFilter");
  if (cf) cf.onchange = function () { view.controller = cf.value; render(); };
  var sf = document.getElementById("statusFilter");
  if (sf) sf.onchange = function () { view.statusFilter = sf.value; render(); };
  document.querySelectorAll(".open-project").forEach(function (btn) {
    btn.onclick = function () { openProject(btn.getAttribute("data-project")); };
  });
  var add = document.getElementById("addAnalysis");
  var sug = document.getElementById("sug-analysis");
  function addOne(code, name) {
    var sample = (db.trains || []).find(function (x) { return x.id === view.trainId; });
    if (!sample || !code) return;
    analysesOf(sample);
    if (!sample.analyses.some(function (a) { return a.code === code; })) sample.analyses.push({ code: code, name: name || "" });
    sample.contaminantId = sample.analyses[0].code;
    save();
  }
  if (add && sug) add.oninput = function () {
    var q = add.value.toLowerCase();
    var hits = ((db.catalogs && db.catalogs.contaminants) || []).filter(function (c) { return (c.code + " " + (c.name || "")).toLowerCase().indexOf(q) >= 0; }).slice(0, 8);
    sug.innerHTML = hits.map(function (c) { return "<button type=\"button\" data-code=\"" + esc(c.code) + "\" data-name=\"" + esc(c.name || "") + "\">" + esc(c.code) + " — " + esc(c.name || "") + "</button>"; }).join("");
    sug.querySelectorAll("button").forEach(function (btn) { btn.onmousedown = function (e) { e.preventDefault(); addOne(btn.getAttribute("data-code"), btn.getAttribute("data-name")); }; });
  };
  document.querySelectorAll(".drop-analysis").forEach(function (btn) {
    btn.onclick = function () {
      var t = (db.trains || []).find(function (x) { return x.id === view.trainId; });
      analysesOf(t).splice(Number(btn.getAttribute("data-i")), 1);
      t.contaminantId = t.analyses[0] ? t.analyses[0].code : "";
      save();
    };
  });
};

var _pullSimple = pullRemote;
pullRemote = async function () {
  await _pullSimple();
  var c = typeof sbCfg === "function" ? sbCfg() : null;
  if (!c) return;
  var all = [];
  for (var offset = 0; offset < 6000; offset += 1000) {
    var res = await fetch(c.supabaseUrl + "/rest/v1/envss_projects?select=id,payload,updated_at&limit=1000&offset=" + offset, { headers: sbHeaders() });
    if (!res.ok) break;
    var rows = await res.json();
    all = all.concat(rows);
    if (rows.length < 1000) break;
  }
  if (typeof mergeById === "function") db.projects = mergeById(db.projects, all);
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
  if (view.page === "dash") render();
};

function importFieldCsv(text) {
  var p = project(view.projectId);
  if (!p) { alert("Open a project first."); return; }
  var rows = [];
  var row = [], cur = "", q = false;
  text = text.replace(/^\uFEFF/, "");
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (q) { if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (ch !== "\r") cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  var head = rows.shift().map(function (h) { return h.trim().toLowerCase(); });
  function val(cols, name) { var i = head.indexOf(name); return i < 0 ? "" : (cols[i] || "").trim(); }
  function hm(v) { return /^\d{2}:\d{2}/.test(v) ? v.slice(0, 5) : ""; }
  var groups = {};
  rows.forEach(function (cols) {
    var date = val(cols, "date"), cassette = val(cols, "cassette"), cont = val(cols, "contaminant");
    if (!date || !cassette || !cont) return;
    var key = date + "|" + cassette;
    if (!groups[key]) groups[key] = { date: date, cassette: cassette, cols: cols, analyses: [] };
    if (!groups[key].analyses.some(function (a) { return a.code === cont; })) groups[key].analyses.push({ code: cont, name: "" });
  });
  var imported = db.events.filter(function (e) { return e.projectId === p.id && e.notes === "Imported from field sheet"; });
  var ev = imported[0];
  if (!ev) {
    var n = String(db.events.filter(function (e) { return e.projectId === p.id; }).length + 1).padStart(3, "0");
    ev = { id: uid("e"), projectId: p.id, type: "hygiene", code: p.number + "-" + n, stage: "planned", date: Object.keys(groups).length ? groups[Object.keys(groups)[0]].date : "", multiDay: true, notes: "Imported from field sheet", uploadReady: false, operators: [] };
    db.events.push(ev);
  }
  ev.multiDay = true;
  imported.slice(1).forEach(function (extra) {
    (db.trains || []).forEach(function (sample) { if (sample.eventId === extra.id) sample.eventId = ev.id; });
    db.events = db.events.filter(function (e) { return e.id !== extra.id; });
  });
  Object.keys(groups).forEach(function (key) {
    var g = groups[key], cols = g.cols;
    var start = hm(val(cols, "start")), end = hm(val(cols, "end"));
    var sample = (db.trains || []).find(function (t) { return t.eventId === ev.id && t.mediaId === g.cassette && t.shiftDate === g.date; });
    if (!sample) {
      var sampleNo = (db.trains || []).filter(function (t) { return t.eventId === ev.id; }).length + 1;
      var rawType = val(cols, "type").toLowerCase();
      var kind = rawType === "blank" ? "blank" : "airborne_personal";
      sample = { id: uid("t"), eventId: ev.id, pouch: String(sampleNo), sampleNo: sampleNo, trainKind: kind, mode: kind === "blank" ? "blank" : "personal", status: "prepped", comments: "" };
      db.trains = db.trains || [];
      db.trains.push(sample);
    }
    sample.contaminantId = g.analyses[0].code;
    sample.analyses = g.analyses;
    sample.pumpSerial = val(cols, "pump");
    sample.headId = val(cols, "head");
    sample.mediaId = g.cassette;
    sample.startFlow = val(cols, "flow_start");
    sample.endFlow = val(cols, "flow_end");
    sample.shiftDate = g.date;
    sample.shiftKind = val(cols, "shift") || "day";
    sample.trainKind = val(cols, "type").toLowerCase() === "blank" ? "blank" : "airborne_personal";
    sample.mode = sample.trainKind === "blank" ? "blank" : "personal";
    sample.rejected = val(cols, "type").toLowerCase() === "rejected";
    sample.rejectReason = sample.rejected ? "Sample rejected" : "";
    sample.status = sample.rejected ? "rejected" : (sample.trainKind === "blank" ? "ended" : ((start && end) ? "ended" : "prepped"));
    sample.startAt = typeof combineShiftTime === "function" ? combineShiftTime(g.date, start, false) : (start ? g.date + "T" + start + ":00" : "");
    sample.endAt = typeof combineShiftTime === "function" ? combineShiftTime(g.date, end, true, start) : (end ? g.date + "T" + end + ":00" : "");
    sample.location = val(cols, "location");
    sample.locationCode = val(cols, "location_code");
    sample.occupationCode = String(val(cols, "occupation_code")).replace(/\.0$/, "");
    sample.seg = val(cols, "seg");
    sample.mineCodesOn = true;
    sample.person = { first: val(cols, "given"), last: val(cols, "surname"), sex: (val(cols, "gender") || "not_stated").toLowerCase(), dob: val(cols, "dob"), occupation: val(cols, "occupation"), company: val(cols, "company"), hours: val(cols, "shift_hours"), daysOn: val(cols, "days_on"), daysOff: val(cols, "days_off") };
  });
  save();
  alert("Imported " + Object.keys(groups).length + " samples onto one event. Days and shifts stay on the samples. Finished runs are marked sample stopped.");
  openProject(p.id);
}
window.importFieldCsv = importFieldCsv;
var _projectSimple = projectHtml;
projectHtml = function () {
  var html = _projectSimple();
  if (html.indexOf("importCsv") >= 0) return html;
  return html.replace("</h2>", "</h2><label class=\"btn ghost\" style=\"display:inline-block\">Import field CSV<input id=\"importCsv\" type=\"file\" accept=\".csv,text/csv\" style=\"display:none\"></label>");
};
var _bindImport = bind;
bind = function () {
  _bindImport();
  var input = document.getElementById("importCsv");
  if (!input) return;
  input.onchange = function () {
    var file = input.files && input.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () { importFieldCsv(String(reader.result || "")); };
    reader.readAsText(file);
  };
};

function cocRuntime(sample) {
  if (!sample.startAt || !sample.endAt) return "";
  var ms = new Date(sample.endAt) - new Date(sample.startAt);
  if (!isFinite(ms) || ms < 0) return "";
  return Math.round(ms / 60000);
}
function cocVolume(sample) {
  var mins = cocRuntime(sample);
  var start = parseFloat(sample.startFlow);
  var end = parseFloat(sample.endFlow);
  var flow = isFinite(start) && isFinite(end) ? (start + end) / 2 : start;
  if (!mins || !isFinite(flow)) return "";
  return Math.round(mins * flow * 10) / 10;
}
async function createCoc() {
  var p = project(view.projectId);
  if (!p || typeof XLSX === "undefined") { alert("Open a project, then try Create COC again."); return; }
  var events = db.events.filter(function (e) { return e.projectId === p.id; });
  var samples = (db.trains || []).filter(function (s) { return events.some(function (e) { return e.id === s.eventId; }); });
  if (!samples.length) { alert("No samples on this project."); return; }
  var res = await fetch("coc-template.xlsx");
  var book = XLSX.read(await res.arrayBuffer(), { type: "array", cellDates: true });
  var ws = book.Sheets[book.SheetNames[0]];
  function cell(ref, value) { ws[ref] = { v: value, t: typeof value === "number" ? "n" : "s" }; }
  for (var r = 18; r < 76; r++) ["B","C","D","E","F","G","H","I","J","K","S","T"].forEach(function (col) { delete ws[col + r]; });
  var tests = ["INH","GYP","RES","SIL","DP","WLD"];
  var metal = ["WLD","CRM","CUF","FEO","MNF","NI","ZNF"];
  samples.forEach(function (s, n) {
    var r = 18 + n;
    var codes = (s.analyses || []).map(function (a) { return a.code; });
    var kind = s.rejected ? "rejected" : (s.trainKind === "blank" ? "blank" : "personal");
    cell("B" + r, s.mediaId || "");
    cell("C" + r, "N/A");
    cell("D" + r, (s.shiftDate || "").split("-").reverse().join("/"));
    cell("E" + r, kind === "blank" ? "Blank" : "Personal");
    if (kind === "rejected") cell("U" + r, "voided needs clean and return");
    else tests.forEach(function (code, i) {
      if (codes.indexOf(code) >= 0 || (code === "WLD" && metal.some(function (m) { return codes.indexOf(m) >= 0; }))) cell(XLSX.utils.encode_col(5 + i) + r, "x");
    });
    if (kind === "blank" || kind === "rejected") { cell("S" + r, "N/A"); cell("T" + r, "N/A"); }
    else { var mins = cocRuntime(s), vol = cocVolume(s); if (mins !== "") cell("S" + r, mins); if (vol !== "") cell("T" + r, vol); }
  });
  var widths = [14,22,10,12,14,12,10,12,12,16,28,8,8,8,8,8,8,8,12,14,28,8,12];
  ws["!cols"] = widths.map(function (w) { return { wch: w }; });
  ws["!rows"] = ws["!rows"] || [];
  ws["!rows"][16] = { hpt: 48 };
  XLSX.writeFile(book, (p.number || "ENVSS") + "_Laboratory_COC.xlsx");
}
window.createCoc = createCoc;
var _projectCoc = projectHtml;
projectHtml = function () {
  var html = _projectCoc();
  if (html.indexOf("importCsv") >= 0) return html;
  return html.replace("</h2>", "</h2><label class=\"btn ghost\" style=\"display:inline-block\">Import field CSV<input id=\"importCsv\" type=\"file\" accept=\".csv,text/csv\" style=\"display:none\"></label>");
};
var _eventCoc = eventHtml;
eventHtml = function () {
  var html = _eventCoc();
  if (html.indexOf("btnEventMenu") >= 0) return html;
  return html.replace("</h2>", "</h2><div class=\"menu-wrap\"><button class=\"btn ghost\" type=\"button\" id=\"btnEventMenu\">☰</button><div class=\"menu\" id=\"eventMenu\" hidden><button type=\"button\" id=\"btnCoc\">Create COC</button></div></div>");
};
var _bindEventCoc = bind;
bind = function () {
  _bindEventCoc();
  var menuBtn = document.getElementById("btnEventMenu");
  var menu = document.getElementById("eventMenu");
  if (menuBtn && menu) menuBtn.onclick = function () { menu.hidden = !menu.hidden; };
  var coc = document.getElementById("btnCoc");
  if (coc) coc.onclick = function () { if (menu) menu.hidden = true; createCoc(); };
  var input = document.getElementById("importCsv");
  if (input && !input.dataset.bound) {
    input.dataset.bound = "1";
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { importFieldCsv(String(reader.result || "")); };
      reader.readAsText(file);
    };
  }
};

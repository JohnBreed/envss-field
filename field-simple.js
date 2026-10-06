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
      var kind = val(cols, "type").toLowerCase() === "blank" ? "blank" : "airborne_personal";
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
    sample.status = sample.trainKind === "blank" ? "ended" : ((start && end) ? "ended" : "prepped");
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
  var flow = parseFloat(sample.startFlow);
  if (!mins || !isFinite(flow)) return "";
  return Math.round(mins * flow);
}
function createCoc() {
  var p = project(view.projectId);
  if (!p || typeof XLSX === "undefined") { alert("Open a project, then try Create COC again."); return; }
  var events = db.events.filter(function (e) { return e.projectId === p.id; });
  var samples = (db.trains || []).filter(function (s) { return events.some(function (e) { return e.id === s.eventId; }); });
  if (!samples.length) { alert("No samples on this project."); return; }
  var ws = {};
  function cell(ref, value) { if (value !== "" && value != null) ws[ref] = { v: value, t: typeof value === "number" ? "n" : "s" }; }
  cell("C1", "CHAIN OF CUSTODY FORM - Client");
  cell("R1", "ENVIROLAB GROUP");
  cell("R2", "National phone number 1300 424 344");
  cell("A3", "[Copyright and Confidential]");
  cell("A4", " Company:"); cell("B4", "Environmental Site Services"); cell("F4", "Client Project Name/Number/Site etc (ie report title):");
  cell("A5", " Contact Person:"); cell("B5", "Minah Munshi"); cell("F5", p.number || "");
  cell("A6", " Project Mgr:"); cell("B6", "Minah Munshi"); cell("F6", "PO No. (if applicable):");
  cell("A7", " Sampler:"); cell("B7", "Minah Munshi"); cell("F7", "Envirolab Quote No. :"); cell("J7", "Online price list");
  cell("A8", " Address:"); cell("B8", "10 Bermondsey St, West Leederville WA 6007"); cell("F8", "Date results required:");
  cell("F9", "Or choose:"); cell("H9", "x");
  cell("H10", "Standard"); cell("J10", "Same Day"); cell("L10", "1 day"); cell("N10", "2 day"); cell("P10", "3 day");
  cell("A11", " Phone:  "); cell("B11", "(08) 9355 4010"); cell("C11", " Mob:"); cell("D11", "0419 628 710");
  cell("F11", "Note: Inform lab in advance if urgent turnaround is required - surcharges apply");
  cell("A12", " Email Results to:"); cell("B12", "lab@envss.com.au"); cell("F12", "Additional report format:"); cell("L12", "Esdat"); cell("O12", "Equis");
  cell("F13", "Lab Comments:");
  cell("A14", " Email Invoice to:"); cell("B14", "accounts@envss.com.au & lab@envss.com.au");
  cell("A16", "Sample information"); cell("F16", "Tests Required");
  ["Envirolab Sample ID (Lab use only)", "Client Sample ID  or Information", "Depth", "Date Sampled", "Type of Sample", "Inhalable Dust", "Gypsum", "Respirable Dust", "Crystalline Silica", "Diesel Particulate Matter", "Welding Fume & Metals (Cr, Cu, FeO, Mn, Ni & ZnO)"].forEach(function (h, i) { cell(XLSX.utils.encode_cell({ r: 16, c: i }), h); });
  cell("S17", "Run Time (min)"); cell("T17", "Volume Sampled (L)"); cell("U17", "Provide as much information about the sample as you can");
  samples.forEach(function (s, n) {
    var codes = (s.analyses || []).map(function (a) { return a.code; });
    if (!codes.length && s.contaminantId) codes = [s.contaminantId];
    var r = 17 + n;
    cell(XLSX.utils.encode_cell({ r: r, c: 1 }), s.mediaId || "");
    cell(XLSX.utils.encode_cell({ r: r, c: 2 }), "N/A");
    cell(XLSX.utils.encode_cell({ r: r, c: 3 }), (s.shiftDate || "").split("-").reverse().join("/"));
    cell(XLSX.utils.encode_cell({ r: r, c: 4 }), s.trainKind === "blank" ? "Blank" : "Personal");
    [["INH", 5], ["GYP", 6], ["RES", 7], ["SIL", 8], ["DP", 9]].forEach(function (pair) { if (codes.indexOf(pair[0]) >= 0) cell(XLSX.utils.encode_cell({ r: r, c: pair[1] }), "x"); });
    if (["WLD", "CRM", "CUF", "FEO", "MNF", "NI", "ZNF"].some(function (code) { return codes.indexOf(code) >= 0; })) cell(XLSX.utils.encode_cell({ r: r, c: 10 }), "x");
    var mins = cocRuntime(s), vol = cocVolume(s);
    if (mins !== "") cell(XLSX.utils.encode_cell({ r: r, c: 18 }), mins);
    if (vol !== "") cell(XLSX.utils.encode_cell({ r: r, c: 19 }), vol);
  });
  var foot = 19 + samples.length;
  cell("B" + foot, "Please tick the box if observed settled sediment present in water samples is to be included in the extraction and/or analysis");
  cell("A" + (foot + 1), " Relinquished by (Company):"); cell("C" + (foot + 1), "ENVSS"); cell("E" + (foot + 1), "Received by (Company):");
  cell("A" + (foot + 2), " Print Name:"); cell("B" + (foot + 2), "Minah Munshi"); cell("E" + (foot + 2), "Print Name:");
  cell("A" + (foot + 3), " Date & Time:"); cell("E" + (foot + 3), "Date & Time:");
  cell("A" + (foot + 4), " Signature:"); cell("E" + (foot + 4), "Signature:");
  ws["!ref"] = "A1:U" + (foot + 4);
  var book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, "Client");
  XLSX.writeFile(book, (p.number || "ENVSS") + "_Laboratory_COC.xlsx");
}
window.createCoc = createCoc;
var _projectCoc = projectHtml;
projectHtml = function () {
  var html = _projectCoc();
  if (html.indexOf("createCoc") >= 0) return html;
  return html.replace("Import field CSV", "Import field CSV</label><button class=\"btn orange\" id=\"btnCoc\" type=\"button\">Create COC");
};
var _bindCoc = bind;
bind = function () {
  _bindCoc();
  var btn = document.getElementById("btnCoc");
  if (btn) btn.onclick = createCoc;
};

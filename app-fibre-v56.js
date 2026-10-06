window.ENVSS_FIBRE = "56";
var ENVSS_STATUSES = ["New", "ENVSS to propose start date", "In Progress", "Awaiting Start Date/PO/Information from Client", "Lab Results Pending", "Report Pending", "Report in Review", "Overdue - Finish Today", "On Hold", "Closed", "Cancelled"];

newProjectHtml = function () {
  var opts = ENVSS_STATUSES.map(function (s) {
    return "<option value=\"" + esc(s) + "\"" + (s === "In Progress" ? " selected" : "") + ">" + esc(s) + "</option>";
  }).join("");
  return "<div class=\"wrap\"><button class=\"btn ghost\" onclick=\"goDash()\">← Projects</button>" +
    "<h2 class=\"brand-type\" style=\"color:var(--navy)\">New project</h2>" +
    "<label>Job number</label><input id=\"nnum\" placeholder=\"001900\">" +
    "<label>Project title</label><input id=\"nname\" placeholder=\"001900-Client-HYG-site\">" +
    "<label>Client</label><input id=\"nclient\" placeholder=\"Client\">" +
    "<label>Site</label><input id=\"nsite\" placeholder=\"Site address\">" +
    "<label>Status</label><select id=\"nstatus\">" + opts + "</select>" +
    "<label>Project controller</label><input id=\"ncontroller\" placeholder=\"Name\">" +
    "<label>Controller email</label><input id=\"ncontrollerEmail\" placeholder=\"name@envss.com.au\">" +
    "<label>Job type</label><input id=\"njobType\" placeholder=\"HYG - Occupational Hygiene\" value=\"HYG - Occupational Hygiene\">" +
    "<div class=\"footer-actions\"><button class=\"btn orange\" id=\"btnCreateProj\">Create project</button></div>" +
    "<p class=\"help\">ENVSS Field v56</p></div>";
};

createProject = function () {
  var num = ((document.getElementById("nnum") || {}).value || "").trim();
  var name = ((document.getElementById("nname") || {}).value || "").trim();
  var client = ((document.getElementById("nclient") || {}).value || "").trim();
  var site = ((document.getElementById("nsite") || {}).value || "").trim();
  var status = ((document.getElementById("nstatus") || {}).value || "In Progress").trim();
  var controller = ((document.getElementById("ncontroller") || {}).value || "").trim();
  var controllerEmail = ((document.getElementById("ncontrollerEmail") || {}).value || "").trim();
  var jobType = ((document.getElementById("njobType") || {}).value || "").trim();
  if (!num) { alert("Enter a job number."); return; }
  if (db.projects.some(function (x) { return x.number === num; })) { alert("That job number already exists."); return; }
  var inactive = status === "Closed" || status === "Cancelled" || status === "On Hold";
  var p = {
    id: uid("p"), source: "field", number: num, name: name || num, client: client, site: site,
    status: status, active: !inactive, controller: controller, controllerEmail: controllerEmail, jobType: jobType
  };
  db.projects.push(p);
  save();
  openProject(p.id);
};

if (typeof render === "function") render();

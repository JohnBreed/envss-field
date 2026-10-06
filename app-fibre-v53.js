window.ENVSS_FIBRE = "53";

function isActiveProject(p) {
  if (!p) return false;
  if (p.source !== "podio") return true;
  const s = String(p.status || "").trim().toLowerCase();
  if (!s) return false;
  return s !== "closed" && s !== "cancelled" && s !== "on hold" && p.active !== false;
}

function keepActiveProjects() {
  db.projects = (db.projects || []).filter(isActiveProject);
}

dashHtml = function () {
  keepActiveProjects();
  const controllers = [];
  (db.projects || []).forEach(function (p) {
    if (p.controller && controllers.indexOf(p.controller) === -1) controllers.push(p.controller);
  });
  controllers.sort();
  if (!view.controller) view.controller = "all";
  const who = typeof whoText === "function" ? whoText() : "";
  const mine = (who.match(/[A-Z0-9._%+-]+@envss\.com\.au/i) || [""])[0].toLowerCase();
  const list = (db.projects || []).filter(function (p) {
    if (view.controller === "mine") return mine && String(p.controllerEmail || "").toLowerCase() === mine;
    if (view.controller && view.controller !== "all") return p.controller === view.controller;
    return true;
  }).sort(function (a, b) { return String(b.number || "").localeCompare(String(a.number || "")); });
  var html = "<div class=\"wrap\"><div class=\"row\"><h2 class=\"brand-type\" style=\"margin:0;color:var(--navy)\">Active projects</h2>";
  html += "<button class=\"btn orange\" onclick=\"openNewProject()\">New project</button></div>";
  html += "<label>Controller</label><select id=\"controllerFilter\">";
  html += "<option value=\"all\"" + (view.controller === "all" ? " selected" : "") + ">All controllers</option>";
  if (mine) html += "<option value=\"mine\"" + (view.controller === "mine" ? " selected" : "") + ">My jobs</option>";
  controllers.forEach(function (name) {
    html += "<option value=\"" + esc(name) + "\"" + (view.controller === name ? " selected" : "") + ">" + esc(name) + "</option>";
  });
  html += "</select>";
  const statuses = [];
  (db.projects || []).forEach(function (p) {
    if (p.status && statuses.indexOf(p.status) === -1) statuses.push(p.status);
  });
  statuses.sort();
  if (!view.statusFilter) view.statusFilter = "all";
  html += "<label>Status</label><select id=\"statusFilter\">";
  html += "<option value=\"all\"" + (view.statusFilter === "all" ? " selected" : "") + ">All active statuses</option>";
  statuses.forEach(function (name) {
    html += "<option value=\"" + esc(name) + "\"" + (view.statusFilter === name ? " selected" : "") + ">" + esc(name) + "</option>";
  });
  html += "</select>";
  const shown = list.filter(function (p) { return view.statusFilter === "all" || p.status === view.statusFilter; });
  html += "<p class=\"help\">" + shown.length + " active job" + (shown.length === 1 ? "" : "s") + ". Closed, cancelled and on hold are not shown.</p>";
  if (!shown.length) html += "<div class=\"empty\">No active projects in this filter.</div>";
  shown.forEach(function (p) {
    const n = (db.events || []).filter(function (e) { return e.projectId === p.id; }).length;
    html += "<div class=\"card\" onclick=\"openProject('" + p.id + "')\" style=\"cursor:pointer\"><div class=\"row\"><div class=\"grow\">";
    html += "<div class=\"brand-type\" style=\"font-weight:700;color:var(--navy);font-size:18px\">" + esc(p.name || p.number || "No title") + "</div>";
    html += "<div class=\"muted\">" + esc(p.number || "") + (p.client ? " · " + esc(p.client) : "") + (p.site ? " · " + esc(p.site) : "") + "</div>";
    html += "<div class=\"muted\">" + esc(p.controller || "No controller") + " · " + n + " event" + (n === 1 ? "" : "s") + "</div>";
    html += "</div>" + (typeof badge === "function" ? badge(p.status || "active") : "<span class=\"badge\">" + esc(p.status || "") + "</span>") + "</div></div>";
  });
  html += "<p class=\"help\">ENVSS Field v53</p></div>";
  return html;
};

const _pull51 = pullRemote;
pullRemote = async function () {
  await _pull51();
  keepActiveProjects();
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
  if (view && view.page === "dash" && typeof render === "function") render();
};
keepActiveProjects();

const _bind51 = bind;
bind = function () {
  _bind51();
  const sel = document.getElementById("controllerFilter");
  if (sel) sel.onchange = function () { view.controller = sel.value; render(); };
  const st = document.getElementById("statusFilter");
  if (st) st.onchange = function () { view.statusFilter = st.value; render(); };
};
if (typeof render === "function") render();

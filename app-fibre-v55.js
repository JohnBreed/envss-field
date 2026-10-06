window.ENVSS_FIBRE = "55";

function podioStatus(p) {
  return String((p && p.status) || "").trim();
}

dashHtml = function () {
  const controllers = [];
  const statuses = [];
  (db.projects || []).forEach(function (p) {
    if (p.source === "podio" && p.active === false) return;
    if (p.controller && controllers.indexOf(p.controller) === -1) controllers.push(p.controller);
    if (podioStatus(p) && statuses.indexOf(podioStatus(p)) === -1) statuses.push(podioStatus(p));
  });
  controllers.sort();
  statuses.sort();
  if (!view.controller) view.controller = "all";
  if (!view.statusFilter) view.statusFilter = "all";
  const who = typeof whoText === "function" ? whoText() : "";
  const mine = (who.match(/[A-Z0-9._%+-]+@envss\.com\.au/i) || [""])[0].toLowerCase();
  const list = (db.projects || []).filter(function (p) {
    if (p.source === "podio" && p.active === false) return false;
    if (view.controller === "mine") return mine && String(p.controllerEmail || "").toLowerCase() === mine;
    if (view.controller && view.controller !== "all") return p.controller === view.controller;
    if (view.statusFilter !== "all" && podioStatus(p) !== view.statusFilter) return false;
    return true;
  }).sort(function (a, b) { return String(b.number || "").localeCompare(String(a.number || "")); });
  var html = "<div class=\"wrap\"><div class=\"row\"><h2 class=\"brand-type\" style=\"margin:0;color:var(--navy)\">Active projects</h2>";
  html += "<button class=\"btn orange\" onclick=\"openNewProject()\">New project</button></div>";
  html += "<label>Controller</label><select id=\"controllerFilter\">";
  html += "<option value=\"all\"" + (view.controller === "all" ? " selected" : "") + ">All controllers</option>";
  if (mine) html += "<option value=\"mine\"" + (view.controller === "mine" ? " selected" : "") + ">My jobs</option>";
  controllers.forEach(function (name) { html += "<option value=\"" + esc(name) + "\"" + (view.controller === name ? " selected" : "") + ">" + esc(name) + "</option>"; });
  html += "</select><label>Status</label><select id=\"statusFilter\">";
  html += "<option value=\"all\"" + (view.statusFilter === "all" ? " selected" : "") + ">All active statuses</option>";
  statuses.forEach(function (name) { html += "<option value=\"" + esc(name) + "\"" + (view.statusFilter === name ? " selected" : "") + ">" + esc(name) + "</option>"; });
  html += "</select>";
  html += "<p class=\"help\">" + list.length + " active job" + (list.length === 1 ? "" : "s") + ".</p>";
  if (!list.length) html += "<div class=\"empty\">No active projects. Pull from Podio has not arrived on this device yet.</div>";
  list.forEach(function (p) {
    const title = p.name || p.number || "No title";
    const status = podioStatus(p) || "No status";
    html += "<div class=\"card\" onclick=\"openProject('" + p.id + "')\" style=\"cursor:pointer\"><div class=\"row\" style=\"align-items:flex-start\"><div class=\"grow\">";
    html += "<div class=\"brand-type\" style=\"font-weight:700;color:var(--navy);font-size:18px\">" + esc(title) + "</div>";
    html += "<div class=\"muted\">" + esc(p.number || "") + (p.client ? " · " + esc(p.client) : "") + (p.site ? " · " + esc(p.site) : "") + "</div>";
    html += "<div class=\"muted\">" + esc(p.controller || "No controller") + "</div>";
    html += "</div><div style=\"font-weight:700;color:var(--navy);text-align:right;max-width:140px\">" + esc(status) + "</div></div></div>";
  });
  html += "<p class=\"help\">ENVSS Field v55</p></div>";
  return html;
};

const _pull55 = pullRemote;
pullRemote = async function () {
  await _pull55();
  db.projects = (db.projects || []).filter(function (p) { return !(p.source === "podio" && p.active === false); });
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
  if (typeof render === "function") render();
};

const _bind55 = bind;
bind = function () {
  _bind55();
  const sel = document.getElementById("controllerFilter");
  if (sel) sel.onchange = function () { view.controller = sel.value; render(); };
  const st = document.getElementById("statusFilter");
  if (st) st.onchange = function () { view.statusFilter = st.value; render(); };
};

if (typeof render === "function") render();
if (typeof pullRemote === "function") pullRemote();

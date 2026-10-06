window.ENVSS_FIBRE = "49";

function projectActive(p) {
  if (!p) return false;
  if (p.source !== "podio") return true;
  if (p.active === false) return false;
  const s = String(p.status || "").trim().toLowerCase();
  return s !== "closed" && s !== "cancelled" && s !== "on hold";
}

dashHtml = function () {
  const who = typeof whoText === "function" ? whoText() : "";
  const mine = (who.match(/[A-Z0-9._%+-]+@envss\.com\.au/i) || [""])[0].toLowerCase();
  const controllers = [];
  (db.projects || []).forEach(function (p) {
    if (p.controller && controllers.indexOf(p.controller) === -1) controllers.push(p.controller);
  });
  controllers.sort();
  if (!view.controller) view.controller = "all";
  if (view.showClosed == null) view.showClosed = false;
  const list = (db.projects || []).filter(function (p) {
    if (!view.showClosed && !projectActive(p)) return false;
    if (view.controller === "mine") return mine && String(p.controllerEmail || "").toLowerCase() === mine;
    if (view.controller && view.controller !== "all") return p.controller === view.controller;
    return true;
  }).sort(function (a, b) { return String(b.number || "").localeCompare(String(a.number || "")); });
  var html = "<div class=\"wrap\"><div class=\"row\"><h2 class=\"brand-type\" style=\"margin:0;color:var(--navy)\">Projects</h2>";
  html += "<button class=\"btn orange\" onclick=\"openNewProject()\">New project</button></div>";
  html += "<label>Controller</label><select id=\"controllerFilter\">";
  html += "<option value=\"all\"" + (view.controller === "all" ? " selected" : "") + ">All controllers</option>";
  if (mine) html += "<option value=\"mine\"" + (view.controller === "mine" ? " selected" : "") + ">My jobs</option>";
  controllers.forEach(function (name) {
    html += "<option value=\"" + esc(name) + "\"" + (view.controller === name ? " selected" : "") + ">" + esc(name) + "</option>";
  });
  html += "</select>";
  html += "<label class=\"check-row\"><input type=\"checkbox\" id=\"showClosed\"" + (view.showClosed ? " checked" : "") + "> Include closed, cancelled and on hold</label>";
  html += "<p class=\"help\">" + list.length + " job" + (list.length === 1 ? "" : "s") + ". Active jobs come from Podio. The phone does not write back.</p>";
  if (!list.length) html += "<div class=\"empty\">No projects in this filter.</div>";
  list.forEach(function (p) {
    const n = (db.events || []).filter(function (e) { return e.projectId === p.id; }).length;
    html += "<div class=\"card\" onclick=\"openProject('" + p.id + "')\" style=\"cursor:pointer\"><div class=\"row\"><div class=\"grow\">";
    html += "<div class=\"brand-type\" style=\"font-weight:700;color:var(--navy);font-size:18px\">" + esc(p.number || "No number") + "</div>";
    html += "<div class=\"muted\">" + esc(p.client || p.name || "") + (p.site ? " · " + esc(p.site) : "") + "</div>";
    html += "<div class=\"muted\">" + esc(p.controller || "No controller") + (p.status ? " · " + esc(p.status) : "") + " · " + n + " event" + (n === 1 ? "" : "s") + "</div>";
    html += "</div></div></div>";
  });
  html += "<p class=\"help\">ENVSS Field v49</p></div>";
  return html;
};

const _project49 = projectHtml;
projectHtml = function () {
  const p = typeof project === "function" ? project(view.projectId) : null;
  var html = _project49();
  if (p && p.source === "podio" && html.indexOf("podio-meta") === -1) {
    const meta = "<div id=\"podio-meta\" class=\"muted\" style=\"margin:6px 0\">" + esc(p.client || "") + (p.site ? " · " + esc(p.site) : "") + (p.controller ? " · " + esc(p.controller) : "") + (p.status ? " · " + esc(p.status) : "") + "</div>";
    html = html.replace("</h2>", "</h2>" + meta);
  }
  return html.replace(/ENVSS Field v\d+/g, "ENVSS Field v49");
};

const _bind49 = bind;
bind = function () {
  _bind49();
  const sel = document.getElementById("controllerFilter");
  if (sel) sel.onchange = function () { view.controller = sel.value; render(); };
  const closed = document.getElementById("showClosed");
  if (closed) closed.onchange = function () { view.showClosed = closed.checked; render(); };
};

["eventHtml"].forEach(function (name) {
  if (typeof window[name] !== "function") return;
  const orig = window[name];
  window[name] = function () { return String(orig()).replace(/ENVSS Field v\d+/g, "ENVSS Field v49"); };
});
if (typeof render === "function") render();

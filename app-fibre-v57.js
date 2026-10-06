window.ENVSS_FIBRE = "57";

function readProjectDraft() {
  view.newProjectDraft = view.newProjectDraft || {};
  ["nnum", "nname", "nclient", "nsite", "nstatus", "ncontroller", "ncontrollerEmail", "njobType"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) view.newProjectDraft[id] = el.value;
  });
}
function draftVal(id, fallback) {
  var d = view.newProjectDraft || {};
  return d[id] != null ? d[id] : (fallback || "");
}

if (typeof newProjectHtml === "function") {
  var _newProject57 = newProjectHtml;
  newProjectHtml = function () {
    var html = _newProject57();
    html = html.replace('id="nnum"', 'id="nnum" value="' + esc(draftVal("nnum")) + '"');
    html = html.replace('id="nname"', 'id="nname" value="' + esc(draftVal("nname")) + '"');
    html = html.replace('id="nclient"', 'id="nclient" value="' + esc(draftVal("nclient")) + '"');
    html = html.replace('id="nsite"', 'id="nsite" value="' + esc(draftVal("nsite")) + '"');
    html = html.replace('id="ncontroller"', 'id="ncontroller" value="' + esc(draftVal("ncontroller")) + '"');
    html = html.replace('id="ncontrollerEmail"', 'id="ncontrollerEmail" value="' + esc(draftVal("ncontrollerEmail")) + '"');
    html = html.replace('id="njobType"', 'id="njobType" value="' + esc(draftVal("njobType", "HYG - Occupational Hygiene")) + '"');
    if (draftVal("nstatus")) html = html.replace('value="' + esc(draftVal("nstatus")) + '"', 'value="' + esc(draftVal("nstatus")) + '" selected');
    return html.replace(/ENVSS Field v\d+/g, "ENVSS Field v57");
  };
}

var _render57 = render;
render = function () {
  if (view && view.page === "newProject") readProjectDraft();
  var ae = document.activeElement;
  if (view && view.page === "newProject" && ae && (ae.tagName === "INPUT" || ae.tagName === "SELECT" || ae.tagName === "TEXTAREA")) {
    window._pendingRender57 = true;
    return;
  }
  _render57();
};

var _pull57 = pullRemote;
pullRemote = async function () {
  if (view && view.page === "newProject") return;
  await _pull57();
};

var _bind57 = bind;
bind = function () {
  _bind57();
  if (!view || view.page !== "newProject") return;
  document.querySelectorAll("#app input, #app select, #app textarea").forEach(function (el) {
    if (el._draft57) return;
    el._draft57 = true;
    el.addEventListener("input", readProjectDraft);
    el.addEventListener("change", readProjectDraft);
  });
};

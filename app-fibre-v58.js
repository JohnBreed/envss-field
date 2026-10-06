window.ENVSS_FIBRE = "58";
openNewProject = function () {
  view.page = "newProject";
  view.newProjectDraft = view.newProjectDraft || {};
  if (typeof render === "function") {
    var ae = document.activeElement;
    if (ae && ae.blur) ae.blur();
    render();
  }
};
var _render58 = render;
render = function () {
  var ae = document.activeElement;
  var typing = view && view.page === "newProject" && ae && ae.closest && ae.closest("#app") && (ae.tagName === "INPUT" || ae.tagName === "SELECT" || ae.tagName === "TEXTAREA");
  if (typing) return;
  _render58();
};
if (typeof render === "function") render();

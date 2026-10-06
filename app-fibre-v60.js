window.ENVSS_FIBRE = "60";

function analysesOf(t) {
  if (!t) return [];
  if (!Array.isArray(t.analyses) || !t.analyses.length) {
    var c = typeof contam === "function" ? contam(t.contaminantId) : null;
    t.analyses = c ? [{ code: c.code || t.contaminantId, name: c.name || "", irsst: t.irsst || "" }] : [];
  }
  return t.analyses;
}
function analysisHtml(t) {
  var rows = analysesOf(t).map(function (a, i) {
    return "<div class=\"row\"><span class=\"grow\">" + esc(a.code) + (a.name ? " — " + esc(a.name) : "") + "</span><button type=\"button\" class=\"btn ghost\" data-drop-analysis=\"" + i + "\">Remove</button></div>";
  }).join("");
  return "<label>Analyses on this sample</label><div id=\"analysisList\">" + (rows || "<p class=\"muted\">None yet. Add inhalable dust, gypsum, or another analysis. Same cassette.</p>") + "</div>" +
    "<div class=\"combo\"><input id=\"addAnalysis\" placeholder=\"Add analysis — INH, GYP, SIL, DPM\"><div class=\"suggest\" id=\"sug-analysis\"></div></div>" +
    "<p class=\"help\">One pump, head and cassette. Extra analysis is another lab test on the same filter.</p>";
}
if (typeof trainHtml === "function") {
  var _train60 = trainHtml;
  trainHtml = function () {
    var html = _train60();
    if (html.indexOf("analysisList") === -1) html = html.replace("id=\"sug-contam\"></div>", "id=\"sug-contam\"></div>" + analysisHtml(typeof trainById === "function" ? trainById(view.trainId) : null));
    return html.replace(/ENVSS Field v\d+/g, "ENVSS Field v60");
  };
}
function addAnalysis(code) {
  var t = trainById(view.trainId);
  if (!t || !code) return;
  var c = typeof contam === "function" ? contam(code) : null;
  var item = { code: (c && c.code) || code, name: (c && c.name) || "", irsst: "" };
  analysesOf(t);
  if (!t.analyses.some(function (a) { return a.code === item.code; })) t.analyses.push(item);
  t.contaminantId = t.analyses[0] ? t.analyses[0].code : t.contaminantId;
  if (typeof saveQuiet === "function") saveQuiet(); else if (typeof save === "function") save();
  render();
}
function dropAnalysis(i) {
  var t = trainById(view.trainId);
  if (!t) return;
  analysesOf(t).splice(i, 1);
  t.contaminantId = t.analyses[0] ? t.analyses[0].code : "";
  if (typeof saveQuiet === "function") saveQuiet(); else if (typeof save === "function") save();
  render();
}
var _bind60 = bind;
bind = function () {
  _bind60();
  var input = document.getElementById("addAnalysis");
  var sug = document.getElementById("sug-analysis");
  if (input && sug && db.catalogs && db.catalogs.contaminants) {
    input.oninput = function () {
      var q = input.value.toLowerCase();
      var hits = db.catalogs.contaminants.filter(function (c) { return (c.code + " " + c.name).toLowerCase().indexOf(q) >= 0; }).slice(0, 8);
      sug.innerHTML = hits.map(function (c) { return "<button type=\"button\" data-add-code=\"" + esc(c.code) + "\">" + esc(c.code) + " — " + esc(c.name) + "</button>"; }).join("");
      sug.querySelectorAll("[data-add-code]").forEach(function (btn) { btn.onmousedown = function (e) { e.preventDefault(); addAnalysis(btn.getAttribute("data-add-code")); }; });
    };
  }
  document.querySelectorAll("[data-drop-analysis]").forEach(function (btn) {
    btn.onclick = function () { dropAnalysis(Number(btn.getAttribute("data-drop-analysis"))); };
  });
};
window.addAnalysis = addAnalysis;
window.dropAnalysis = dropAnalysis;

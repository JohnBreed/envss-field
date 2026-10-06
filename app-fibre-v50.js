window.ENVSS_FIBRE = "50";
const _pull50 = pullRemote;
pullRemote = async function () {
  const c = typeof sbCfg === "function" ? sbCfg() : null;
  if (c && typeof sbHeaders === "function") {
    const all = [];
    for (let offset = 0; offset < 6000; offset += 1000) {
      const res = await fetch(c.supabaseUrl + "/rest/v1/envss_projects?select=id,payload,updated_at&limit=1000&offset=" + offset, { headers: sbHeaders() });
      if (!res.ok) break;
      const rows = await res.json();
      all.push.apply(all, rows);
      if (!rows.length || rows.length < 1000) break;
    }
    window._podioProjectRows = all;
  }
  await _pull50();
  if (window._podioProjectRows && typeof mergeById === "function") {
    db.projects = mergeById(db.projects, window._podioProjectRows);
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
    if (view && view.page === "dash" && typeof render === "function") render();
  }
};
function stampV50(html) { return String(html || "").replace(/ENVSS Field v\d+/g, "ENVSS Field v50"); }
["dashHtml", "projectHtml", "eventHtml"].forEach(function (name) {
  if (typeof window[name] !== "function") return;
  const orig = window[name];
  window[name] = function () { return stampV50(orig()); };
});
if (typeof render === "function") render();

window.ENVSS_FIBRE = "47";

function saveQuiet() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
  if (typeof pushRemote === "function") {
    try { pushRemote(); } catch (err) {}
  }
}

if (typeof modeFields === "function") {
  const _mode47 = modeFields;
  modeFields = function (t) {
    return String(_mode47(t) || "").replace(/<div><label>Occupation<\/label><input id="occupation"[^>]*><\/div>/, "");
  };
}

if (typeof mineCodesHtml === "function") {
  const _mine47 = mineCodesHtml;
  mineCodesHtml = function (t) {
    var html = _mine47(t);
    if (html.indexOf("<details") === -1) return html;
    const open = window._mineOpen47 ? "block" : "none";
    html = html.replace("<details id=\"mineBox\" style=\"margin-top:8px\"><summary class=\"brand-type\" style=\"cursor:pointer;color:var(--navy)\">Mines Act / SRS fields</summary>",
      "<button type=\"button\" class=\"btn ghost\" id=\"mineToggle\" style=\"margin-top:8px\">Mines Act / SRS fields</button><div id=\"mineBox\" style=\"display:" + open + "\">");
    html = html.replace("</details>", "</div>");
    return html;
  };
}

if (typeof audit === "function" && !window._audit47) {
  window._audit47 = audit;
  audit = function (t, action, detail) {
    window._audit47(t, action, detail);
    const row = t.audit && t.audit[t.audit.length - 1];
    if (row) row.who = typeof whoText === "function" ? whoText() : (row.who || "");
  };
}

function rememberTrainFields(t) {
  if (!t) return;
  const g = function (id) { return document.getElementById(id); };
  if (g("occSearch")) {
    const raw = g("occSearch").value.trim();
    const code = raw.split("—")[0].split("-")[0].trim();
    if (/^\d+$/.test(code)) {
      t.occupationCode = code;
      t.person = t.person || {};
      const name = raw.indexOf("—") !== -1 ? raw.split("—").slice(1).join("—").trim() : (t.person.occupation || "");
      if (name) t.person.occupation = name;
    }
  }
  if (g("locSearch")) {
    const raw = g("locSearch").value.trim();
    const code = raw.split("—")[0].trim();
    if (/^\d+$/.test(code)) t.locationCode = code;
  }
  if (g("seg")) t.seg = g("seg").value.trim();
  ["pump", "head", "media", "startFlow", "endFlow", "location", "cowlNo"].forEach(function (id) {
    if (!g(id)) return;
    if (id === "pump") t.pumpSerial = g(id).value.trim();
    if (id === "head") t.headId = g(id).value.trim();
    if (id === "media") t.mediaId = g(id).value.trim();
    if (id === "startFlow") t.startFlow = g(id).value;
    if (id === "endFlow") t.endFlow = g(id).value;
    if (id === "location") t.location = g(id).value;
    if (id === "cowlNo") t.cowlNo = g(id).value.trim();
  });
}

const _render47 = render;
render = function () {
  const ae = document.activeElement;
  const typing = ae && view && view.page === "train" && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA");
  if (typing) {
    window._pendingRender47 = true;
    return;
  }
  _render47();
};

const _bind47 = bind;
bind = function () {
  _bind47();
  const toggle = document.getElementById("mineToggle");
  const box = document.getElementById("mineBox");
  if (toggle && box) {
    toggle.onclick = function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      window._mineOpen47 = box.style.display === "none";
      box.style.display = window._mineOpen47 ? "block" : "none";
    };
  }
  if (view.page !== "train") return;
  const t = db.trains.find(function (x) { return x.id === view.trainId; });
  if (!t) return;
  document.querySelectorAll("#app input, #app textarea").forEach(function (el) {
    if (el._hold47) return;
    el._hold47 = true;
    el.addEventListener("focus", function () { window._holdRender47 = true; });
    el.addEventListener("blur", function () {
      rememberTrainFields(t);
      saveQuiet();
      window._holdRender47 = false;
      if (window._pendingRender47) {
        window._pendingRender47 = false;
        setTimeout(function () { if (!window._holdRender47) _render47(); }, 280);
      }
    });
  });
  ["occSearch", "locSearch"].forEach(function (id) {
    const input = document.getElementById(id);
    const sug = document.getElementById("sug-" + id);
    if (!sug || sug._pick47) return;
    sug._pick47 = true;
    sug.addEventListener("mousedown", function (ev) {
      const row = ev.target.closest("div");
      if (!row) return;
      ev.preventDefault();
      ev.stopPropagation();
      const val = row.getAttribute("data-v") || "";
      if (input) input.value = val;
      rememberTrainFields(t);
      if (typeof audit === "function") audit(t, "edit", id + " set to " + val + " by " + (typeof whoText === "function" ? whoText() : ""));
      saveQuiet();
      if (box) box.style.display = "block";
      window._mineOpen47 = true;
    });
  });
};

function stampV47(html) {
  return String(html || "").replace(/ENVSS Field v\d+/g, "ENVSS Field v47");
}
["dashHtml", "projectHtml", "eventHtml"].forEach(function (name) {
  if (typeof window[name] !== "function") return;
  const orig = window[name];
  window[name] = function () { return stampV47(orig()); };
});

if (typeof render === "function") render();

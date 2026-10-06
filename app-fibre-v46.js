window.ENVSS_FIBRE = "46";

function isNumCode(v) {
  return /^\d+$/.test(String(v || "").trim());
}

function cleanSrsCatalogs() {
  function keep(rows) {
    return (rows || []).filter(function (r) { return r && isNumCode(r.code); });
  }
  if (window.ENVSS_CATALOGS) {
    ENVSS_CATALOGS.occupations = keep(ENVSS_CATALOGS.occupations);
    ENVSS_CATALOGS.locations = keep(ENVSS_CATALOGS.locations);
  }
  if (typeof db !== "undefined" && db.catalogs) {
    db.catalogs.occupations = keep(db.catalogs.occupations);
    db.catalogs.locations = keep(db.catalogs.locations);
  }
  (db.trains || []).forEach(function (t) {
    if (t.occupationCode && !isNumCode(t.occupationCode)) t.occupationCode = "";
    if (t.locationCode && !isNumCode(t.locationCode)) t.locationCode = "";
    if (t.person && t.person.occupation && !isNumCode(t.person.occupationCode) && /Published gaps|unused gaps|Dual heading/.test(t.person.occupation)) {
      t.person.occupation = "";
    }
  });
}
cleanSrsCatalogs();

function eventIsMines46(ev) {
  return !!(ev && (ev.minesAct === true || ev.minesAct === "yes"));
}

mineCodesHtml = function (t) {
  if (typeof isBlank === "function" && isBlank(t)) return "";
  const ev = typeof eventById === "function" ? eventById(t.eventId) : null;
  const mines = eventIsMines46(ev);
  const occ = typeof findOcc === "function" ? findOcc(t.occupationCode || (t.person && t.person.occupation)) : null;
  const loc = typeof findLoc === "function" ? findLoc(t.locationCode) : null;
  const occLabel = occ && isNumCode(occ.code) ? (occ.code + " — " + occ.name) : (isNumCode(t.occupationCode) ? t.occupationCode : ((t.person && t.person.occupation) || ""));
  const locLabel = loc && isNumCode(loc.code) ? (loc.code + " — " + loc.name) : (isNumCode(t.locationCode) ? t.locationCode : "");
  var html = "<label>Occupation</label><div class=\"combo\"><input id=\"occSearch\" value=\"" + esc(occLabel) + "\" placeholder=\"411000 or processing plant\"><div class=\"suggest\" id=\"sug-occSearch\"></div></div>";
  html += "<input type=\"hidden\" id=\"occCode\" value=\"" + esc(isNumCode(t.occupationCode) ? t.occupationCode : ((occ && occ.code) || "")) + "\">";
  if (occ && isNumCode(occ.code)) {
    html += "<p class=\"muted\">Parent: " + esc(occ.parentCode ? (occ.parentCode + " — " + (occ.parentName || "")) : "—") + "<br>Major group: " + esc(occ.majorGroup || "—") + "</p>";
  }
  if (!mines) return html;
  html += "<details id=\"mineBox\" style=\"margin-top:8px\"><summary class=\"brand-type\" style=\"cursor:pointer;color:var(--navy)\">Mines Act / SRS fields</summary>";
  html += "<p class=\"help\">This event is a Mines Reg job. Location code and SEG are required for the SRS upload.</p>";
  html += "<label>Location (SRS)</label><div class=\"combo\"><input id=\"locSearch\" value=\"" + esc(locLabel) + "\" placeholder=\"413 or crushing\"><div class=\"suggest\" id=\"sug-locSearch\"></div></div>";
  html += "<input type=\"hidden\" id=\"locCode\" value=\"" + esc(isNumCode(t.locationCode) ? t.locationCode : "") + "\">";
  html += "<label>SEG</label><div class=\"combo\"><input id=\"seg\" value=\"" + esc(t.seg || "") + "\" placeholder=\"Type or add SEG\"><div class=\"suggest\" id=\"sug-seg\"></div></div>";
  html += "<button type=\"button\" class=\"btn ghost\" id=\"btnAddSeg\">Add SEG</button>";
  html += "</details>";
  return html;
};

function hideAudit(html) {
  html = String(html || "");
  html = html.replace('id="auditBox"', 'id="auditBox" hidden');
  if (html.indexOf("auditToggle") === -1 && html.indexOf("auditBox") !== -1) {
    html = html.replace("<div id=\"auditBox\"", "<h3 class=\"brand-type\" style=\"color:var(--navy);margin-top:22px;cursor:pointer\" id=\"auditToggle\">Audit log</h3><div id=\"auditBox\"");
  }
  return html;
}
if (typeof hygieneTrainHtml === "function") {
  const _hyg46 = hygieneTrainHtml;
  hygieneTrainHtml = function () { return hideAudit(_hyg46()); };
}
if (typeof fibreTrainHtml === "function") {
  const _fib46 = fibreTrainHtml;
  fibreTrainHtml = function (t, ev) { return hideAudit(_fib46(t, ev)); };
}

function markMines(html) {
  (db.events || []).forEach(function (e) {
    if (!eventIsMines46(e) || !e.code) return;
    const tag = e.code + " · Mines Reg";
    if (html.indexOf(tag) !== -1) return;
    html = html.split(e.code).join(tag);
  });
  return html.replace(/ENVSS Field v\d+/g, "ENVSS Field v46");
}
["dashHtml", "projectHtml", "eventHtml"].forEach(function (name) {
  if (typeof window[name] !== "function") return;
  const orig = window[name];
  window[name] = function () { return markMines(orig()); };
});

function noteChange(t, field, next) {
  const prev = t._seen46 && t._seen46[field];
  const now = String(next == null ? "" : next);
  if (prev == null || prev === now) {
    t._seen46 = t._seen46 || {};
    t._seen46[field] = now;
    return;
  }
  t._seen46[field] = now;
  if (typeof audit === "function") audit(t, "edit", field + ": " + (prev || "—") + " → " + (now || "—"));
}

const _bind46 = bind;
bind = function () {
  cleanSrsCatalogs();
  _bind46();
  const toggle = document.getElementById("auditToggle");
  const box = document.getElementById("auditBox");
  if (toggle && box) {
    toggle.onclick = function () { box.hidden = !box.hidden; };
  }
  if (view.page !== "train") return;
  const t = db.trains.find(function (x) { return x.id === view.trainId; });
  if (!t) return;
  const fields = ["occSearch", "locSearch", "seg", "contam", "pump", "head", "media", "startFlow", "endFlow", "startAt", "endAt", "location", "cowlNo", "daysOff"];
  fields.forEach(function (id) {
    const el = document.getElementById(id);
    if (!el || el._aud46) return;
    el._aud46 = true;
    noteChange(t, id, el.value);
    el.addEventListener("change", function () {
      noteChange(t, id, el.value);
      if (typeof saveQuiet === "function") saveQuiet();
    });
  });
};

if (typeof render === "function") render();

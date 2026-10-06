window.ENVSS_FIBRE = "48";

function minesEvent(t) {
  const ev = typeof eventById === "function" ? eventById(t.eventId) : null;
  return !!(ev && (ev.minesAct === true || ev.minesAct === "yes"));
}

modeFields = function (t) {
  if (t.mode === "static") {
    return "<label>Static location</label><input id=\"location\" value=\"" + esc(t.location) + "\" placeholder=\"e.g. Crusher west\">";
  }
  const p = t.person || {};
  return "<div class=\"grid2\">" +
    "<div><label>First name</label><input id=\"first\" value=\"" + esc(p.first) + "\"></div>" +
    "<div><label>Last name</label><input id=\"last\" value=\"" + esc(p.last) + "\"></div>" +
    "<div><label>Date of birth</label><input id=\"dob\" type=\"date\" value=\"" + esc(p.dob) + "\"></div>" +
    "<div><label>Company / contractor</label><input id=\"company\" value=\"" + esc(p.company) + "\"></div>" +
    "<div><label>Hours / shift</label><input id=\"hours\" value=\"" + esc(p.hours) + "\"></div>" +
    "<div><label>Days on</label><input id=\"daysOn\" value=\"" + esc(p.daysOn) + "\"></div>" +
    "<div><label>Days off</label><input id=\"daysOff\" value=\"" + esc(p.daysOff) + "\"></div>" +
    "</div>";
};

mineCodesHtml = function (t) {
  if (typeof isBlank === "function" && isBlank(t)) return "";
  const p = t.person || {};
  if (!minesEvent(t)) {
    return "<label>Occupation</label><input id=\"occupation\" value=\"" + esc(p.occupation || "") + "\" placeholder=\"Job title\">";
  }
  const occ = typeof findOcc === "function" ? findOcc(t.occupationCode || p.occupation) : null;
  const loc = typeof findLoc === "function" ? findLoc(t.locationCode) : null;
  const occLabel = occ && /^\d+$/.test(String(occ.code || "")) ? (occ.code + " — " + occ.name) : (/^\d+$/.test(String(t.occupationCode || "")) ? t.occupationCode : (p.occupation || ""));
  const locLabel = loc && /^\d+$/.test(String(loc.code || "")) ? (loc.code + " — " + loc.name) : (/^\d+$/.test(String(t.locationCode || "")) ? t.locationCode : "");
  const open = window._mineOpen48 ? "block" : "none";
  var html = "<label>Occupation (SRS)</label><div class=\"combo\"><input id=\"occSearch\" value=\"" + esc(occLabel) + "\" placeholder=\"411000 or processing plant\" autocomplete=\"off\"><div class=\"suggest\" id=\"sug-occSearch\"></div></div>";
  html += "<input type=\"hidden\" id=\"occCode\" value=\"" + esc(/^\d+$/.test(String(t.occupationCode || "")) ? t.occupationCode : ((occ && occ.code) || "")) + "\">";
  if (occ && /^\d+$/.test(String(occ.code || ""))) {
    html += "<p class=\"muted\">Parent: " + esc(occ.parentCode ? (occ.parentCode + " — " + (occ.parentName || "")) : "—") + "<br>Major group: " + esc(occ.majorGroup || "—") + "</p>";
  }
  html += "<button type=\"button\" class=\"btn ghost\" id=\"mineToggle\" style=\"margin-top:8px\">Mines Act / SRS fields</button>";
  html += "<div id=\"mineBox\" style=\"display:" + open + "\">";
  html += "<p class=\"help\">Mines Reg job. Location code and SEG are for the SRS upload.</p>";
  html += "<label>Location (SRS)</label><div class=\"combo\"><input id=\"locSearch\" value=\"" + esc(locLabel) + "\" placeholder=\"413 or crushing\" autocomplete=\"off\"><div class=\"suggest\" id=\"sug-locSearch\"></div></div>";
  html += "<input type=\"hidden\" id=\"locCode\" value=\"" + esc(/^\d+$/.test(String(t.locationCode || "")) ? t.locationCode : "") + "\">";
  html += "<label>SEG</label><div class=\"combo\"><input id=\"seg\" value=\"" + esc(t.seg || "") + "\" placeholder=\"Type or add SEG\" autocomplete=\"off\"><div class=\"suggest\" id=\"sug-seg\"></div></div>";
  html += "<button type=\"button\" class=\"btn ghost\" id=\"btnAddSeg\">Add SEG</button></div>";
  return html;
};

function stripExtraOccupation(html) {
  const s = String(html || "");
  if (s.indexOf("occSearch") === -1 || s.indexOf("id=\"occupation\"") === -1) return s;
  return s.replace(/<div><label>Occupation<\/label><input id="occupation"[^>]*><\/div>/g, "")
    .replace(/<label>Occupation<\/label><input id="occupation"[^>]*>/g, "");
}
if (typeof hygieneTrainHtml === "function") {
  const _h48 = hygieneTrainHtml;
  hygieneTrainHtml = function () { return stripExtraOccupation(_h48()); };
}
if (typeof fibreTrainHtml === "function") {
  const _f48 = fibreTrainHtml;
  fibreTrainHtml = function (t, ev) { return stripExtraOccupation(_f48(t, ev)); };
}

const _bind48 = bind;
bind = function () {
  _bind48();
  const toggle = document.getElementById("mineToggle");
  const box = document.getElementById("mineBox");
  if (toggle && box) {
    toggle.onclick = function (ev) {
      ev.preventDefault();
      window._mineOpen48 = box.style.display === "none";
      box.style.display = window._mineOpen48 ? "block" : "none";
    };
  }
  if (view.page !== "train") return;
  const t = db.trains.find(function (x) { return x.id === view.trainId; });
  const occ = document.getElementById("occupation");
  if (t && occ && !occ._occ48) {
    occ._occ48 = true;
    occ.addEventListener("change", function () {
      t.person = t.person || {};
      t.person.occupation = occ.value.trim();
      t.occupationCode = "";
      if (typeof saveQuiet === "function") saveQuiet();
      if (typeof audit === "function") audit(t, "edit", "occupation set to " + (occ.value.trim() || "—") + " by " + (typeof whoText === "function" ? whoText() : ""));
    });
  }
};

function stampV48(html) {
  return String(html || "").replace(/ENVSS Field v\d+/g, "ENVSS Field v48");
}
["dashHtml", "projectHtml", "eventHtml"].forEach(function (name) {
  if (typeof window[name] !== "function") return;
  const orig = window[name];
  window[name] = function () { return stampV48(orig()); };
});
if (typeof render === "function") render();

window.ENVSS_FIBRE = "42";

function applySrsCatalogs() {
  const pack = window.ENVSS_SRS_CATALOGS;
  if (!pack || !db || !db.catalogs) return;
  if (db.catalogs._srsVersion === pack.version) return;
  db.catalogs._srsVersion = pack.version;
  db.catalogs.srsOccupations = pack.occupations || [];
  db.catalogs.srsLocations = pack.locations || [];
  db.catalogs.segs = pack.segs || db.catalogs.segs || [];
  db.catalogs.hearingPpe = pack.hearingPpe || [];
  const incoming = pack.contaminants || [];
  if (incoming.length) {
    const byCode = {};
    (db.catalogs.contaminants || []).forEach(function (c) { byCode[c.code || c.id] = c; });
    incoming.forEach(function (c) {
      const prev = byCode[c.code] || {};
      byCode[c.code] = Object.assign({}, prev, c, { id: c.code });
    });
    db.catalogs.contaminants = Object.keys(byCode).map(function (k) { return byCode[k]; });
  }
  db.catalogs.occupations = (pack.occupations || []).map(function (o) { return o.name; });
}

function eventIsMines(ev) {
  if (!ev) return false;
  return ev.minesAct === true || ev.minesAct === "yes";
}

function occHits(q) {
  const list = (db.catalogs && db.catalogs.srsOccupations) || [];
  const s = String(q || "").trim().toLowerCase();
  if (!s) return list.slice(0, 12);
  return list.filter(function (o) {
    return String(o.code).indexOf(s) !== -1 ||
      (o.name || "").toLowerCase().indexOf(s) !== -1 ||
      (o.parentName || "").toLowerCase().indexOf(s) !== -1 ||
      (o.majorGroup || "").toLowerCase().indexOf(s) !== -1;
  }).slice(0, 12);
}
function locHits(q) {
  const list = (db.catalogs && db.catalogs.srsLocations) || [];
  const s = String(q || "").trim().toLowerCase();
  if (!s) return list.slice(0, 12);
  return list.filter(function (o) {
    return String(o.code).indexOf(s) !== -1 || (o.name || "").toLowerCase().indexOf(s) !== -1;
  }).slice(0, 12);
}
function findOcc(val) {
  const list = (db.catalogs && db.catalogs.srsOccupations) || [];
  const s = String(val || "").trim();
  const code = s.split("—")[0].trim();
  return list.find(function (o) { return o.code === code || o.name === s || (o.code + " — " + o.name) === s; });
}
function findLoc(val) {
  const list = (db.catalogs && db.catalogs.srsLocations) || [];
  const s = String(val || "").trim();
  const code = s.split("—")[0].trim();
  return list.find(function (o) { return o.code === code || o.name === s || (o.code + " — " + o.name) === s; });
}

function wireSrsCombo(inputId, hitsFn, onPick) {
  const input = document.getElementById(inputId);
  const box = document.getElementById("sug-" + inputId);
  if (!input || !box) return;
  const show = function () {
    const hits = hitsFn(input.value);
    box.innerHTML = hits.map(function (h) {
      const label = h.code + " — " + h.name;
      return "<div data-v=\"" + esc(label) + "\">" + esc(label) + "</div>";
    }).join("");
    box.classList.add("on");
    box.querySelectorAll("div").forEach(function (d) {
      d.onclick = function () {
        input.value = d.dataset.v;
        onPick(d.dataset.v);
        box.classList.remove("on");
      };
    });
  };
  input.addEventListener("input", show);
  input.addEventListener("focus", show);
  input.addEventListener("blur", function () { setTimeout(function () { box.classList.remove("on"); }, 180); });
}

if (typeof mineCodesHtml === "function") {
  mineCodesHtml = function (t) {
    if (typeof isBlank === "function" && isBlank(t)) return "";
    const ev = typeof eventById === "function" ? eventById(t.eventId) : null;
    const mines = eventIsMines(ev) || !!(t.mineCodesOn || t.seg || t.occupationCode || t.locationCode);
    if (!mines && ev && ev.minesAct === false) {
      return "<p class=\"help\">Not a Mines Act event — SRS codes hidden. Occupation name only.</p>";
    }
    const occ = findOcc(t.occupationCode || (t.person && t.person.occupation));
    const loc = findLoc(t.locationCode);
    const occLabel = occ ? (occ.code + " — " + occ.name) : (t.occupationCode || "");
    const locLabel = loc ? (loc.code + " — " + loc.name) : (t.locationCode || "");
    const parent = occ ? (occ.parentCode ? (occ.parentCode + " — " + occ.parentName) : "—") : "";
    const major = occ ? (occ.majorGroup || "—") : "";
    var html = "<label class=\"check-row\"><input type=\"checkbox\" id=\"mineOn\" " + (mines ? "checked" : "") + "> Mines Act / SRS fields</label>";
    html += "<p class=\"help\">Search occupation or location by code or description.</p>";
    html += "<div id=\"mineBox\" style=\"" + (mines ? "" : "display:none") + "\">";
    html += "<label>Occupation (SRS)</label><div class=\"combo\"><input id=\"occSearch\" value=\"" + esc(occLabel) + "\" placeholder=\"411000 or processing plant\"><div class=\"suggest\" id=\"sug-occSearch\"></div></div>";
    if (occ) html += "<p class=\"muted\">Parent: " + esc(parent) + "<br>Major group: " + esc(major) + "</p>";
    html += "<input type=\"hidden\" id=\"occCode\" value=\"" + esc(t.occupationCode || (occ && occ.code) || "") + "\">";
    html += "<label>Location (SRS)</label><div class=\"combo\"><input id=\"locSearch\" value=\"" + esc(locLabel) + "\" placeholder=\"413 or crushing\"><div class=\"suggest\" id=\"sug-locSearch\"></div></div>";
    html += "<input type=\"hidden\" id=\"locCode\" value=\"" + esc(t.locationCode || "") + "\">";
    html += "<label>SEG</label><div class=\"combo\"><input id=\"seg\" value=\"" + esc(t.seg || "") + "\" placeholder=\"Type or add SEG\"><div class=\"suggest\" id=\"sug-seg\"></div></div>";
    html += "<button type=\"button\" class=\"btn ghost\" id=\"btnAddSeg\">Add SEG</button>";
    html += "</div>";
    return html;
  };
}

const _newEventHtml42 = typeof newEventHtml === "function" ? newEventHtml : function () { return ""; };
newEventHtml = function () {
  var html = _newEventHtml42();
  const inject = "<label class=\"check-row\"><input type=\"checkbox\" id=\"nmines\"> This event falls under the Mines Act</label><p class=\"help\">Tick for WA mines SRS fields (occupation code, location code, SEG). Untick for non-mining jobs — occupation name only, no SRS codes.</p>";
  if (html.indexOf("id=\"nmines\"") !== -1) return html;
  if (html.indexOf("id=\"nmulti\"") !== -1) return html.replace("<label class=\"check-row\"><input type=\"checkbox\" id=\"nmulti\">", inject + "<label class=\"check-row\"><input type=\"checkbox\" id=\"nmulti\">");
  return html.replace("<div class=\"footer-actions\">", inject + "<div class=\"footer-actions\">");
};

const _createEvent42 = createEvent;
createEvent = function () {
  const mines = !!(document.getElementById("nmines") || {}).checked;
  _createEvent42();
  const ev = db.events[db.events.length - 1];
  if (ev) {
    ev.minesAct = mines;
    save();
  }
};

const _collectTrain42 = typeof collectTrain === "function" ? collectTrain : function () {};
collectTrain = function (t) {
  _collectTrain42(t);
  const minesOn = document.getElementById("mineOn");
  if (minesOn) t.mineCodesOn = !!minesOn.checked;
  const occIn = document.getElementById("occSearch");
  if (occIn) {
    const o = findOcc(occIn.value);
    if (o) {
      t.occupationCode = o.code;
      t.person = t.person || {};
      t.person.occupation = o.name;
      t.person.occupationCode = o.code;
    }
  }
  const locIn = document.getElementById("locSearch");
  if (locIn) {
    const l = findLoc(locIn.value);
    if (l) t.locationCode = l.code;
  }
  const seg = document.getElementById("seg");
  if (seg) t.seg = seg.value.trim();
};

const _bind42 = typeof bind === "function" ? bind : function () {};
bind = function () {
  applySrsCatalogs();
  _bind42();
  const t = db.trains.find(function (x) { return x.id === view.trainId; });
  if (view.page === "train" && t) {
    const mineOn = document.getElementById("mineOn");
    if (mineOn) mineOn.onchange = function () {
      collectTrain(t);
      t.mineCodesOn = mineOn.checked;
      save();
      render();
    };
    wireSrsCombo("occSearch", occHits, function (val) {
      const o = findOcc(val);
      if (!o) return;
      t.occupationCode = o.code;
      t.person = t.person || {};
      t.person.occupation = o.name;
      collectTrain(t);
      save();
      render();
    });
    wireSrsCombo("locSearch", locHits, function (val) {
      const l = findLoc(val);
      if (!l) return;
      t.locationCode = l.code;
      collectTrain(t);
      save();
      render();
    });
    const segs = ((db.catalogs && db.catalogs.segs) || []).map(function (s) { return s.id + (s.name ? " — " + s.name : ""); });
    if (typeof wireCombo === "function") {
      wireCombo("seg", segs, function (val) {
        t.seg = val.split("—")[0].trim();
        collectTrain(t);
      });
    }
    const addSeg = document.getElementById("btnAddSeg");
    if (addSeg) addSeg.onclick = function () {
      const val = (document.getElementById("seg") || {}).value || "";
      const id = val.split("—")[0].trim();
      if (!id) { alert("Type a SEG id first."); return; }
      db.catalogs.segs = db.catalogs.segs || [];
      if (!db.catalogs.segs.some(function (s) { return s.id === id; })) {
        db.catalogs.segs.push({ id: id, name: val.indexOf("—") !== -1 ? val.split("—").slice(1).join("—").trim() : id, active: "Y" });
      }
      t.seg = id;
      save();
      alert("SEG " + id + " saved on this device.");
    };
  }
};

applySrsCatalogs();
function stampV42(html) {
  return String(html || "").replace(/ENVSS Field v\d+/g, "ENVSS Field v42");
}
if (typeof dashHtml === "function") {
  dashHtml = (function (orig) {
    return function () { return stampV42(orig()); };
  })(dashHtml);
}
if (typeof projectHtml === "function") {
  projectHtml = (function (orig) {
    return function () { return stampV42(orig()); };
  })(projectHtml);
}
if (typeof eventHtml === "function") {
  eventHtml = (function (orig) {
    return function () { return stampV42(orig()); };
  })(eventHtml);
}
if (typeof render === "function") render();

window.ENVSS_FIBRE = "43";

function applySrsCatalogs() {
  const pack = window.ENVSS_SRS_CATALOGS;
  if (!pack || !db || !db.catalogs) return;
  db.catalogs._srsVersion = pack.version;
  db.catalogs.srsOccupations = pack.occupations || [];
  db.catalogs.srsLocations = pack.locations || [];
  db.catalogs.segs = pack.segs || db.catalogs.segs || [];
  db.catalogs.hearingPpe = pack.hearingPpe || [];
  if ((pack.pumps || []).length) {
    const have = {};
    (db.catalogs.pumps || []).forEach(function (p) { if (p && p.serial) have[String(p.serial)] = p; });
    (pack.pumps || []).forEach(function (p) { have[String(p.serial)] = Object.assign({}, have[String(p.serial)] || {}, p); });
    db.catalogs.pumps = Object.keys(have).map(function (k) { return have[k]; });
  }
  if ((pack.heads || []).length) db.catalogs.heads = pack.heads;
  if ((pack.dosimeters || []).length) {
    db.catalogs.dosimeters = pack.dosimeters;
  }
  const incoming = pack.contaminants || [];
  if (incoming.length) {
    const byCode = {};
    (db.catalogs.contaminants || []).forEach(function (c) { byCode[c.code || c.id] = c; });
    incoming.forEach(function (c) {
      byCode[c.code] = Object.assign({}, byCode[c.code] || {}, c, { id: c.code });
    });
    db.catalogs.contaminants = Object.keys(byCode).map(function (k) { return byCode[k]; });
  }
  db.catalogs.occupations = (pack.occupations || []).map(function (o) { return o.name; });
}

function eventIsMines(ev) {
  return !!(ev && (ev.minesAct === true || ev.minesAct === "yes"));
}

function occHits(q) {
  const list = (db.catalogs && db.catalogs.srsOccupations) || [];
  const s = String(q || "").trim().toLowerCase();
  if (!s) return list.slice(0, 12);
  return list.filter(function (o) {
    return String(o.code).toLowerCase().indexOf(s) !== -1 ||
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
    return String(o.code).toLowerCase().indexOf(s) !== -1 || (o.name || "").toLowerCase().indexOf(s) !== -1;
  }).slice(0, 12);
}
function findOcc(val) {
  const list = (db.catalogs && db.catalogs.srsOccupations) || [];
  const s = String(val || "").trim();
  const code = s.split("—")[0].split("-")[0].trim();
  return list.find(function (o) {
    return o.code === code || o.name === s || (o.code + " — " + o.name) === s;
  });
}
function findLoc(val) {
  const list = (db.catalogs && db.catalogs.srsLocations) || [];
  const s = String(val || "").trim();
  const code = s.split("—")[0].trim();
  return list.find(function (o) {
    return o.code === code || o.name === s || (o.code + " — " + o.name) === s;
  });
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
      d.onmousedown = function (ev) {
        ev.preventDefault();
        input.value = d.getAttribute("data-v");
        onPick(input.value);
        box.classList.remove("on");
      };
    });
  };
  input.addEventListener("input", show);
  input.addEventListener("focus", show);
  input.addEventListener("blur", function () { setTimeout(function () { box.classList.remove("on"); }, 220); });
}

if (typeof wireCombo === "function" && !window._wireComboCore43) {
  window._wireComboCore43 = wireCombo;
  wireCombo = function (inputId, items, onPick) {
    const input = document.getElementById(inputId);
    const box = document.getElementById("sug-" + inputId);
    if (!input || !box) return;
    const show = function () {
      const q = input.value.toLowerCase();
      const hits = (items || []).filter(function (x) { return String(x).toLowerCase().indexOf(q) !== -1; }).slice(0, 12);
      box.innerHTML = hits.map(function (h) {
        return "<div data-v=\"" + esc(h) + "\">" + esc(h) + "</div>";
      }).join("");
      box.classList.add("on");
      box.querySelectorAll("div").forEach(function (d) {
        d.onmousedown = function (ev) {
          ev.preventDefault();
          input.value = d.getAttribute("data-v");
          if (typeof onPick === "function") onPick(input.value);
          box.classList.remove("on");
        };
      });
    };
    input.addEventListener("input", show);
    input.addEventListener("focus", show);
    input.addEventListener("blur", function () { setTimeout(function () { box.classList.remove("on"); }, 220); });
  };
}

mineCodesHtml = function (t) {
  if (typeof isBlank === "function" && isBlank(t)) return "";
  const ev = typeof eventById === "function" ? eventById(t.eventId) : null;
  const mines = eventIsMines(ev) || t.mineCodesOn === true;
  const occ = findOcc(t.occupationCode || (t.person && t.person.occupation));
  const loc = findLoc(t.locationCode);
  const occLabel = occ ? (occ.code + " — " + occ.name) : (t.occupationCode || "");
  const locLabel = loc ? (loc.code + " — " + loc.name) : (t.locationCode || "");
  const parent = occ && occ.parentCode ? (occ.parentCode + " — " + occ.parentName) : "—";
  const major = occ ? (occ.majorGroup || "—") : "—";
  var html = "<label class=\"check-row\"><input type=\"checkbox\" id=\"mineOn\" " + (mines ? "checked" : "") + "> Mines Act / SRS fields</label>";
  html += "<p class=\"help\">Search occupation or location by code or description. Tick if this sample is reportable under the Mines Act.</p>";
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

const _newEventHtml43 = typeof newEventHtml === "function" ? newEventHtml : function () { return ""; };
newEventHtml = function () {
  var html = _newEventHtml43();
  html = html.replace(/<label class="check-row"><input type="checkbox" id="nmulti">[\s\S]*?<\/p>/, "");
  html = html.replace(/<label class="check-row"><input type="checkbox" id="nmulti">[^<]*<\/label>/, "");
  if (html.indexOf("id=\"nmines\"") === -1) {
    const inject = "<label class=\"check-row\"><input type=\"checkbox\" id=\"nmines\"> This event falls under the Mines Act</label><p class=\"help\">Tick for WA mines SRS fields on each sample (occupation code, location code, SEG). Untick for non-mining — occupation name only. Multi-day sampling is always allowed.</p>";
    html = html.replace("<div class=\"footer-actions\">", inject + "<div class=\"footer-actions\">");
  }
  return html;
};

const _createEvent43 = createEvent;
createEvent = function () {
  const mines = !!(document.getElementById("nmines") || {}).checked;
  _createEvent43();
  const ev = db.events[db.events.length - 1];
  if (ev) {
    ev.minesAct = mines;
    ev.multiDay = true;
    ev.updatedAt = new Date().toISOString();
    save();
  }
};

startGaps = function (t) {
  const miss = [];
  if (typeof isFibreTrain === "function" && isFibreTrain(t)) {
    if (!(t.cowlNo || t.mediaId)) miss.push("Cowl number");
    if (typeof isBlank === "function" && isBlank(t)) return miss;
    if (!t.pumpSerial) miss.push("Pump serial");
    if (!t.startFlow) miss.push("Start flow");
    if (!t.location) miss.push("Location");
    return miss;
  }
  if (typeof isBlank === "function" && isBlank(t)) return miss;
  if (typeof isNoise === "function" && isNoise(t)) {
    if (!t.dosimeterSerial) miss.push("Dosimeter serial");
    if (typeof isStatic === "function" && isStatic(t)) {
      if (!t.location) miss.push("Location");
    } else {
      if (!(t.person && t.person.first)) miss.push("First name");
      if (!(t.person && t.person.last)) miss.push("Last name");
    }
    return miss;
  }
  if (!t.contaminantId) miss.push("Contaminant");
  if (!t.pumpSerial) miss.push("Pump serial");
  if (!t.headId) miss.push("Sample head");
  if (!t.mediaId) miss.push("Cassette / filter / tube");
  if (!t.startFlow) miss.push("Start flow");
  if (typeof isStatic === "function" && isStatic(t)) {
    if (!t.location) miss.push("Location");
  } else {
    if (!(t.person && t.person.first)) miss.push("First name");
    if (!(t.person && t.person.last)) miss.push("Last name");
  }
  return miss;
};

const _collectTrain43 = collectTrain;
collectTrain = function (t) {
  _collectTrain43(t);
  const contamEl = document.getElementById("contam");
  if (contamEl && contamEl.value && typeof contam === "function") {
    const raw = contamEl.value;
    const code = raw.split("—")[0].trim();
    const c = (db.catalogs.contaminants || []).find(function (x) {
      return x.code === code || (x.code + " — " + x.name) === raw;
    });
    if (c) t.contaminantId = c.id || c.code;
  }
  const minesOn = document.getElementById("mineOn");
  if (minesOn) t.mineCodesOn = !!minesOn.checked;
  const occIn = document.getElementById("occSearch");
  if (occIn && occIn.value) {
    const o = findOcc(occIn.value);
    if (o) {
      t.occupationCode = o.code;
      t.person = t.person || {};
      t.person.occupation = o.name;
      t.person.occupationCode = o.code;
    }
  }
  const locIn = document.getElementById("locSearch");
  if (locIn && locIn.value) {
    const l = findLoc(locIn.value);
    if (l) t.locationCode = l.code;
  }
  const seg = document.getElementById("seg");
  if (seg) t.seg = seg.value.trim();
};

const _deleteEvent43 = typeof deleteEvent === "function" ? deleteEvent : null;
deleteEvent = function (id) {
  if (typeof canDeleteEvent === "function" && !canDeleteEvent()) {
    alert("Only an admin can delete an event.");
    return;
  }
  const ev = eventById(id);
  if (!ev) return;
  if (!confirm("Delete event " + ev.code + " and all of its samples?")) return;
  const trains = trainsOf(id).slice();
  db.deletions = db.deletions || [];
  trains.forEach(function (t) {
    db.deletions.push({ id: t.id, trainId: t.id, eventId: id, at: nowIso(), who: whoText(), reason: "event deleted" });
    if (typeof sbDelete === "function") sbDelete("envss_trains", t.id);
  });
  db.deletions.push({ id: ev.id, eventId: id, deletedEventId: ev.id, at: nowIso(), who: whoText(), reason: "event deleted" });
  db.trains = db.trains.filter(function (t) { return t.eventId !== id; });
  db.events = db.events.filter(function (e) { return e.id !== id; });
  if (typeof sbDelete === "function") sbDelete("envss_events", ev.id);
  save();
  openProject(ev.projectId);
};

const _pullRemote43 = pullRemote;
pullRemote = async function () {
  await _pullRemote43();
  const goneEvent = {};
  const goneTrain = {};
  (db.deletions || []).forEach(function (d) {
    if (!d) return;
    if (d.trainId) goneTrain[d.trainId] = 1;
    if (d.deletedEventId) goneEvent[d.deletedEventId] = 1;
    if (d.reason === "event deleted" && d.eventId) goneEvent[d.eventId] = 1;
    if (d.reason === "project deleted" && d.id) goneEvent[d.id] = 1;
  });
  db.events = (db.events || []).filter(function (e) { return !goneEvent[e.id]; });
  db.trains = (db.trains || []).filter(function (t) { return !goneTrain[t.id] && !goneEvent[t.eventId]; });
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
};

const _bind43 = bind;
bind = function () {
  applySrsCatalogs();
  _bind43();
  const t = db.trains.find(function (x) { return x.id === view.trainId; });
  if (view.page === "train" && t) {
    const mineOn = document.getElementById("mineOn");
    if (mineOn) mineOn.onchange = function () {
      t.mineCodesOn = mineOn.checked;
      const box = document.getElementById("mineBox");
      if (box) box.style.display = mineOn.checked ? "" : "none";
      const ev = eventById(t.eventId);
      if (ev && mineOn.checked) ev.minesAct = true;
      saveQuiet();
    };
    wireSrsCombo("occSearch", occHits, function (val) {
      const o = findOcc(val);
      if (!o) return;
      t.occupationCode = o.code;
      t.person = t.person || {};
      t.person.occupation = o.name;
      const hidden = document.getElementById("occCode");
      if (hidden) hidden.value = o.code;
      saveQuiet();
    });
    wireSrsCombo("locSearch", locHits, function (val) {
      const l = findLoc(val);
      if (!l) return;
      t.locationCode = l.code;
      const hidden = document.getElementById("locCode");
      if (hidden) hidden.value = l.code;
      saveQuiet();
    });
    const segs = ((db.catalogs && db.catalogs.segs) || []).map(function (s) {
      return s.id + (s.name ? " — " + s.name : "");
    });
    wireCombo("seg", segs, function (val) {
      t.seg = String(val).split("—")[0].trim();
    });
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
      saveQuiet();
      alert("SEG " + id + " saved on this device.");
    };
  }
};

function stampV43(html) {
  return String(html || "").replace(/ENVSS Field v\d+/g, "ENVSS Field v43");
}
["dashHtml", "projectHtml", "eventHtml"].forEach(function (name) {
  if (typeof window[name] === "function") {
    window[name] = (function (orig) {
      return function () { return stampV43(orig()); };
    })(window[name]);
  }
});

applySrsCatalogs();
if (typeof render === "function") render();

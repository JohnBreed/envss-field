window.ENVSS_FIBRE = "45";

function tombstoneProject(id) {
  const p = typeof project === "function" ? project(id) : null;
  if (!p) return;
  const evs = (db.events || []).filter(function (e) { return e.projectId === id; });
  db.deletions = db.deletions || [];
  evs.forEach(function (ev) {
    (typeof trainsOf === "function" ? trainsOf(ev.id) : []).forEach(function (t) {
      db.deletions.push({ id: "del-" + t.id, trainId: t.id, eventId: ev.id, projectId: id, at: nowIso(), who: whoText(), reason: "project deleted" });
      if (typeof sbDelete === "function") sbDelete("envss_trains", t.id);
    });
    db.deletions.push({ id: "del-ev-" + ev.id, eventId: ev.id, deletedEventId: ev.id, projectId: id, at: nowIso(), who: whoText(), reason: "project deleted" });
    if (typeof sbDelete === "function") sbDelete("envss_events", ev.id);
  });
  db.trains = (db.trains || []).filter(function (t) {
    return evs.every(function (ev) { return ev.id !== t.eventId; });
  });
  db.events = (db.events || []).filter(function (e) { return e.projectId !== id; });
  db.projects = (db.projects || []).filter(function (x) { return x.id !== id; });
  db.deletions.push({ id: "del-pr-" + p.id, projectId: p.id, deletedProjectId: p.id, at: nowIso(), who: whoText(), reason: "project deleted" });
  if (typeof sbDelete === "function") sbDelete("envss_projects", p.id);
}

deleteProject = function (id) {
  if (typeof canDeleteEvent === "function" && !canDeleteEvent()) {
    alert("Only an admin can delete a project.");
    return;
  }
  const p = project(id);
  if (!p) return;
  if (!confirm("Delete project " + p.number + " and all of its events and samples?")) return;
  tombstoneProject(id);
  save();
  if (typeof goDash === "function") goDash();
};

function applyProjectTombstones() {
  const goneProject = {};
  const goneEvent = {};
  const goneTrain = {};
  (db.deletions || []).forEach(function (d) {
    if (!d) return;
    if (d.deletedProjectId) goneProject[d.deletedProjectId] = 1;
    if (d.reason === "project deleted" && d.projectId) goneProject[d.projectId] = 1;
    if (d.trainId) goneTrain[d.trainId] = 1;
    if (d.deletedEventId) goneEvent[d.deletedEventId] = 1;
    if (d.reason === "event deleted" && d.eventId) goneEvent[d.eventId] = 1;
  });
  db.projects = (db.projects || []).filter(function (p) { return !goneProject[p.id]; });
  db.events = (db.events || []).filter(function (e) { return !goneEvent[e.id] && !goneProject[e.projectId]; });
  db.trains = (db.trains || []).filter(function (t) { return !goneTrain[t.id] && !goneEvent[t.eventId]; });
  const liveEvents = {};
  db.events.forEach(function (e) { liveEvents[e.id] = 1; });
  db.trains = db.trains.filter(function (t) { return liveEvents[t.eventId] || !goneProject[t.projectId]; });
}

const _pullRemote45 = pullRemote;
pullRemote = async function () {
  await _pullRemote45();
  applyProjectTombstones();
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
  if (typeof render === "function" && view && view.page === "dash") render();
};

function stampV45(html) {
  return String(html || "").replace(/ENVSS Field v\d+/g, "ENVSS Field v45");
}
["dashHtml", "projectHtml", "eventHtml"].forEach(function (name) {
  if (typeof window[name] === "function") {
    window[name] = (function (orig) {
      return function () { return stampV45(orig()); };
    })(window[name]);
  }
});
applyProjectTombstones();
if (typeof render === "function") render();

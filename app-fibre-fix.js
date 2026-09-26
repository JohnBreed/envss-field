/* v34 form fixes */
window.ENVSS_FIBRE = "34";

const FORM_PAGES = { newProject: 1, newEvent: 1 };
function formTyping() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = (el.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}
if (!window._envssPullWrapped) {
  window._envssPullWrapped = true;
  const _pullRemote = pullRemote;
  pullRemote = async function () {
    const page = view && view.page;
    if (FORM_PAGES[page] || formTyping()) {
      try {
        if (typeof sbCfg === "function" && !sbCfg()) { window._envssSync = "off"; return; }
        const [projects, events, trains, deletions] = await Promise.all([
          sbGet("envss_projects"), sbGet("envss_events"), sbGet("envss_trains"), sbGet("envss_deletions")
        ]);
        window._envssSync = "ok";
        const gone = new Set((deletions || []).map(r => r.payload && r.payload.trainId).filter(Boolean));
        db.projects = mergeById(db.projects, projects);
        db.events = mergeById(db.events, events);
        db.trains = mergeById(db.trains, trains).filter(t => !gone.has(t.id));
        db.deletions = mergeById(db.deletions, deletions);
        db.syncedAt = new Date().toISOString();
        localStorage.setItem(KEY, JSON.stringify(db));
      } catch (e) {
        window._envssSync = "err";
      }
      return;
    }
    return _pullRemote();
  };
}

function toggleFibreEventFields() {
  const type = (document.getElementById("ntype") || {}).value;
  const fibre = type === "fibre";
  const box = document.getElementById("fibreEventFields");
  const multi = document.getElementById("hygieneMultiWrap");
  if (box) box.style.display = fibre ? "" : "none";
  if (multi) multi.style.display = fibre ? "none" : "";
}

newEventHtml = function () {
  const p = project(view.projectId);
  return `<div class="wrap">
    <button class="btn ghost" onclick="openProject('${view.projectId || ""}')">← Project events</button>
    <h2 class="brand-type" style="color:var(--navy)">New event</h2>
    <p class="muted">${p ? p.number + " · " + (p.name || "") : ""}</p>
    <label>Event type</label>
    <select id="ntype" onchange="toggleFibreEventFields()">
      <option value="hygiene">Hygiene event</option>
      <option value="fibre">Airborne fibre monitoring</option>
    </select>
    <label>Event date</label>
    <input id="ndate" type="date" value="${new Date().toISOString().slice(0, 10)}">
    <div id="fibreEventFields" style="display:none">
      <label>Monitoring type</label>
      <select id="nprotocol">
        <option value="background">Background</option>
        <option value="control">Control</option>
        <option value="clearance">Clearance</option>
      </select>
      <label>Task being monitored</label>
      <input id="ntask" placeholder="Earthworks — not the monitoring type">
      <label>Lab turnaround</label>
      <select id="ntat">
        <option value="next_0700">Next day 07:00</option>
        <option value="same_day">Same day</option>
        <option value="emergency">Emergency</option>
      </select>
    </div>
    <div id="hygieneMultiWrap">
      <label class="check-row"><input type="checkbox" id="nmulti"> Multiple days / shifts (mine trip)</label>
      <p class="help">Hygiene only. One event, one COC at the end.</p>
    </div>
    <div class="footer-actions"><button class="btn orange" id="btnCreateEv">Create event</button></div>
  </div>`;
};

const _createEventFix = createEvent;
createEvent = function () {
  const typeEl = document.getElementById("ntype");
  const type = (typeEl && typeEl.value) || "hygiene";
  if (type !== "fibre") return _createEventFix();
  const projectId = view.projectId;
  const p = project(projectId);
  if (!p) { alert("Open a project first."); return; }
  const date = document.getElementById("ndate").value;
  const siblings = db.events.filter(e => e.projectId === projectId && e.type === "fibre");
  const n = String(siblings.length + 1).padStart(3, "0");
  const ev = {
    id: uid("e"), projectId, type, stage: "planned", date,
    code: fibreEventCode(p, date, n),
    multiDay: false,
    notes: "", uploadReady: false, operators: [],
    protocol: (document.getElementById("nprotocol") && document.getElementById("nprotocol").value) || "background",
    taskDesc: (document.getElementById("ntask") && document.getElementById("ntask").value) || "",
    rotameter: "",
    tat: (document.getElementById("ntat") && document.getElementById("ntat").value) || "next_0700"
  };
  db.events.push(ev);
  save();
  openEvent(ev.id);
};

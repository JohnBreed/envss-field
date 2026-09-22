function bind() {
  document.querySelectorAll("[data-filter]").forEach(b => b.onclick = () => { view.filter = b.dataset.filter; render(); });
  const t = db.trains.find(x => x.id === view.trainId);
  if (view.page === "train" && t) {
    const names = db.catalogs.contaminants.map(c => c.code + " — " + c.name);
    wireCombo("contam", names, (val) => {
      const code = val.split("—")[0].trim().toUpperCase();
      let c = db.catalogs.contaminants.find(x => x.code === code || x.name.toLowerCase() === val.toLowerCase());
      if (!c) {
        c = { id: code || uid("c"), name: val, code: code || val.slice(0,3).toUpperCase(), headHint: "", flowTolPct: 5, defaultFlow: "2.0" };
        db.catalogs.contaminants.push(c);
      }
      t.contaminantId = c.id;
    });
    wireCombo("pump", db.catalogs.pumps.map(p => p.serial), (val) => { t.pumpSerial = val.trim(); });
    wireCombo("head", db.catalogs.heads.map(h => h.id), (val) => { t.headId = val.trim().toUpperCase(); });
    document.getElementById("mode").onchange = () => { collectTrain(t); t.mode = document.getElementById("mode").value; save(); };
    document.getElementById("btnStart").onclick = () => {
      collectTrain(t);
      const prev = t.startAt;
      t.startAt = nowIso();
      t.status = "running";
      audit(t, "START pressed", prev ? `previous start ${fmtTime(prev)}` : "");
      save();
    };
    document.getElementById("btnStop").onclick = () => {
      collectTrain(t);
      const prev = t.endAt;
      t.endAt = nowIso();
      t.status = "ended";
      audit(t, "STOP pressed", prev ? `previous stop ${fmtTime(prev)}` : "");
      const chk = flowCheck(t);
      if (!chk.ok) audit(t, "Flow outside tolerance", `${chk.pct.toFixed(1)}% vs ±${chk.tol}%`);
      save();
    };
    document.getElementById("btnSave").onclick = () => {
      const beforeStart = t.startAt, beforeEnd = t.endAt;
      collectTrain(t);
      if (t.startAt !== beforeStart) audit(t, "Start time edited", `${fmtTime(beforeStart)} → ${fmtTime(t.startAt)}`);
      if (t.endAt !== beforeEnd) audit(t, "Stop time edited", `${fmtTime(beforeEnd)} → ${fmtTime(t.endAt)}`);
      audit(t, "Saved");
      save();
      alert("Saved on this device.");
    };
    document.getElementById("btnReject").onclick = () => {
      collectTrain(t);
      if (!t.rejectReason.trim()) {
        alert("Enter a reject reason first.");
        return;
      }
      t.status = "rejected";
      audit(t, "Rejected", t.rejectReason);
      save();
    };
    const ur = document.getElementById("btnUnreject");
    if (ur) ur.onclick = () => { collectTrain(t); t.status = t.endAt ? "ended" : (t.startAt ? "running" : "prepped"); audit(t, "Reject cleared"); save(); };
    const up = document.getElementById("btnUploaded");
    if (up) up.onclick = () => { collectTrain(t); t.status = "uploaded"; audit(t, "Marked uploaded"); save(); };
    document.getElementById("btnAddPump").onclick = () => {
      collectTrain(t);
      if (t.pumpSerial && !db.catalogs.pumps.some(p => p.serial === t.pumpSerial)) {
        db.catalogs.pumps.push({ serial: t.pumpSerial }); audit(t, "Pump added to fleet", t.pumpSerial); save();
        alert("Pump " + t.pumpSerial + " added to fleet list.");
      }
    };
    document.getElementById("btnAddHead").onclick = () => {
      collectTrain(t);
      const id = (t.headId || "").toUpperCase();
      if (id && !db.catalogs.heads.some(h => h.id === id)) {
        const kind = id.startsWith("RESS") ? "respirable" : id.startsWith("IESS") ? "inhalable" : id.startsWith("DP") ? "diesel" : "other";
        db.catalogs.heads.push({ id, kind }); audit(t, "Cassette added", id); save();
        alert("Cassette " + id + " added.");
      }
    };
    ["startFlow","endFlow","startAt","endAt"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", () => { collectTrain(t); render(); });
    });
  }
  const ce = document.getElementById("btnCreateEv");
  if (ce) ce.onclick = createEvent;
}

function collectTrain(t) {
  const g = id => document.getElementById(id);
  t.pouch = g("pouch")?.value || t.pouch;
  t.pumpSerial = g("pump")?.value.trim() || "";
  t.headId = (g("head")?.value || "").trim().toUpperCase();
  t.mediaId = g("media")?.value.trim() || "";
  t.startFlow = g("startFlow")?.value || "";
  t.endFlow = g("endFlow")?.value || "";
  t.mode = g("mode")?.value || t.mode;
  t.comments = g("comments")?.value || "";
  t.rejectReason = g("rejectReason")?.value || "";
  if (g("startAt")) t.startAt = fromLocalInput(g("startAt").value) || t.startAt;
  if (g("endAt")) {
    const v = fromLocalInput(g("endAt").value);
    t.endAt = g("endAt").value ? v : t.endAt;
  }
  if (t.mode === "static") t.location = g("location")?.value || "";
  else {
    t.person = {
      first: g("first")?.value || "", last: g("last")?.value || "", dob: g("dob")?.value || "",
      occupation: g("occupation")?.value || "", company: g("company")?.value || "",
      hours: g("hours")?.value || "", daysOn: g("daysOn")?.value || "", daysOff: g("daysOff")?.value || ""
    };
  }
}

function wireCombo(inputId, items, onPick) {
  const input = document.getElementById(inputId);
  const box = document.getElementById("sug-" + inputId);
  if (!input || !box) return;
  const show = () => {
    const q = input.value.toLowerCase();
    const hits = items.filter(x => x.toLowerCase().includes(q)).slice(0, 8);
    box.innerHTML = hits.map(h => `<div data-v="${esc(h)}">${esc(h)}</div>`).join("") +
      (q && !items.some(x => x.toLowerCase() === q) ? `<div data-v="${esc(input.value)}"><em>Add “${esc(input.value)}”</em></div>` : "");
    box.classList.add("on");
    box.querySelectorAll("div").forEach(d => d.onclick = () => { input.value = d.dataset.v; onPick(d.dataset.v); box.classList.remove("on"); });
  };
  input.addEventListener("input", show);
  input.addEventListener("focus", show);
  input.addEventListener("blur", () => setTimeout(() => box.classList.remove("on"), 180));
}

function openEvent(id) { view.page = "event"; view.eventId = id; render(); }
function openTrain(id) { view.page = "train"; view.trainId = id; render(); }
function goDash() { view.page = "dash"; render(); }
function openNewEvent() { view.page = "newEvent"; render(); }

function addTrain(eventId) {
  const existing = trainsOf(eventId);
  const next = String((existing.map(t => Number(t.pouch) || 0).sort((a,b)=>b-a)[0] || 0) + 1);
  db.trains.push({
    id: uid("t"), eventId, pouch: next, contaminantId: "INH", pumpSerial: "", headId: "",
    mediaId: "", startFlow: "2.0", endFlow: "", mode: "personal",
    person: { first: "", last: "", dob: "", occupation: "", company: "", hours: "", daysOn: "", daysOff: "" },
    location: "", startAt: "", endAt: "", status: "prepped", comments: "", rejectReason: "", audit: [{ at: nowIso(), action: "Created", detail: "" }]
  });
  save();
}

function createEvent() {
  let projectId = document.getElementById("np").value;
  const num = document.getElementById("nnum").value.trim();
  const name = document.getElementById("nname").value.trim();
  if (num) {
    let p = db.projects.find(x => x.number === num);
    if (!p) { p = { id: uid("p"), number: num, name: name || num, site: name }; db.projects.push(p); }
    projectId = p.id;
  }
  const p = project(projectId);
  const siblings = db.events.filter(e => e.eventId === projectId || e.projectId === projectId);
  const n = String(siblings.length + 1).padStart(3, "0");
  const ev = { id: uid("e"), projectId, code: `${p.number}-${n}`, stage: "planned", date: document.getElementById("ndate").value, notes: "" };
  db.events.push(ev);
  save();
  openEvent(ev.id);
}

function exportEvent(eventId) {
  const ev = eventById(eventId);
  const trains = trainsOf(eventId).map(t => ({
    ...t,
    avgFlow: avgFlow(t),
    runtimeMinutes: runtimeMinutes(t),
    volumeLitres: volumeLitres(t),
    flowCheck: flowCheck(t)
  }));
  const blob = new Blob([JSON.stringify({ event: ev, project: project(ev.projectId), trains }, null, 2)], { type: "application/json" });
  download(blob, ev.code + "-ENVSS-Field.json");
}
function exportCsv(eventId) {
  const ev = eventById(eventId);
  const rows = [["event","pouch","status","code","contaminant","pump","cassette","media","mode","who_or_where","start","stop","minutes","startFlow","endFlow","avgFlow","volume_L","rejectReason","comments"]];
  trainsOf(eventId).forEach(t => {
    const who = t.mode === "static" ? t.location : [t.person.first, t.person.last].filter(Boolean).join(" ");
    const c = contam(t.contaminantId);
    rows.push([ev.code, t.pouch, t.status, c?.code || "", c?.name || "", t.pumpSerial, t.headId, t.mediaId, t.mode, who, t.startAt, t.endAt, runtimeMinutes(t) ?? "", t.startFlow, t.endFlow, avgFlow(t) ?? "", volumeLitres(t) ?? "", t.rejectReason, t.comments]);
  });
  const csv = rows.map(r => r.map(x => `"${String(x??"").replace(/"/g,'""')}"`).join(",")).join("\n");
  download(new Blob([csv], { type: "text/csv" }), ev.code + "-ENVSS-Field.csv");
}
function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

window.openEvent = openEvent;
window.openTrain = openTrain;
window.goDash = goDash;
window.openNewEvent = openNewEvent;
window.addTrain = addTrain;
window.exportEvent = exportEvent;
window.exportCsv = exportCsv;
window.changeOperator = changeOperator;

function changeOperator() {
  signOut();
}
function ensureOperator() {
  paintLogin();
}
function signOut() {
  localStorage.removeItem(WHO_KEY);
  paintLogin();
  render();
}
function hasGoogle() {
  return !!(window.ENVSS_CONFIG && window.ENVSS_CONFIG.googleClientId);
}
function paintLogin() {
  const gate = document.getElementById("loginGate");
  if (!gate) return;
  if (getOperator()) {
    gate.classList.add("hidden");
    return;
  }
  gate.classList.remove("hidden");
  const slot = document.getElementById("googleBtn");
  if (hasGoogle() && window.google && window.google.accounts && slot && !slot.dataset.ready) {
    slot.dataset.ready = "1";
    window.google.accounts.id.initialize({
      client_id: window.ENVSS_CONFIG.googleClientId,
      callback: onGoogleCredential,
      hd: window.ENVSS_CONFIG.allowedDomain,
      auto_select: true
    });
    window.google.accounts.id.renderButton(slot, { theme: "outline", size: "large", width: 280, text: "signin_with" });
  }
}
function onGoogleCredential(resp) {
  try {
    const payload = JSON.parse(atob(resp.credential.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (!allowedEmail(payload.email)) {
      alert("Use your @" + window.ENVSS_CONFIG.allowedDomain + " Google account.");
      return;
    }
    setOperator(payload.name || payload.email, { email: payload.email, source: "google" });
    paintLogin();
    render();
  } catch (e) {
    alert("Sign-in failed. Try again.");
  }
}
function manualLogin() {
  const name = document.getElementById("manualName")?.value.trim();
  const email = document.getElementById("manualEmail")?.value.trim();
  if (!name) { alert("Enter your name."); return; }
  if (hasGoogle() && email && !allowedEmail(email)) {
    alert("Use an @" + window.ENVSS_CONFIG.allowedDomain + " address.");
    return;
  }
  setOperator(name, { email, source: "manual" });
  paintLogin();
  render();
}
window.onGoogleCredential = onGoogleCredential;
window.manualLogin = manualLogin;
window.signOut = signOut;
window.changeOperator = changeOperator;

window.addEventListener("online", setOnline);
window.addEventListener("offline", setOnline);
ensureOperator();
render();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

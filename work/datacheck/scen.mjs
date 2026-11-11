/* Upgrade scenarios 2-4 (see README). Mock Supabase seeded with a COPY of the live rows; never the live DB.
   usage: node scen.mjs s2|s3|s4 [chromebook|pixel7] [fromVersion=v45c] */
import * as L from "./uplib.mjs"; import fs from "fs";
const SC = process.argv[2], KIND = process.argv[3] || "chromebook", FROM = process.argv[4] || "v45c";
const out = []; const log = (...a) => { const s = a.join(" "); console.log(s); out.push(s); };
let fails = 0; const check = (name, cond, extra) => { log((cond ? "PASS " : "FAIL ") + name + (extra ? " — " + extra : "")); if (!cond) fails++; };
const CORE = /^envss_(projects|events|trains|deletions|hires)$/;
const SKIP = { updatedAt: 1 };
const { server, base } = await L.serve();
const st = L.seedStore();
L.setVersion(FROM);
/* ---- in-page edit helpers (work on v45c, v46, v47) ---- */
const pick = dev => dev.ev(() => {
  const live = db.trains.filter(t => !String(t.id).startsWith("upg"));
  const ev = db.events.find(e => live.filter(t => t.eventId === e.id).length >= 4) || db.events[0];
  const inEv = live.filter(t => t.eventId === ev.id);
  const prepped = live.filter(t => !t.startAt && !t.endAt && t.status === "prepped" && t.trainKind !== "blank");
  const ended = live.filter(t => t.endAt && t.status === "ended");
  return { ev: ev.id, ev2: (db.events.find(e => e.id !== ev.id) || ev).id, prepped: prepped.map(t => t.id), ended: ended.map(t => t.id), any: inEv.map(t => t.id) };
});
const E = {
  start: (dev, id) => dev.ev(id => { const t = db.trains.find(x => x.id === id); t.startAt = nowIso(); t.status = "running"; (t.audit = t.audit || []).push({ at: nowIso(), who: whoText(), action: "START pressed (upgrade test)" }); save(); }, id),
  stop: (dev, id) => dev.ev(id => { const t = db.trains.find(x => x.id === id); t.endAt = nowIso(); t.status = "ended"; t.endFlow = "2.0"; (t.audit = t.audit || []).push({ at: nowIso(), who: whoText(), action: "STOP pressed (upgrade test)" }); save(); }, id),
  comment: (dev, id, txt) => dev.ev((id, txt) => { const t = db.trains.find(x => x.id === id); t.comments = txt; t.commentAsked = "yes"; (t.audit = t.audit || []).push({ at: nowIso(), who: whoText(), action: "edit", field: "comments", to: txt }); save(); }, id, txt),
  field: (dev, id, k, v) => dev.ev((id, k, v) => { const t = db.trains.find(x => x.id === id); t[k] = v; (t.audit = t.audit || []).push({ at: nowIso(), who: whoText(), action: "edit", field: k, to: v }); save(); }, id, k, v),
  add: (dev, evId, kind) => dev.ev((evId, kind) => { addTrain(evId, kind); const t = db.trains.find(x => x.id === view.trainId); t.location = "UPGRADE TEST " + kind; save(); return t.id; }, evId, kind),
  del: (dev, id) => dev.ev(id => { deleteSample(id); return !db.trains.some(t => t.id === id); }, id),
  evnote: (dev, id, txt) => dev.ev((id, txt) => { const e = db.events.find(x => x.id === id); e.notes = (e.notes || "") + txt; save(); }, id, txt)
};
const localRec = (dump, coll, id) => ((dump.d || {})[coll] || []).find(x => (x.id || x.trainId) === id);
function sameAsServer(dump, coll, id) {
  const l = localRec(dump, coll, id), s = st["envss_" + coll].get(id);
  if (!l || !s) return "missing " + (!l ? "local" : "server");
  return L.stable(l, SKIP) === L.stable(s.payload, SKIP) ? "" : "differs";
}
function expectOnly(sb, ids, label) {
  const sd = L.serverDiff(sb, L.serverSnap(st));
  const touched = sd.changed.map(s => s.split(" ")[0]).concat(sd.added);
  const unexpected = touched.filter(x => !ids.includes(x));
  check(label + ": server changed only the edited records", sd.missing.length === 0 && unexpected.length === 0, "changed/added " + touched.length + (unexpected.length ? " UNEXPECTED " + unexpected.join(",") : "") + (sd.missing.length ? " MISSING " + sd.missing.join(",") : ""));
  return sd;
}
function dupCheck(dump, label) {
  const ids = ((dump.d || {}).trains || []).map(t => t.id); const d = ids.filter((x, i) => ids.indexOf(x) !== i);
  check(label + ": no duplicate samples on the device", d.length === 0, d.join(","));
}
async function upgrade(dev, v, idle = 12000) {
  L.setVersion(v);
  const a = await dev.open(); await sleep(2500); const b = await dev.open(); await sleep(idle);
  return b;
}
const sleep = L.sleep;

if (SC === "s2") {
  log(`== S2 unsynced local edits survive the upgrade (${KIND}, from ${FROM}); Supabase unreachable during the upgrade, then back`);
  const A = await L.device("A", KIND, st, base);
  log("open", await A.open(true)); await sleep(6000);
  const p = await pick(A);
  A.supaOff = true; await sleep(500);
  await E.start(A, p.prepped[0]); await E.comment(A, p.ended[0], "S2 offline comment");
  const nw = await E.add(A, p.ev, "airborne_static"); const delId = p.prepped[1]; await E.del(A, delId); await E.evnote(A, p.ev, " [S2 note]");
  await sleep(2500);
  const before = await A.dump(), sb = L.serverSnap(st), w0 = st.writes.filter(w => CORE.test(w.t)).length;
  log(FROM + " pending before upgrade:", before.pending.join(", "));
  check("S2 edits are pending on " + FROM, before.pending.length >= 5, before.pending.length + " pending");
  let ver = FROM;
  for (const v of (FROM === "v45c" ? ["v46", "v47"] : ["v47"])) {
    const got = await upgrade(A, v, 6000);
    const mid = await A.dump(); const d = L.localDiff(before, mid);
    check(`S2 ${v}: app loaded`, /^46/.test(got), got);
    check(`S2 ${v}: local data intact while Supabase unreachable (nothing missing or changed)`, d.missing.length === 0 && d.changed.length === 0, JSON.stringify({ missing: d.missing, changed: d.changed.slice(0, 3), volatileOnly: d.volatileOnly.length }));
    check(`S2 ${v}: every pending edit still queued`, before.pending.every(k => mid.pending.includes(k)), mid.pending.length + " pending");
    const bar = await A.ev(() => (document.getElementById("syncBar") || {}).innerText || "");
    check(`S2 ${v}: shown as waiting to sync`, /pending|waiting/i.test(bar), bar.replace(/\s+/g, " ").slice(0, 90));
    check(`S2 ${v}: nothing written while unreachable`, st.writes.filter(w => CORE.test(w.t)).length === w0);
    dupCheck(mid, "S2 " + v);
    ver = v; if (v === "v46") break;
  }
  A.supaOff = false; await A.ev(() => window.dispatchEvent(new Event("online"))); await sleep(12000);
  const after = await A.dump();
  check(`S2 ${ver}: queue empty after Supabase is back`, after.pending.length === 0, after.pending.join(","));
  const ids = before.pending.map(k => "envss_" + k);   // exactly the records queued on the device (the delete also logs on its event)
  check(`S2 ${ver}: queued records are the ones edited`, ["trains:" + p.prepped[0], "trains:" + p.ended[0], "trains:" + nw, "deletions:" + delId, "events:" + p.ev].every(k => before.pending.includes(k)), before.pending.join(","));
  expectOnly(sb, ids, "S2 " + ver);
  for (const [c, id] of [["trains", p.prepped[0]], ["trains", p.ended[0]], ["trains", nw], ["events", p.ev]]) check(`S2 ${ver}: server copy of ${c}:${id} equals the device copy`, sameAsServer(after, c, id) === "", sameAsServer(after, c, id));
  check(`S2 ${ver}: deleted sample is a tombstone, row not deleted`, st.envss_deletions.has(delId) && st.envss_trains.has(delId) && !localRec(after, "trains", delId));
  const srv = st.envss_trains.get(p.ended[0]).payload; check(`S2 ${ver}: edit content on server`, srv.comments === "S2 offline comment" && (st.envss_trains.get(p.prepped[0]).payload.status === "running"));
  const d2 = L.localDiff(before, after);
  check(`S2 ${ver}: no local record lost after sync`, d2.missing.length === 0, d2.missing.join(","));
  dupCheck(after, "S2 after sync");
  if (ver === "v46") { const sb2 = L.serverSnap(st); await upgrade(A, "v47", 12000); const a3 = await A.dump(); const d3 = L.localDiff(after, a3); check("S2 then v47: no change, no write", d3.missing.length + d3.changed.length === 0 && L.serverDiff(sb2, L.serverSnap(st)).changed.length === 0, JSON.stringify(d3.changed.slice(0, 2))); }
  log("page errors", A.errs.length, A.errs.slice(0, 2).join(" | "), "mock errors", st.errors.join("|"));
  await A.close();
}

if (SC === "s3") {
  log(`== S3 offline upgrade then reconnect (${KIND})`);
  const A = await L.device("A", KIND, st, base);
  log("open", await A.open(true)); await sleep(6000);
  const p = await pick(A);
  /* device fully offline (no site, no Supabase) on v45c */
  await A.page.setOfflineMode(true); st.offline = true; await sleep(300);
  await E.start(A, p.prepped[0]); await E.comment(A, p.ended[1], "S3 offline comment on v45c");
  const nw = await E.add(A, p.ev, "noise_static"); await E.evnote(A, p.ev, " [S3 note]");
  await sleep(1500);
  await A.open(); await sleep(1500);   // offline reload: v45c from the worker cache
  const off45 = await A.dump();
  check("S3 v45c offline reload keeps the edits", off45.app === "45c" && off45.pending.length >= 4 && !!localRec(off45, "trains", nw), off45.app + " pending " + off45.pending.length);
  const sb = L.serverSnap(st);
  L.setVersion("v46");          // new version published while the device is offline
  await A.open(); await sleep(1500);
  const stillOff = await A.dump();
  check("S3 while still offline the cached app keeps working with the edits", stillOff.pending.length === off45.pending.length && L.localDiff(off45, stillOff).missing.length === 0, stillOff.app);
  await A.page.setOfflineMode(false); st.offline = false;
  const got = await A.open(); await sleep(2500); await A.open(); await sleep(12000);
  const on46 = await A.dump();
  check("S3 reconnect loads v46", on46.app === "46", on46.app);
  const d = L.localDiff(off45, on46);
  check("S3 v46: no local record missing or changed by the upgrade", d.missing.length === 0 && d.changed.length === 0, JSON.stringify({ missing: d.missing, changed: d.changed.slice(0, 3) }));
  check("S3 v46: offline edits uploaded, queue empty", on46.pending.length === 0, on46.pending.join(","));
  const ids1 = ["envss_trains:" + p.prepped[0], "envss_trains:" + p.ended[1], "envss_trains:" + nw, "envss_events:" + p.ev];
  expectOnly(sb, ids1, "S3 v46");
  for (const id of [p.prepped[0], p.ended[1], nw]) check("S3 v46: server = device for " + id, sameAsServer(on46, "trains", id) === "", sameAsServer(on46, "trains", id));
  /* now offline again on v46: reload from cache, more edits, reload, reconnect */
  await A.page.setOfflineMode(true); st.offline = true;
  await A.open(); await sleep(1500);
  const offv = await A.ev(() => APP_VERSION).catch(() => "?");
  check("S3 v46 loads offline from the worker cache", offv === "46", offv);
  await E.stop(A, p.prepped[0]); const nw2 = await E.add(A, p.ev, "noise_personal");
  await sleep(1200); await A.open(); await sleep(1500);
  const off46 = await A.dump();
  check("S3 v46 offline edits survive an offline reload", !!localRec(off46, "trains", nw2) && localRec(off46, "trains", p.prepped[0]).status === "ended" && off46.pending.length >= 2, "pending " + off46.pending.length);
  const sb2 = L.serverSnap(st);
  await A.page.setOfflineMode(false); st.offline = false; await A.open(); await sleep(12000);
  const back = await A.dump();
  check("S3 v46 reconnect: uploaded, queue empty", back.pending.length === 0, back.pending.join(","));
  expectOnly(sb2, ["envss_trains:" + p.prepped[0], "envss_trains:" + nw2, "envss_events:" + p.ev], "S3 v46 second round (adding a sample also logs it on its event)");
  check("S3 server = device for stopped sample and new noise sample", sameAsServer(back, "trains", p.prepped[0]) === "" && sameAsServer(back, "trains", nw2) === "");
  const sb3 = L.serverSnap(st); await upgrade(A, "v47", 12000); const a47 = await A.dump(); const d47 = L.localDiff(back, a47);
  check("S3 then v47: nothing lost or changed, no write", d47.missing.length + d47.changed.length === 0 && L.serverDiff(sb3, L.serverSnap(st)).changed.length === 0, JSON.stringify(d47.changed.slice(0, 2)));
  dupCheck(a47, "S3 final");
  log("page errors", A.errs.length, A.errs.slice(0, 2).join(" | "), "mock errors", st.errors.join("|"));
  await A.close();
}

if (SC === "s4") {
  log(`== S4 two devices (A Chromebook, B Pixel 7), from ${FROM}`);
  const A = await L.device("A", "chromebook", st, base), B = await L.device("B", "pixel7", st, base);
  log("open A", await A.open(true), "open B", await B.open(true)); await sleep(6000);
  const p = await pick(A);
  const X = p.ended[0], Y = p.ended[1], Z = p.ended[2], W = p.prepped[0];
  /* 1. B (old version) edits X; A has a stale copy of X and upgrades. A must take B's edit, not push its old copy. */
  A.supaOff = true;   // A not syncing while B edits (e.g. lid closed)
  await E.comment(B, X, "S4 B edit on X"); await sleep(3000);
  check("S4 B's edit reached the server", st.envss_trains.get(X).payload.comments === "S4 B edit on X");
  A.supaOff = false;
  const sb = L.serverSnap(st);
  const vA = await upgrade(A, process.env.UPG || "v46", 12000);
  const a1 = await A.dump();
  check("S4 A upgraded", vA.startsWith(process.env.UPG ? "45" : "46"), vA);
  check("S4 A did not push its stale copy over B's newer edit", st.envss_trains.get(X).payload.comments === "S4 B edit on X" && L.serverDiff(sb, L.serverSnap(st)).changed.length === 0);
  check("S4 A now shows B's edit", (localRec(a1, "trains", X) || {}).comments === "S4 B edit on X");
  /* 2. different records at the same time: A (v46) edits Y, B (old) edits Z */
  await E.comment(A, Y, "S4 A edit on Y"); await E.comment(B, Z, "S4 B edit on Z"); await sleep(12000);
  const a2 = await A.dump(), b2 = await B.dump();
  check("S4 both edits on the server", st.envss_trains.get(Y).payload.comments === "S4 A edit on Y" && st.envss_trains.get(Z).payload.comments === "S4 B edit on Z");
  check("S4 each device received the other's edit", (localRec(a2, "trains", Z) || {}).comments === "S4 B edit on Z" && (localRec(b2, "trains", Y) || {}).comments === "S4 A edit on Y");
  /* 3. SAME sample edited on both: A offline changes endFlow on X, B online changes comments on X, then A reconnects */
  A.supaOff = true; await A.page.setOfflineMode(true);
  await E.field(A, X, "endFlow", "1.95"); await sleep(500);
  await E.comment(B, X, "S4 B second edit on X"); await sleep(3000);
  await A.page.setOfflineMode(false); A.supaOff = false; await A.ev(() => window.dispatchEvent(new Event("online"))); await sleep(14000);
  const sx = st.envss_trains.get(X).payload;
  check("S4 same-sample edits on two devices: both kept (A's endFlow AND B's comment)", sx.endFlow === "1.95" && sx.comments === "S4 B second edit on X", "server endFlow=" + sx.endFlow + " comments=" + sx.comments);
  const auds = (sx.audit || []).map(a => a.action + "|" + (a.to || ""));
  check("S4 audit entries from both devices kept", auds.some(a => /S4 B second edit/.test(a)) && auds.some(a => /1\.95/.test(a)), auds.slice(-4).join(" / "));
  await sleep(9000);
  const a3 = await A.dump(), b3 = await B.dump();
  check("S4 both devices end with the same copy of X", L.stable(localRec(a3, "trains", X), SKIP) === L.stable(localRec(b3, "trains", X), SKIP));
  /* 3b. same FIELD on both (A v46 offline, B old online): A's value kept, B's value kept in the audit trail */
  A.supaOff = true; await A.page.setOfflineMode(true);
  await E.comment(A, Y, "S4 A conflicting comment"); await sleep(500);
  await E.comment(B, Y, "S4 B conflicting comment"); await sleep(3000);
  await A.page.setOfflineMode(false); A.supaOff = false; await A.ev(() => window.dispatchEvent(new Event("online"))); await sleep(14000);
  const sy = st.envss_trains.get(Y).payload, cfy = (sy.audit || []).find(a => /Sync conflict/.test(a.action) && a.field === "comments");
  check("S4 same field on both: newest edit from A kept, B's value kept in the audit trail", sy.comments === "S4 A conflicting comment" && cfy && cfy.from === "S4 B conflicting comment", JSON.stringify(cfy || null).slice(0, 160));
  /* 4. B upgrades too, then v47 on both */
  await sleep(9000); const b3x = await B.dump(); const a3x = await A.dump();
  check("S4 both devices agree on Y after the conflict", L.stable(localRec(a3x, "trains", Y), SKIP) === L.stable(localRec(b3x, "trains", Y), SKIP));
  const sb4 = L.serverSnap(st); const vB = await upgrade(B, "v46", 12000); const b4 = await B.dump(); const db4 = L.localDiff(b3x, b4);
  check("S4 B upgrade: nothing lost/changed, no write", vB.startsWith("46") && db4.missing.length + db4.changed.length === 0 && L.serverDiff(sb4, L.serverSnap(st)).changed.length === 0, JSON.stringify(db4.changed.slice(0, 2)));
  L.setVersion("v47"); await A.open(); await B.open(); await sleep(2500); await A.open(); await B.open(); await sleep(12000);
  const sb5 = sb4; const s5 = L.serverDiff(L.serverSnap(st), L.serverSnap(st));
  const a5 = await A.dump(), b5 = await B.dump();
  check("S4 v47 on both: no record lost on either device", L.localDiff(a3x, a5).missing.length === 0 && L.localDiff(b4, b5).missing.length === 0);
  dupCheck(a5, "S4 A"); dupCheck(b5, "S4 B");
  log("page errors A", A.errs.length, A.errs.slice(0, 2).join(" | "), "B", B.errs.length, B.errs.slice(0, 2).join(" | "), "mock errors", st.errors.join("|"));
  await A.close(); await B.close();
}
if (SC === "s5") {
  log("== S5 two devices, edits made on v45c while offline, upgrade happens with the edits still queued (no synced base copy yet)");
  const A = await L.device("A", "chromebook", st, base), B = await L.device("B", "pixel7", st, base);
  log("open A", await A.open(true), "open B", await B.open(true)); await sleep(6000);
  const p = await pick(A);
  const W = p.ended[3], V = p.ended[4];
  await A.page.setOfflineMode(true); A.supaOff = true;
  await E.field(A, W, "endFlow", "1.85"); await E.comment(A, V, "S5 A comment on V"); await sleep(800);
  await E.comment(B, W, "S5 B comment on W"); await E.comment(B, V, "S5 B comment on V"); await sleep(3000);
  const sb = L.serverSnap(st);
  L.setVersion("v46");
  await A.page.setOfflineMode(false); A.supaOff = false;
  const got = await A.open(); await sleep(2500); await A.open(); await sleep(14000);
  check("S5 A came back online on v46 with the queued edits", got.startsWith("46"), got);
  const w = st.envss_trains.get(W).payload, v = st.envss_trains.get(V).payload;
  check("S5 different fields on the same sample: both kept (A's endFlow, B's comment)", w.endFlow === "1.85" && w.comments === "S5 B comment on W", "endFlow=" + w.endFlow + " comments=" + w.comments);
  const cf = (v.audit || []).find(a => /Sync conflict/.test(a.action));
  check("S5 same field changed on both: this device's value kept AND the other value kept in the audit trail", v.comments === "S5 A comment on V" && cf && /S5 B comment on V/.test(cf.from), "comments=" + v.comments + " conflict=" + JSON.stringify(cf || null).slice(0, 160));
  check("S5 audit entries from both devices kept", (w.audit || []).some(a => /S5 B comment on W/.test(a.to || "")) && (w.audit || []).some(a => a.to === "1.85"));
  expectOnly(sb, ["envss_trains:" + W, "envss_trains:" + V], "S5");
  await sleep(9000);
  const a = await A.dump(), b = await B.dump();
  check("S5 both devices end with the same copies", L.stable(localRec(a, "trains", W), SKIP) === L.stable(localRec(b, "trains", W), SKIP) && L.stable(localRec(a, "trains", V), SKIP) === L.stable(localRec(b, "trains", V), SKIP));
  log("page errors A", A.errs.length, A.errs.slice(0, 2).join(" | "), "B", B.errs.length, "mock errors", st.errors.join("|"));
  await A.close(); await B.close();
}
log(`${SC} ${KIND}: ${fails ? fails + " FAILED" : "all passed"}`);
fs.writeFileSync(`/workspace/envss-field/work/datacheck/result_${SC}_${KIND}_${FROM}.txt`, out.join("\n"));
server.close(); process.exit(fails ? 1 : 0);

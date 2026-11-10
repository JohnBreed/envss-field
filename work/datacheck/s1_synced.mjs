/* Scenario 1: synced data only. v45c device fully synced with the copy of live rows, then upgrade to v46, then v47.
   Expect: zero writes to core tables, every local and server record identical. Also browses every event and sample. */
import * as L from "./uplib.mjs"; import fs from "fs";
const out = []; const log = (...a) => { const s = a.join(" "); console.log(s); out.push(s); };
const CORE = /^envss_(projects|events|trains|deletions|hires)$/;
const { server, base } = await L.serve();
const st = L.seedStore();
L.setVersion("v45c");
const A = await L.device("A", process.argv[2] || "chromebook", st, base);
log("open v45c:", await A.open(true)); await A.settle(6000);
const v45 = await A.dump();
log("v45c local:", L.COLLS.map(c => c + "=" + ((v45.d || {})[c] || []).length).join(" "), "pending", v45.pending.length, "sw", v45.sw.split("/").pop());
log("server counts", JSON.stringify(L.counts(st)), "writes during v45c boot", st.writes.length);
async function browse(dev) {
  await dev.ev(async () => { const wait = ms => new Promise(r => setTimeout(r, ms));
    for (const e of db.events.slice()) { openEvent(e.id); await wait(60); }
    for (const t of db.trains.slice()) { openTrain(t.id); await wait(60); }
    view.page = "dash"; render(); });
}
let fails = 0;
for (const v of ["v46", "v47"]) {
  const before = await A.dump(), sb = L.serverSnap(st), w0 = st.writes.length;
  L.setVersion(v);
  log(`\n== upgrade to ${v}: first load`, await A.open()); await A.settle(4000);
  log("second load (new worker active)", await A.open()); await A.settle(35000);
  const mid = await A.dump();
  const d1 = L.localDiff(before, mid);
  await browse(A); await A.settle(6000);
  const after = await A.dump();
  const d2 = L.localDiff(before, after), sd = L.serverDiff(sb, L.serverSnap(st));
  const writes = st.writes.slice(w0), core = writes.filter(w => CORE.test(w.t));
  log("app", after.app, "sw", after.sw.split("/").pop(), "pending", after.pending.length);
  log("local diff after idle 35 s:", JSON.stringify({ missing: d1.missing.length, added: d1.added.length, changed: d1.changed.length, volatileOnly: d1.volatileOnly.length }));
  log("local diff after browsing every event + sample:", JSON.stringify({ missing: d2.missing, added: d2.added, changed: d2.changed.slice(0, 8), changedN: d2.changed.length, volatileOnly: d2.volatileOnly.length }));
  log("server diff:", JSON.stringify({ missing: sd.missing, added: sd.added, changed: sd.changed.slice(0, 8), changedN: sd.changed.length }));
  log("writes:", writes.length, "core-table writes:", core.length, core.slice(0, 5).map(w => w.m + " " + w.t + " " + w.id).join(", "), "other:", [...new Set(writes.filter(w => !CORE.test(w.t)).map(w => w.t))].join(","));
  const bad = d2.missing.length + d2.changed.length + sd.missing.length + sd.changed.length + core.length + st.errors.length;
  log(bad ? "RESULT " + v + ": FAIL" : "RESULT " + v + ": PASS (no loss, no change, no duplicate, no core write)"); if (bad) fails++;
}
log("page errors:", A.errs.length, A.errs.slice(0, 3).join(" | "), "mock errors:", st.errors.join(" | "));
fs.writeFileSync("/workspace/envss-field/work/datacheck/result_s1_" + (process.argv[2] || "chromebook") + ".txt", out.join("\n"));
await A.close(); server.close(); process.exit(fails ? 1 : 0);

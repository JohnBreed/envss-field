/* v46 Version 1 headless checks. Mock Supabase only (no production writes). Usage: node test.mjs <chromebook|pixel7> */
import { serve, launch, VIEWPORTS, mockSupabase, sleep, SESSION } from "./harness.mjs";
import fs from "fs";
const vp = process.argv[2] || "chromebook";
const { server, base } = await serve();
const browser = await launch(["--host-resolver-rules=MAP *.supabase.co 127.0.0.1:9"]);
const results = []; let fails = 0;
const ok = (name, cond, extra) => { console.error((cond ? "PASS " : "FAIL ") + name + (extra ? " — " + extra : "")); results.push((cond ? "PASS " : "FAIL ") + name + (extra ? " — " + extra : "")); if (!cond) fails++; };
const page = await browser.newPage();
await page.setViewport(VIEWPORTS[vp].viewport); await page.setUserAgent(VIEWPORTS[vp].ua);
await page.setRequestInterception(true);
const store = { envss_projects: new Map([["ptest", { id: "ptest", updated_at: "2026-11-10T00:00:00Z", payload: { id: "ptest", number: "9999901", name: "V46 TEST project (delete me)", client: "TEST", controller: "V46 Test", status: "Active", source: "podio", active: true } }]]) };
const opts = {}; const log = mockSupabase(page, store, opts);
const errs = []; page.on("pageerror", e => errs.push(String(e)));
const dialogs = []; let dialogAnswer = true;
page.on("dialog", async d => { dialogs.push(d.type() + ": " + d.message()); dialogAnswer ? await d.accept() : await d.dismiss(); });
await page.goto(base + "/field.html", { waitUntil: "domcontentloaded" });
await page.evaluate(SESSION); await page.reload({ waitUntil: "networkidle0" }); await sleep(1500);
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const shot = n => page.screenshot({ path: `/tmp/v46-${vp}-${n}.png`, fullPage: true });

/* 0. boot */
const boot = await ev(() => ({ v: document.getElementById("appVersion").textContent, noise: window.ENVSS_NOISE && ENVSS_NOISE.version, core: !!window.envssCore, sw: "serviceWorker" in navigator }));
ok("boot: app v46", boot.v === "v46", boot.v); ok("boot: noise.js loaded with own version", /^4[67]\.0$/.test(boot.noise), boot.noise); ok("boot: envssCore interface", boot.core);
await ev(() => { db.events.push({ id: "etest", projectId: "ptest", code: "9999901-001", type: "hygiene", date: "2026-11-11", stage: "planned", audit: [], notes: "TEST EVENT" }); save(); });

/* 1. START gates for the five types (+ blank) */
const kinds = ["airborne_personal", "airborne_static", "airborne_passive", "noise_personal", "noise_static", "blank"];
const ids = {};
for (const k of kinds) { ids[k] = await ev(k => { addTrain("etest", k); return view.trainId; }, k); await sleep(150); }
const expect = {
  airborne_personal: ["Contaminant", "Pump serial", "Sample head", "Cassette / filter / tube", "Start flow", "First name", "Last name", "Occupation"],
  airborne_static: ["Contaminant", "Pump serial", "Sample head", "Cassette / filter / tube", "Start flow", "Location"],
  airborne_passive: ["Badge ID", "First name", "Last name", "Occupation"],
  noise_personal: ["Dosimeter serial", "First name", "Last name", "Occupation"],
  noise_static: ["Dosimeter serial", "Location"],
  blank: []
};
for (const k of kinds) {
  const g = await ev(id => startGaps(db.trains.find(t => t.id === id)), ids[k]);
  ok("B10 gate " + k, JSON.stringify(g) === JSON.stringify(expect[k]), g.join(", "));
}
/* START button really blocks (UI) */
await ev(id => openTrain(id), ids.airborne_personal); await sleep(300);
dialogs.length = 0; await page.click("#btnStart"); await sleep(300);
const st1 = await ev(id => db.trains.find(t => t.id === id).status, ids.airborne_personal);
ok("B10 START blocked in UI with message", st1 !== "running" && dialogs.some(d => /Cannot start/.test(d) && /Occupation/.test(d)), dialogs.join(" | ").slice(0, 160));
/* location on all five types; only static blocks */
for (const k of kinds.slice(0, 5)) {
  await ev(id => openTrain(id), ids[k]); await sleep(200);
  const has = await ev(() => !!document.getElementById("location"));
  ok("B13a location field on " + k, has);
}
/* passive screen: badge id, no pump/head/flow */
await ev(id => openTrain(id), ids.airborne_passive); await sleep(250);
const pas = await ev(() => ({ badge: !!document.getElementById("badgeId"), pump: !!document.getElementById("pump"), head: !!document.getElementById("head"), flow: !!document.getElementById("startFlow"), endFlow: !!document.getElementById("endFlow") }));
ok("B12 passive screen: badge ID, no pump/head/flow", pas.badge && !pas.pump && !pas.head && !pas.flow && !pas.endFlow, JSON.stringify(pas));
await shot("passive");

/* 2. B9 allocation */
const A = ids.airborne_personal, B = await ev(() => { addTrain("etest", "airborne_personal"); return view.trainId; }), C = ids.airborne_passive, D = ids.noise_personal;
const E = await ev(() => { addTrain("etest", "airborne_personal"); const t = db.trains.find(x => x.id === view.trainId); t.person.first = "Other"; t.person.last = "Person"; save(); return t.id; });
await ev(A => { const t = db.trains.find(x => x.id === A); Object.assign(t, { contaminantId: "SIL", pumpSerial: "P1", headId: "H1", mediaId: "M1", startFlow: "2.2", seg: "SEG 1", shiftDate: "2026-11-11" }); t.person.first = "Jo"; t.person.last = "Tester"; t.person.occupation = "Fitter"; t.person.hours = "12"; save(); openTrain(A); }, A);
await sleep(300);
const pick = await ev(() => ({ box: !!document.getElementById("allocBox"), items: [...document.querySelectorAll("[data-alloc]")].map(i => i.dataset.alloc) }));
ok("B9 allocate button shown", pick.box);
ok("B9 only unallocated samples listed (not someone else's)", pick.items.includes(B) && pick.items.includes(C) && pick.items.includes(D) && !pick.items.includes(E) && !pick.items.includes(A), pick.items.length + " listed");
await page.click("#btnAllocate"); await sleep(100);
await page.click(`[data-alloc="${B}"]`); await page.click(`[data-alloc="${C}"]`);
await page.click("#btnAllocSelect"); await sleep(200);
const q = await ev(() => document.querySelector("#v46Modal .v46-q")?.textContent);
ok("B9 confirm question text", q === "Are you sure you want to allocate these samples to this individual?", q);
await page.click("#v46No"); await sleep(200);
ok("B9 No leaves samples unallocated", await ev(B => !db.trains.find(x => x.id === B).personTag, B));
await ev(() => document.getElementById("allocPick").hidden = false);
await ev((B, C) => document.querySelectorAll("[data-alloc]").forEach(i => { i.checked = i.dataset.alloc === B || i.dataset.alloc === C; }), B, C);
await page.click("#btnAllocSelect"); await sleep(200); await page.click("#v46Yes"); await sleep(400);
const al = await ev((A, B, C) => { const f = id => db.trains.find(x => x.id === id); return { tagA: f(A).personTag, tagB: f(B).personTag, tagC: f(C).personTag, nB: f(B).person.first + " " + f(B).person.last + " " + f(B).person.occupation, segB: f(B).seg, hoursC: f(C).person.hours, aud: (f(B).audit || []).some(a => a.action === "Allocated to person") }; }, A, B, C);
ok("B9 Yes allocates with one person tag", al.tagA && al.tagA === al.tagB && al.tagA === al.tagC, JSON.stringify(al));
ok("B9 person + shared fields copied", al.nB === "Jo Tester Fitter" && al.segB === "SEG 1" && al.hoursC === "12");
ok("B9 allocation in audit log", al.aud);
const relist = await ev(() => [...document.querySelectorAll("[data-alloc]")].map(i => i.dataset.alloc));
ok("B9 allocated samples no longer offered", !relist.includes(B) && !relist.includes(C) && relist.includes(D));
/* shared edit propagates (UI input on A) */
await page.$eval("#seg", el => { el.value = "SEG 7 - Maintenance"; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); });
await page.$eval("#location", el => { el.value = "Workshop bay 2"; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); });
await page.$eval("#hours", el => { el.value = "10"; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); });
await sleep(900);
const pr = await ev((B, C, E) => { const f = id => db.trains.find(x => x.id === id); return { b: [f(B).seg, f(B).location, f(B).person.hours], c: [f(C).seg, f(C).location, f(C).person.hours], e: f(E).seg || "", aud: (f(B).audit || []).some(a => /Changed SEG/.test(a.action)) }; }, B, C, E);
ok("B9 shared field edit updates every tagged sample", pr.b.join("|") === "SEG 7 - Maintenance|Workshop bay 2|10" && pr.c.join("|") === "SEG 7 - Maintenance|Workshop bay 2|10", JSON.stringify(pr));
ok("B9 edit does not touch other people's samples", pr.e === "");
ok("B9 propagated change audited on sibling", pr.aud);

/* 3. B11 PPE carry-across */
await page.click('[data-yn="rpd"][data-val="yes"]'); await sleep(300);
await page.$eval("#rpdModel", el => { el.value = "3M 6500"; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); });
await sleep(900);
const ppe = await ev((B, C) => { const f = id => db.trains.find(x => x.id === id); return { b: [f(B).rpdAsked, f(B).rpd?.model], c: [f(C).rpdAsked, f(C).rpd?.model] }; }, B, C);
ok("B11 respirator answers pre-fill same person's airborne samples", ppe.b.join("|") === "yes|3M 6500" && ppe.c.join("|") === "yes|3M 6500", JSON.stringify(ppe));
/* noise: allocate D, HPD not carried */
await ev(D => { const t = db.trains.find(x => x.id === D); t.hpdAsked = ""; save(); }, D);
await ev(() => document.getElementById("allocPick") && (document.getElementById("allocPick").hidden = false));
await page.click(`[data-alloc="${D}"]`); await page.click("#btnAllocSelect"); await sleep(200); await page.click("#v46Yes"); await sleep(400);
const dn = await ev(D => { const t = db.trains.find(x => x.id === D); return { tag: !!t.personTag, hpd: t.hpdAsked || "", rpd: t.rpdAsked || "" }; }, D);
ok("B11 noise sample allocated, hearing protection not carried", dn.tag && dn.hpd === "" && dn.rpd === "", JSON.stringify(dn));

/* 4. B12 start all */
await ev((B, C) => { const f = id => db.trains.find(x => x.id === id); Object.assign(f(B), { contaminantId: "SIL", pumpSerial: "P2", headId: "H2", mediaId: "M2", startFlow: "2.2" }); Object.assign(f(C), { contaminantId: "FORM", badgeId: "BADGE-77" }); save(); }, B, C);
await ev(A => openTrain(A), A); await sleep(300);
const sa = await ev(() => document.getElementById("btnStartAll")?.textContent || "");
ok("B12 start-all button for the person", /Start all 4 samples/.test(sa), sa);
await page.click("#btnStartAll"); await sleep(300);
const saTxt = await ev(() => document.getElementById("v46Modal")?.innerText || "");
ok("B12 start-all lists blocked sample", /Not started/.test(saTxt) && /Dosimeter serial/.test(saTxt), saTxt.replace(/\s+/g, " ").slice(0, 140));
await page.click("#v46Yes"); await sleep(800);
const run = await ev((A, B, C, D) => [A, B, C, D].map(id => { const t = db.trains.find(x => x.id === id); return t.status + "@" + (t.startAt || "").slice(0, 19); }), A, B, C, D);
ok("B12 start-all starts ready samples together, skips blocked", run[0].startsWith("running") && run[0] === run[1] && run[1] === run[2] && !run[3].startsWith("running"), run.join(", "));
/* each stopped individually: stop A only */
dialogAnswer = true; dialogs.length = 0;
await ev(A => openTrain(A), A); await sleep(250);
await page.click("#btnStop").catch(() => {}); await sleep(500);
const stp = await ev((A, B) => [db.trains.find(x => x.id === A).status, db.trains.find(x => x.id === B).status], A, B);
ok("B12 stop is per sample (soft warning only)", stp[0] !== "running" && stp[1] === "running", stp.join(",") + " dialogs:" + dialogs.length);
await shot("person");

/* 4b. B9 reallocation rule (John, 11 Nov 2026): started samples can never be reallocated; an unstarted sample that
   belongs to someone can be reallocated only after "Clear this sample's information" (confirmed, audited). */
const H = await ev(() => { addTrain("etest", "airborne_personal"); const t = db.trains.find(x => x.id === view.trainId); t.person.first = "Sam"; t.person.last = "Second"; t.person.occupation = "Operator"; save(); return t.id; });
const J = await ev(() => { addTrain("etest", "airborne_personal"); const t = db.trains.find(x => x.id === view.trainId); t.startAt = new Date().toISOString(); t.status = "running"; save(); return t.id; });   // legacy: started with no name
await ev(H => openTrain(H), H); await sleep(300);
const rl = await ev(() => ({ free: [...document.querySelectorAll("[data-alloc]")].map(i => i.dataset.alloc),
  others: [...document.querySelectorAll("#allocOthers [data-other]")].map(d => ({ id: d.dataset.other, clear: !!d.querySelector("[data-clear]"), locked: !!d.querySelector(".v46-locked") })) }));
const o = id => rl.others.find(x => x.id === id) || {};
ok("B9 rule: started samples never offered for allocation (incl. a started sample with no name)", ![A, B, C, J].some(id => rl.free.includes(id)), rl.free.length + " offered");
ok("B9 rule: someone else's started samples shown locked, no clear button", o(A).locked && !o(A).clear && o(B).locked && o(C).locked && !o(B).clear, JSON.stringify(rl.others));
ok("B9 rule: someone else's unstarted samples offer Clear, not Allocate", o(D).clear && o(E).clear && !rl.free.includes(D) && !rl.free.includes(E));
const snapA = await ev(A => JSON.stringify(db.trains.find(x => x.id === A)), A), snapE = await ev(E => JSON.stringify(db.trains.find(x => x.id === E)), E);
dialogs.length = 0;
const n1 = await ev((H, A) => v46Allocate(db.trains.find(x => x.id === H), [A]), H, A); await sleep(200);
ok("B9 rule: allocating a started sample is blocked with the reason", n1 === 0 && dialogs.some(d => /has been started/.test(d) && /cannot be reallocated/.test(d)) && await ev((A, s) => JSON.stringify(db.trains.find(x => x.id === A)) === s, A, snapA), dialogs.join(" | ").slice(0, 160));
dialogs.length = 0;
const n2 = await ev((H, E) => v46Allocate(db.trains.find(x => x.id === H), [E]), H, E); await sleep(200);
ok("B9 rule: allocating someone else's unstarted sample is blocked until cleared", n2 === 0 && dialogs.some(d => /Clear this sample's information first/.test(d)) && await ev((E, s) => JSON.stringify(db.trains.find(x => x.id === E)) === s, E, snapE), dialogs.join(" | ").slice(0, 160));
dialogs.length = 0;
const c1 = await ev(A => v46ClearSample(A), A); await sleep(200);
ok("B9 rule: Clear is refused on a started sample, nothing removed", c1 === false && dialogs.some(d => /has been started/.test(d)) && await ev((A, s) => JSON.stringify(db.trains.find(x => x.id === A)) === s, A, snapA));
await ev(H => openTrain(H), H); await sleep(250);
await ev(() => { document.getElementById("allocOthers").open = true; });
await page.click(`#allocOthers [data-clear="${E}"]`); await sleep(200);
const cq = await ev(() => document.querySelector("#v46Modal .v46-q")?.textContent || "");
ok("B9 rule: Clear asks for confirmation", cq === "Clear this sample's information?", cq);
await page.click("#v46No"); await sleep(250);
ok("B9 rule: No keeps the sample's information", await ev((E, s) => JSON.stringify(db.trains.find(x => x.id === E)) === s, E, snapE));
await ev(() => { document.getElementById("allocOthers").open = true; });
await page.click(`#allocOthers [data-clear="${E}"]`); await sleep(200); await page.click("#v46Yes"); await sleep(400);
const ce = await ev(E => { const t = db.trains.find(x => x.id === E); return { p: [t.person.first, t.person.last, t.person.occupation].join(""), tag: t.personTag || "", kind: t.trainKind, id: t.id, aud: (t.audit || []).find(a => a.action === "Sample information cleared for reallocation") || null }; }, E);
ok("B9 rule: Yes clears person details and logs it in the audit trail", ce.p === "" && !ce.tag && ce.kind === "airborne_personal" && ce.aud && /Other Person/.test(ce.aud.detail), JSON.stringify(ce).slice(0, 200));
const fr = await ev(() => [...document.querySelectorAll("[data-alloc]")].map(i => i.dataset.alloc));
ok("B9 rule: once cleared it appears in the unallocated list", fr.includes(E), fr.length + " offered");
await ev(() => document.getElementById("allocPick").hidden = false);
await page.click(`[data-alloc="${E}"]`); await page.click("#btnAllocSelect"); await sleep(200); await page.click("#v46Yes"); await sleep(400);
const re = await ev((E, H) => { const f = id => db.trains.find(x => x.id === id); return { n: f(E).person.first + " " + f(E).person.last, same: f(E).personTag && f(E).personTag === f(H).personTag }; }, E, H);
ok("B9 rule: cleared sample can then be allocated to the new person", re.n === "Sam Second" && re.same, JSON.stringify(re));
await ev(A => openTrain(A), A); await sleep(250);
const own = await ev(() => ({ locked: !!document.getElementById("allocThisLocked"), clear: !!document.getElementById("btnClearThis") }));
ok("B9 rule: on a started sample's own screen: locked note, no Clear", own.locked && !own.clear, JSON.stringify(own));
await ev(D => openTrain(D), D); await sleep(250);
ok("B9 rule: on an unstarted allocated sample's own screen: Clear offered", await ev(() => !!document.getElementById("btnClearThis") && !document.getElementById("allocThisLocked")));
await shot("realloc");

/* 5. A14 sync: online flush to mock store */
await sleep(2500);
const synced = await ev(() => ({ n: v46Unsynced(), pend: envssSync.pendingCount() }));
ok("A14 changes reach Supabase (mock) when online", store.envss_trains && store.envss_trains.has(A) && synced.n === 0, JSON.stringify(synced) + " rows:" + (store.envss_trains ? store.envss_trains.size : 0));
/* offline: save, visible state */
store.offline = true; await page.setOfflineMode(true);
await ev(() => window.dispatchEvent(new Event("offline")));
const F = await ev(() => { addTrain("etest", "airborne_static"); const t = db.trains.find(x => x.id === view.trainId); t.location = "TEST offline"; save(); return t.id; });
await sleep(1500);

const offBar = await ev(() => ({ n: v46Unsynced(), bar: document.getElementById("syncBar").innerText, chip: document.getElementById("v46SampleSync")?.textContent || "" }));
ok("A14 offline change kept and shown as waiting", offBar.n > 0 && /waiting/i.test(offBar.bar) && /waiting to sync/.test(offBar.chip), offBar.bar.replace(/\s+/g, " ").slice(0, 120));
/* IndexedDB second copy + restore when localStorage copy is lost */
await sleep(500);
await ev(() => new Promise(r => setTimeout(r, 400)));
await page.setOfflineMode(false); store.offline = true;   // keep Supabase unreachable, page reload allowed
await ev(() => localStorage.removeItem("envss-field-next-v32"));
await page.reload({ waitUntil: "networkidle0" }); await sleep(1800);
const rest = await ev(F => ({ has: db.trains.some(t => t.id === F), ls: !!localStorage.getItem("envss-field-next-v32") }), F);
ok("A14 data restored from the IndexedDB copy after localStorage loss", rest.has && rest.ls, JSON.stringify(rest));
/* retry: Supabase back */
store.offline = false;
await ev(() => window.dispatchEvent(new Event("online"))); await sleep(3000);
const back = await ev(() => v46Unsynced());
ok("A14 queued change sent when Supabase is back", store.envss_trains.has(F) && back === 0, "unsynced " + back);
/* failure keeps it queued with tries */
opts.failTables = ["envss_trains"];
await ev(F => { const t = db.trains.find(x => x.id === F); t.comments = "TEST retry"; t.commentAsked = "yes"; save(); }, F); await sleep(2500);
const fq = await ev(F => { const p = envssSync.state().pending["trains:" + F]; return p ? p.tries : 0; }, F);
ok("A14 failed upload stays queued with retry count", fq >= 1, "tries " + fq);
opts.failTables = []; await ev(() => { envssSync.scanDirty(); envssSync.flushQueue(); }); await sleep(2500);
const rr = await ev(F => ({ n: v46Unsynced(), p: JSON.stringify(envssSync.state().pending).slice(0, 200) }), F);
ok("A14 retry succeeds", rr.n === 0 && ((store.envss_trains.get(F) || {}).payload || {}).comments === "TEST retry", JSON.stringify(rr) + " remote:" + ((store.envss_trains.get(F) || {}).payload || {}).comments);

/* A14b: a newer change from another device is merged, not overwritten */
{
  const row = store.envss_trains.get(F); const pl = JSON.parse(JSON.stringify(row.payload));
  pl.comments = "TEST other device comment"; pl.audit = (pl.audit || []).concat([{ at: new Date().toISOString(), who: "Other Device <o@envss.com.au>", action: "edit", field: "comments", from: "", to: "TEST other device comment" }]);
  store.envss_trains.set(F, Object.assign({}, row, { payload: pl, updated_by: "Other Device <o@envss.com.au> · Android", updated_at: new Date().toISOString() }));
  await ev(F => { const t = db.trains.find(x => x.id === F); t.location = "TEST this device location"; save(); }, F); await sleep(2500);
  const m = (store.envss_trains.get(F) || {}).payload || {};
  ok("A14b other device's newer edit kept when this device sends its own", m.comments === "TEST other device comment" && m.location === "TEST this device location" && (m.audit || []).some(a => a.who && /Other Device/.test(a.who)) , JSON.stringify({ c: m.comments, l: m.location }));
  const pl2 = JSON.parse(JSON.stringify(store.envss_trains.get(F).payload)); pl2.location = "TEST other device location";
  store.envss_trains.set(F, Object.assign({}, store.envss_trains.get(F), { payload: pl2, updated_by: "Other Device <o@envss.com.au> · Android" }));
  await ev(F => { const t = db.trains.find(x => x.id === F); t.location = "TEST this device location 2"; save(); }, F); await sleep(2500);
  const m2 = (store.envss_trains.get(F) || {}).payload || {}; const cf = (m2.audit || []).find(a => /Sync conflict/.test(a.action) && a.field === "location");
  ok("A14b same field changed on both: this device's value kept, other value in the audit trail", m2.location === "TEST this device location 2" && cf && cf.from === "TEST other device location", JSON.stringify(cf || null).slice(0, 120));
  const dbl = await ev(F => db.trains.find(x => x.id === F).location, F);
  ok("A14b device and Supabase agree after the merge", dbl === m2.location);
}

/* 6. existing flows: field blank, airborne start/stop with soft warning */
await ev(() => { addTrain("etest", "blank"); }); await sleep(200);
ok("field blank: no START gates", await ev(() => startGaps(db.trains.find(t => t.id === view.trainId)).length === 0));
const G = await ev(() => { addTrain("etest", "airborne_static"); const t = db.trains.find(x => x.id === view.trainId); Object.assign(t, { contaminantId: "SIL", pumpSerial: "P9", headId: "H9", mediaId: "M9", startFlow: "2.0", location: "TEST static" }); save(); openTrain(t.id); return t.id; });
await sleep(250); await page.click("#btnStart"); await sleep(600);
dialogs.length = 0; await page.click("#btnStop"); await sleep(600);
const gS = await ev(G => db.trains.find(x => x.id === G).status, G);
ok("airborne static start → stop (soft warning, not blocked)", gS !== "running" && gS !== "planned", gS + " / " + dialogs.join("|").slice(0, 90));
/* noise via noise.js: gate + fault reasons + HPD box */
await ev(D => openTrain(D), D); await sleep(250);
const nz = await ev(D => ({ dosi: !!document.getElementById("dosimeter"), hpd: !!document.querySelector('[data-yn="hpd"]'), noAnalysis: !document.querySelector(".analysis-box"), rej: rejectList(db.trains.find(x => x.id === D)).map(r => r.code).join(",") }), D);
ok("noise screen from noise.js (dosimeter, HPD, no analyses, fault list)", nz.dosi && nz.hpd && nz.noAnalysis && nz.rej === "battery_fault,measurement_fault", JSON.stringify(nz));
/* hire + login log still present */
const fx = await ev(() => ({ hire: !!(window.envssHire && envssHire.openNew), log: !!(window.envssLoginLog && envssLoginLog.record) }));
ok("hire form + login log modules present", fx.hire && fx.log);
await ev(() => { envssHire.openNew(); }); await sleep(300);
ok("hire form opens", await ev(() => /hire/i.test(document.getElementById("app").innerText)));

/* 7. E18 Refresh from Podio reads the mirror view; 420 handled */
store.v_field_hyg_events = new Map([["1", { item_id: 1, title: "TEST", last_edit_on: "2026-11-10T01:00:00Z", synced_at: "2026-11-10T13:05:59Z", fields: { "reference-3": "9999901-002", project: { title: "9999901-TEST", item_id: 5 }, "site-works-start-date": { start: "2026-11-12 00:00:00" }, "site-works-start-date-status": "Site Works Start Date is Tentative", company: "TEST Co", "first-name": "Pat" } }]]);
await ev(() => openProject("ptest")); await sleep(300);
await ev(() => envssPodio.refresh()); await sleep(800);
const pod = await ev(() => ({ html: document.getElementById("podioPlan")?.innerText || "", rows: envssPodio.rows("9999901").length }));
ok("E18 refresh lists planned HYG event from the mirror", pod.rows === 1 && /9999901-002/.test(pod.html), pod.html.replace(/\s+/g, " ").slice(0, 120) + " state:" + JSON.stringify(await ev(() => envssPodio.state())) + " log:" + log.filter(l => /hyg/.test(l)).join(","));
ok("E18 no Podio or edge-function call made", !log.some(l => /functions\/v1|podio\.com/.test(l)));
/* puppeteer cannot fake a 420 on the wire, so the page's fetch helper answers 420 once */
await ev(() => { localStorage.removeItem("envss-podio-cooldown-v46"); window._sbf = sbFetch; sbFetch = async (u, i) => /v_field_hyg_events/.test(u) ? new Response("{}", { status: 420, headers: { "Retry-After": "60" } }) : window._sbf(u, i); });
await ev(() => envssPodio.refresh()); await sleep(300);
await ev(() => { sbFetch = window._sbf; });
const p420 = await ev(() => ({ st: envssPodio.state(), rows: envssPodio.rows("9999901").length }));
ok("E18 HTTP 420 → cool-down message, saved events kept", /busy/.test(p420.st.note) && !p420.st.err && p420.rows === 1, p420.st.note);
opts.tableStatus = {};
await ev(() => { createEvent && 0; });
const unpl = await ev(() => { const e = db.events.find(x => x.id === "etest"); e.podioUnplanned = true; openEvent("etest"); return document.getElementById("podioUnplanned")?.textContent || ""; });
ok("E18 unplanned event not flagged to office", unpl === "Not linked to a Podio event.", unpl);

/* 8. E17 dashboard */
await ev(() => { view.page = "dash"; view.controller = "all"; render(); }); await sleep(200);
const d1 = await ev(() => ({ my: !!document.getElementById("btnMyJobs"), n: document.querySelectorAll(".open-project").length }));
ok("E17 dashboard shows project + My jobs filter", d1.n >= 1 && d1.my, JSON.stringify(d1));
await ev(() => { view.controller = "Nobody"; render(); });
const d2 = await ev(() => document.getElementById("noProjects")?.innerText || "");
ok("E17 empty list explains why + reload button", /No active projects showing/.test(d2) && /filter/.test(d2), d2.replace(/\s+/g, " ").slice(0, 120));
await shot("dash");

/* layout: no horizontal overflow on key screens */
for (const [n, fn] of [["dash", () => { view.page = "dash"; view.controller = "all"; render(); }], ["event", () => openEvent("etest")], ["sample", () => openTrain(db.trains.find(t => t.trainKind === "airborne_passive").id)]]) {
  await ev(fn); await sleep(250);
  const o = await ev(() => document.documentElement.scrollWidth - window.innerWidth);
  ok("layout " + n + ": no sideways scroll", o <= 1, "overflow " + o + "px");
}
ok("no page errors", errs.length === 0, errs.slice(0, 3).join(" | "));
console.log(`== ${vp} ==\n` + results.join("\n") + `\n${results.length - fails}/${results.length} passed`);
fs.writeFileSync(`/tmp/v46-${vp}-results.txt`, results.join("\n"));
await browser.close(); server.close();
process.exit(fails ? 1 : 0);

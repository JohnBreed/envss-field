/* v48.7 tests: Linked Sample A, B, … (open item 24, John 23 Nov 2026 AWST; respirator rule 25 Nov 2026 AWST).
   Usage: ROOT=/workspace/envss-li node work/v48-6/test.mjs [pixel7|chromebook]   (default: both)
   Supabase is mocked in memory and *.supabase.co is mapped to a dead local port, so nothing reaches production.
   Fixture names are made up. */
import fs from "fs"; import path from "path";
import { serve, launch, VIEWPORTS, mockSupabase, sleep, SESSION } from "./harness.mjs";
const OUT = process.env.OUT || "/workspace/item24-shots"; fs.mkdirSync(OUT, { recursive: true });
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail == null ? "" : String(detail) }); console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail && !ok ? " — " + String(detail).slice(0, 500) : "")); }
const PF = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth", year: "numeric", month: "2-digit", day: "2-digit" });
const TODAY = PF.format(new Date());
const P = (id, n, extra) => Object.assign({ id, eventId: "eL", trainKind: "airborne_personal", sampleNo: n, pouch: String(n), contaminantId: "INH", pumpSerial: "8800" + n, headId: "IESS0" + n, mediaId: "C-" + n,
  startFlow: "2.0", endFlow: "", rotameter: "R1", shiftDate: TODAY, shiftKind: "day", status: "prepped", startAt: "", endAt: "", comments: "", mode: "personal",
  person: { first: "", last: "", sex: "", dob: "", occupation: "", company: "", hours: "", daysOn: "", daysOff: "" }, rpd: {}, hpd: {}, audit: [] }, extra || {});
function fixture() {
  return {
    catalogs: { contaminants: [{ id: "INH", name: "Inhalable dust", code: "INH", kind: "airborne", headHint: "IESS", flowTolPct: 10, defaultFlow: "2.0" }, { id: "NOISE", name: "Noise dose", code: "NOISE", kind: "noise" }],
      pumps: [], fleetPumps: [], heads: [], dosimeters: [], occupations: [], respirators: [], hpds: [] },
    projects: [{ id: "p486", number: "0019486", name: "v48.6 linked samples test", source: "field", site: "Test site" }],
    events: [{ id: "eL", projectId: "p486", code: "0019486-001", type: "hygiene", date: TODAY, stage: "planned", audit: [] }],
    trains: [
      P("s1", 1), P("s2", 2), P("s3", 3), P("s4", 4), P("s5", 5), P("s6", 6),
      P("s7", 7, { trainKind: "airborne_static", mode: "static", location: "Crusher west" }),
      { id: "s8", eventId: "eL", trainKind: "blank", sampleNo: 8, pouch: "8", contaminantId: "INH", mediaId: "C-8", status: "field_blank", shiftDate: TODAY, audit: [] },
      P("s9", 9, { personTag: "ptLee", person: { first: "Lee", last: "Other", occupation: "Fitter", company: "OtherCo", sex: "male", dob: "1980-01-02", dobD: "02", dobM: "01", dobY: "1980" } }),
      P("s10", 10, { status: "running", startAt: new Date(Date.now() - 3600e3).toISOString() })
    ], deletions: [], hires: [], _savedAt: new Date(Date.now() + 60000).toISOString()
  };
}
const { server, base: url } = await serve();
const browser = await launch(["--host-resolver-rules=MAP *.supabase.co 127.0.0.1:9"]);
const ext = [];
async function boot(vp) {
  const page = await browser.newPage(); page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  page.on("console", m => { if (m.type() === "warning" && /v48\.6/.test(m.text())) page.errs.push(m.text()); });
  await page.setViewport(VIEWPORTS[vp].viewport); await page.setUserAgent(VIEWPORTS[vp].ua);
  await page.setRequestInterception(true); const store = {}; page.mlog = mockSupabase(page, store, {});
  page.on("request", r => { const u = r.url(); if (!u.startsWith(url) && !u.startsWith("data:") && !/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com|\.supabase\.co\//.test(u)) ext.push(vp + " " + r.method() + " " + u.split("?")[0]); });
  page.dialogs = []; page.on("dialog", async d => { page.dialogs.push(d.message()); await d.accept(); });
  await page.goto(url + "/field.html", { waitUntil: "domcontentloaded" }); await page.evaluate(SESSION);
  const fx = fixture(); await page.evaluate(d => { localStorage.setItem("envss-field-next-v32", JSON.stringify(d)); }, fx);
  await page.reload({ waitUntil: "networkidle0" }); await sleep(800);
  await page.evaluate(d => { db.projects = d.projects; db.events = d.events; db.trains = JSON.parse(JSON.stringify(d.trains)); db.catalogs = Object.assign(db.catalogs || {}, d.catalogs); persist(); }, fx);
  await sleep(200); return page;
}
const T = (page, id) => page.evaluate(i => JSON.parse(JSON.stringify(db.trains.find(x => x.id === i))), id);
const noSync = o => { const c = Object.assign({}, o); delete c.updatedAt; return JSON.stringify(c); };   /* updatedAt = sync bookkeeping (scanDirty), not a data change */
const open = async (page, id) => { await page.evaluate(i => openTrain(i), id); await sleep(250); };
const blurOut = async page => { await page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); }); await sleep(200); };
const tap = async (page, sel) => { await page.evaluate(q => document.querySelector(q).scrollIntoView({ block: "center" }), sel); await sleep(80); await page.click(sel); await sleep(250); };
const modal = page => page.evaluate(() => { const m = document.getElementById("v486Modal"); return m ? { q: m.querySelector("#v486Q").textContent, skip: (m.querySelector("#v486Skip") || {}).textContent || "", ch: (m.querySelector("#v486Changes") || {}).textContent || "" } : null; });

async function run(vp) {
  const shot = (page, n, full = true) => page.screenshot({ path: path.join(OUT, `${vp}-${n}.png`), fullPage: full });
  const page = await boot(vp);
  check(`[${vp}] app is v48.7`, await page.evaluate(() => APP_VERSION === "48.7" && document.getElementById("appVersion").textContent === "v48.7" && document.title === "ENVSS Field v48.7"));
  const lee0 = noSync(await T(page, "s9"));

  /* 1. no name, not started -> link box (B9 name box hidden) */
  await open(page, "s1");
  const box = await page.evaluate(() => ({ link: !!document.getElementById("linkBox"), alloc: !!document.getElementById("allocBox"), btn: (document.getElementById("btnLink") || {}).textContent || "",
    help: (document.getElementById("linkList") || {}).textContent || "" }));
  check(`[${vp}] unnamed personal sample shows 'Link samples' (next letter A), no name needed`, box.link && !box.alloc && /Link samples/.test(box.btn) && /Linked Sample A/.test(box.help), JSON.stringify(box));
  await page.click("#btnLink"); await sleep(150);
  const offered = await page.evaluate(() => [...document.querySelectorAll("[data-link]")].map(i => i.dataset.link));
  check(`[${vp}] picker offers only unnamed, not-started personal samples (no static s7, blank s8, other person s9, running s10)`, JSON.stringify(offered) === JSON.stringify(["s2", "s3", "s4", "s5", "s6"]), JSON.stringify(offered));
  await page.evaluate(() => { document.querySelector('[data-link="s2"]').checked = true; document.querySelector('[data-link="s3"]').checked = true; });
  await page.evaluate(() => document.getElementById("linkBox").scrollIntoView({ block: "center" }));
  await shot(page, "01-link-picker", false);
  await page.click("#btnLinkSelect"); await sleep(150);
  const linkQ = await page.evaluate(() => (document.getElementById("v486Q") || {}).textContent || "");
  check(`[${vp}] confirm reads 'Link these samples as Linked Sample A?'`, linkQ === "Link these samples as Linked Sample A?", linkQ);
  await page.click("#v486Yes"); await sleep(300);
  let a = await page.evaluate(() => ["s1", "s2", "s3"].map(i => { const x = db.trains.find(y => y.id === i); return [x.linkLabel, x.personTag]; }));
  check(`[${vp}] link 3 unnamed samples -> all 'Linked Sample A' with one shared person tag`, a.every(r => r[0] === "A") && new Set(a.map(r => r[1])).size === 1 && !!a[0][1], JSON.stringify(a));
  const chip = await page.evaluate(() => (document.getElementById("v486Label") || {}).textContent || "");
  check(`[${vp}] sample screen shows label chip`, chip === "Linked Sample A · no name yet · with samples 2, 3", chip);
  await page.evaluate(() => window.scrollTo(0, 0)); await shot(page, "02-sample-linked-A");

  /* 2. second group -> B */
  await open(page, "s4"); await page.click("#btnLink"); await sleep(100);
  await page.evaluate(() => { document.querySelector('[data-link="s5"]').checked = true; });
  const off2 = await page.evaluate(() => [...document.querySelectorAll("[data-link]")].map(i => i.dataset.link));
  check(`[${vp}] group A members are no longer offered to another group`, JSON.stringify(off2) === JSON.stringify(["s5", "s6"]), JSON.stringify(off2));
  await page.click("#btnLinkSelect"); await sleep(100); await page.click("#v486Yes"); await sleep(300);
  a = await page.evaluate(() => ["s4", "s5"].map(i => db.trains.find(y => y.id === i).linkLabel));
  check(`[${vp}] second group -> 'Linked Sample B'`, a.join() === "B,B", a.join());
  /* event list tags */
  await page.evaluate(() => openEvent("eL")); await sleep(300);
  const tags = await page.evaluate(() => [...document.querySelectorAll("#app .train")].map(r => { const m = /openTrain\('([^']+)'\)/.exec(r.getAttribute("onclick") || ""); return [m && m[1], (r.querySelector(".v486-tag") || {}).textContent || ""]; }).filter(r => r[1]));
  check(`[${vp}] sample list shows 'Linked Sample A/B' tags on the 5 linked rows only`, JSON.stringify(tags) === JSON.stringify([["s1", "Linked Sample A · no name yet"], ["s2", "Linked Sample A · no name yet"], ["s3", "Linked Sample A · no name yet"], ["s4", "Linked Sample B · no name yet"], ["s5", "Linked Sample B · no name yet"]]), JSON.stringify(tags));
  await shot(page, "03-event-list-A-B");

  /* 3. static / blank: no link box */
  await open(page, "s7"); const stat = await page.evaluate(() => !!document.getElementById("linkBox"));
  await open(page, "s8"); const blank = await page.evaluate(() => !!document.getElementById("linkBox"));
  check(`[${vp}] static and field blank samples get no link box`, !stat && !blank, JSON.stringify({ stat, blank }));

  /* 4. reload persists */
  await page.evaluate(() => { const x = db.trains.find(y => y.id === "s3"); x.status = "running"; x.startAt = new Date().toISOString(); x.audit.push({ at: x.startAt, action: "START pressed" }); persist(); });   /* s3 started (START pressed) */
  await sleep(400);
  await page.reload({ waitUntil: "networkidle0" }); await sleep(900);
  a = await page.evaluate(() => db.trains.filter(x => x.linkLabel).map(x => x.id + ":" + x.linkLabel).join(","));
  check(`[${vp}] reload keeps the labels`, a === "s1:A,s2:A,s3:A,s4:B,s5:B", a);

  /* 5. name on one -> warning lists the others -> OK fills; started sample not overwritten */
  await open(page, "s1");
  await page.type("#first", "Sarah"); await page.click("#last"); await sleep(250);
  const noEarly = await modal(page);
  check(`[${vp}] no prompt while still typing in the person fields (first -> last is one prompt)`, !noEarly, JSON.stringify(noEarly));
  await page.type("#last", "Testone"); await page.type("#company", "Acme Mining");
  await blurOut(page); await sleep(200);
  let m = await modal(page);
  check(`[${vp}] warning: 'This will also fill Linked Sample A: sample 2. OK?' (s3 started is left out)`, m && m.q === "This will also fill Linked Sample A: sample 2. OK?" && /Sample 3 \(started\)/.test(m.skip) && /First name: \(empty\) → Sarah/.test(m.ch) && /Last name/.test(m.ch) && /Company/.test(m.ch), JSON.stringify(m));
  await shot(page, "04-fill-warning", false);
  await page.click("#v486Yes"); await sleep(400);
  const s2 = await T(page, "s2"), s3 = await T(page, "s3");
  check(`[${vp}] OK fills sample 2 (name + company) with an audit entry`, s2.person.first === "Sarah" && s2.person.last === "Testone" && s2.person.company === "Acme Mining" && s2.audit.some(e => /confirmed/.test(e.detail) && e.field === "person.first"), JSON.stringify([s2.person, s2.audit.slice(-3)]));
  check(`[${vp}] started sample 3 not overwritten`, !s3.person.first && !s3.person.last && !s3.person.company, JSON.stringify(s3.person));
  const named = await page.evaluate(() => ({ chip: (document.getElementById("v486Label") || {}).textContent || "", alloc: !!document.getElementById("allocBox"), link: !!document.getElementById("linkBox"), also: (document.getElementById("allocList") || {}).textContent || "" }));
  check(`[${vp}] once named: label stays as secondary text and the existing name allocation box takes over`, named.chip.startsWith("Linked Sample A · Sarah Testone") && named.alloc && !named.link && /Sample 2/.test(named.also), JSON.stringify(named));
  await page.evaluate(() => window.scrollTo(0, 0)); await shot(page, "05-named-A-alloc-box");

  /* 5b. respirator: asks once when the answer is complete; OK fills the group INCLUDING the running sample 3 */
  await tap(page, '[data-yn="rpd"][data-val="yes"]');
  let r0 = await modal(page);
  await page.type("#rpdModel", "3M 6500"); await blurOut(page);
  await tap(page, '[data-rq="shaven"][data-val="yes"]');
  const r1 = await modal(page);
  check(`[${vp}] respirator: no prompt while the answer is still incomplete (worn / model / shaven)`, !r0 && !r1, JSON.stringify([r0, r1]));
  await tap(page, '[data-rq="fit"][data-val="yes"]'); await sleep(200);
  m = await modal(page);
  check(`[${vp}] respirator: one prompt 'This will also fill Linked Sample A: samples 2, 3. OK?' listing all 4 answers (running sample 3 included)`, m && m.q === "This will also fill Linked Sample A: samples 2, 3. OK?" && /Respirator worn\?: \(empty\) → yes/.test(m.ch) && /Respirator brand \/ model: \(empty\) → 3M 6500/.test(m.ch) && /Clean-shaven/.test(m.ch) && /Fit-tested/.test(m.ch) && !m.skip, JSON.stringify(m));
  await shot(page, "05b-respirator-warning", false);
  await page.click("#v486Yes"); await sleep(400);
  let r2 = await T(page, "s2"), r3 = await T(page, "s3");
  check(`[${vp}] respirator OK: filled on sample 2 and on RUNNING sample 3 (worn, model, shaven, fit) with audit entries`, [r2, r3].every(x => x.rpdAsked === "yes" && x.rpd.worn === "yes" && x.rpd.model === "3M 6500" && x.rpd.shaven === "yes" && x.rpd.fit === "yes" && x.audit.filter(e => /confirmed/.test(e.detail) && /^rpd/.test(e.field)).length === 4), JSON.stringify([r2.rpd, r2.rpdAsked, r3.rpd, r3.rpdAsked]));
  check(`[${vp}] running sample 3 still has no name / company after the respirator fill`, !r3.person.first && !r3.person.company && r3.status === "running", JSON.stringify(r3.person));
  /* held prompt is released when the sample is left */
  await open(page, "s2"); await tap(page, '[data-rq="fit"][data-val="yes"]');   /* tap again = clear: answer incomplete again */
  const held = await modal(page);
  await page.evaluate(() => leaveSample("s2", "eL")); await sleep(400);
  m = await modal(page);
  check(`[${vp}] respirator: incomplete change is held, then asked once when the sample is left`, !held && m && m.q === "This will also fill Linked Sample A: samples 1, 3. OK?" && /Fit-tested\?: yes → \(empty\)/.test(m.ch), JSON.stringify([held, m]));
  await page.click("#v486No"); await sleep(300);
  r2 = await T(page, "s2"); const r1b = await T(page, "s1"); r3 = await T(page, "s3");
  check(`[${vp}] respirator Cancel: only sample 2 changed (1 and 3 keep fit-tested yes)`, !r2.rpd.fit && r1b.rpd.fit === "yes" && r3.rpd.fit === "yes", JSON.stringify([r2.rpd.fit, r1b.rpd.fit, r3.rpd.fit]));

  /* 6. Cancel changes only this sample */
  await open(page, "s4"); await page.type("#company", "Cancel Co"); await blurOut(page); await sleep(200);
  m = await modal(page);
  check(`[${vp}] group B prompt lists sample 5`, m && m.q === "This will also fill Linked Sample B: sample 5. OK?", JSON.stringify(m));
  await page.click("#v486No"); await sleep(300);
  let s4 = await T(page, "s4"), s5 = await T(page, "s5");
  check(`[${vp}] Cancel: sample 4 changed, sample 5 untouched, decline audited`, s4.person.company === "Cancel Co" && !s5.person.company && s4.audit.some(e => e.action === "Fill across declined"), JSON.stringify([s4.person.company, s5.person.company]));

  /* 7. sample of another person in the group is not touched */
  await page.evaluate(() => { const x = db.trains.find(y => y.id === "s5"); x.person.first = "Lee"; x.person.last = "Different"; persist(); });   /* e.g. a legacy / other-device edit */
  await open(page, "s4");
  const dbg = await page.evaluate(() => ({ btn: !!document.getElementById("btnLink"), dis: (document.getElementById("btnLink") || {}).disabled, hidden: (document.getElementById("linkPick") || {}).hidden, opts: [...document.querySelectorAll("[data-link]")].map(i => i.dataset.link) }));
  await page.evaluate(() => document.getElementById("btnLink").scrollIntoView({ block: "center" })); await sleep(100);
  const hit = await page.evaluate(() => { const r = document.getElementById("btnLink").getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return (e && (e.id || e.className || e.tagName)) + " " + Math.round(r.top) + "/" + innerHeight; });
  await page.click("#btnLink"); await sleep(100);
  const dbg2 = await page.evaluate(() => ({ train: view.trainId, page: view.page, hidden: (document.getElementById("linkPick") || {}).hidden, opts: [...document.querySelectorAll("[data-link]")].map(i => i.dataset.link), modal: !!document.querySelector(".v46-modal") }));
  check(`[${vp}] group B link box offers sample 6`, dbg2.opts.includes("s6") && dbg2.hidden === false, JSON.stringify([dbg, dbg2, hit]));
  await page.evaluate(() => { document.querySelector('[data-link="s6"]').checked = true; });
  await page.click("#btnLinkSelect"); await sleep(100);
  const addQ = await page.evaluate(() => (document.getElementById("v486Q") || {}).textContent || "");
  await page.click("#v486Yes"); await sleep(300);
  check(`[${vp}] adding to an existing group keeps its letter (s6 -> B)`, addQ === "Add these samples to Linked Sample B?" && (await T(page, "s6")).linkLabel === "B", addQ);
  await open(page, "s4"); await page.type("#first", "Ben"); await page.type("#last", "Testtwo"); await page.type("#dobD", "05"); await page.type("#dobM", "06"); await page.type("#dobY", "1990");
  await blurOut(page); await sleep(200);
  m = await modal(page);
  check(`[${vp}] prompt fills sample 6 only; sample 5 (another person) listed as not changed`, m && m.q === "This will also fill Linked Sample B: sample 6. OK?" && /Sample 5 \(on Lee Different\)/.test(m.skip), JSON.stringify(m));
  await shot(page, "06-other-person-skipped", false);
  await page.click("#v486Yes"); await sleep(400);
  s5 = await T(page, "s5"); const s6 = await T(page, "s6");
  check(`[${vp}] sample 6 filled (name + DOB); sample 5 keeps Lee Different, no DOB`, s6.person.first === "Ben" && s6.person.dob === "1990-06-05" && s6.person.dobY === "1990" && s5.person.first === "Lee" && s5.person.last === "Different" && !s5.person.dob, JSON.stringify([s6.person, s5.person]));
  const lee1 = noSync(await T(page, "s9"));
  check(`[${vp}] separately allocated person (s9) never touched`, lee1 === lee0, lee0 + "\n=>\n" + lee1);

  /* 7b. respirator in group B: another person's sample and a rejected sample are never filled */
  await page.evaluate(() => { const x = db.trains.find(y => y.id === "s6"); x.status = "running"; x.startAt = new Date().toISOString(); persist(); });
  await open(page, "s4"); await tap(page, '[data-yn="rpd"][data-val="no"]'); await sleep(200);
  m = await modal(page);
  check(`[${vp}] respirator 'No' on sample 4: prompt fills running sample 6 only; sample 5 (Lee Different) not changed`, m && m.q === "This will also fill Linked Sample B: sample 6. OK?" && /Sample 5 \(on Lee Different\)/.test(m.skip), JSON.stringify(m));
  await page.click("#v486Yes"); await sleep(400);
  let b5 = await T(page, "s5"), b6 = await T(page, "s6");
  check(`[${vp}] respirator OK: sample 6 (running) = No; sample 5 untouched`, b6.rpdAsked === "no" && b6.rpd.worn === "no" && !b5.rpdAsked, JSON.stringify([b6.rpdAsked, b5.rpdAsked]));
  await page.evaluate(() => { const x = db.trains.find(y => y.id === "s6"); x.status = "rejected"; x.rejectAsked = "yes"; x.endAt = new Date().toISOString(); persist(); });
  await open(page, "s4"); await tap(page, '[data-yn="rpd"][data-val="unknown"]'); await sleep(300);
  m = await modal(page);
  b6 = await T(page, "s6"); b5 = await T(page, "s5"); const b4 = await T(page, "s4");
  check(`[${vp}] rejected sample 6 and other-person sample 5 never filled (no prompt; 4 = unknown only)`, !m && b4.rpdAsked === "unknown" && b6.rpdAsked === "no" && !b5.rpdAsked, JSON.stringify([m, b4.rpdAsked, b6.rpdAsked, b5.rpdAsked]));

  /* 8. reload persists everything */
  await sleep(300); await page.reload({ waitUntil: "networkidle0" }); await sleep(900);
  const fin = await page.evaluate(() => db.trains.map(x => [x.id, x.linkLabel || "", (x.person || {}).first || "", (x.person || {}).last || ""].join(":")).join(" "));
  const finR = await page.evaluate(() => db.trains.filter(x => x.linkLabel).map(x => x.id + ":" + (x.rpdAsked || "-")).join(" "));
  check(`[${vp}] reload keeps labels and filled names`, fin === "s1:A:Sarah:Testone s2:A:Sarah:Testone s3:A:: s4:B:Ben:Testtwo s5:B:Lee:Different s6:B:Ben:Testtwo s7::: s8::: s9::Lee:Other s10:::", fin);
  check(`[${vp}] reload keeps respirator answers`, finR === "s1:yes s2:yes s3:yes s4:unknown s5:- s6:no", finR);
  await page.evaluate(() => openEvent("eL")); await sleep(300); await shot(page, "07-event-list-after-reload");
  check(`[${vp}] no page errors`, !page.errs.length, page.errs.join(" | "));
  check(`[${vp}] no native alerts`, !page.dialogs.length, page.dialogs.join(" | "));
  await page.close();
}
const vps = process.argv[2] ? [process.argv[2]] : ["pixel7", "chromebook"];
for (const vp of vps) { try { await run(vp); } catch (e) { check(`[${vp}] run completed`, false, e.stack); } }
check("no request left the box except the CDN libraries; every Supabase call was answered by the in-memory mock (and *.supabase.co is mapped to a dead local port)", !ext.length, ext.join("\n"));
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "test-results.json"), JSON.stringify(results, null, 1));
console.log(results.filter(r => r.ok).length + "/" + results.length + " passed");
await browser.close(); server.close();
process.exit(results.every(r => r.ok) ? 0 : 1);

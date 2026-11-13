/* v48.2 AFM field-app checks. Mock Supabase only (no production writes).
   Usage: ROOT=/workspace/afm-build node work/v49/test.mjs <chromebook|pixel7> */
process.env.ROOT = process.env.ROOT || "/workspace/afm-build";
import { serve, launch, VIEWPORTS, mockSupabase, sleep, SESSION } from "../v46/harness.mjs";
import fs from "fs";
import path from "path";
const vp = process.argv[2] || "chromebook";
const root = process.env.ROOT;
const shotDir = path.join(root, "work/v48-4/regress-shots/v49");
fs.mkdirSync(shotDir, { recursive: true });
const fixture = JSON.parse(fs.readFileSync(path.join(root, "work/v49/fixtures/afm-upgrade-v34.json"), "utf8"));

const { server, base } = await serve();
const browser = await launch(["--host-resolver-rules=MAP *.supabase.co 127.0.0.1:9"]);
const results = []; let fails = 0;
const ok = (name, cond, extra) => {
  const line = (cond ? "PASS " : "FAIL ") + name + (extra ? " — " + extra : "");
  console.error(line); results.push(line); if (!cond) fails++;
};
const page = await browser.newPage();
await page.setViewport(VIEWPORTS[vp].viewport);
await page.setUserAgent(VIEWPORTS[vp].ua);
await page.setRequestInterception(true);
const store = { envss_projects: new Map() };
mockSupabase(page, store, {});
const errs = []; page.on("pageerror", e => errs.push(String(e)));
const dialogs = []; let dialogAnswer = true;
page.on("dialog", async d => { dialogs.push(d.type() + ": " + d.message()); dialogAnswer ? await d.accept() : await d.dismiss(); });

await page.goto(base + "/field.html", { waitUntil: "domcontentloaded" });
await page.evaluate(SESSION);
await page.reload({ waitUntil: "networkidle0" });
await sleep(1500);

const ev = (fn, ...a) => page.evaluate(fn, ...a);
const shot = n => page.screenshot({ path: path.join(shotDir, `${vp}-${n}.png`), fullPage: true });

/* 0. boot + storage names unchanged */
const boot = await ev(() => ({
  v: (document.getElementById("appVersion") || {}).textContent,
  key: typeof KEY === "string" ? KEY : "",
  legacy: typeof LEGACY_KEY === "string" ? LEGACY_KEY : "",
  fibre: typeof isFibreTrain === "function" && typeof cowlValid === "function"
}));
ok("boot: app v48.4", boot.v === "v48.4", boot.v);
ok("boot: IndexedDB/local key unchanged (envss-field-next-v32)", boot.key === "envss-field-next-v32", boot.key);
ok("boot: legacy key unchanged (envss-field-v04)", boot.legacy === "envss-field-v04", boot.legacy);
ok("boot: AFM helpers present", boot.fibre);

const names = await ev(() => {
  const src = document.documentElement.innerHTML;
  return {
    photos: src.includes('envss-field-photos'),
    drive: src.includes('envss-field-drive') && src.includes('field-exports'),
    v46: src.includes('envss-field-v46')
  };
});
ok("storage: photo IndexedDB name unchanged", names.photos);
ok("storage: Drive copy IndexedDB / bucket names unchanged", names.drive);
ok("storage: v46 kv IndexedDB name unchanged", names.v46);

/* 1. cowlDigits / cowlValid (pure) */
const cowls = await ev(() => {
  const cases = [
    ["11850", "11850", true],
    ["01850", "01850", true],
    ["ENVSS11850", "11850", true],
    ["envss01850", "01850", true],
    ["ESS12574", "12574", true],
    ["ENVSS-01850", "01850", true],
    ["ENVSS 12574", "12574", true],
    ["12 574", "12574", true],
    ["1257", "1257", false],
    ["125744", "125744", false],
    ["", "", false],
    ["ENVSS", "", false]
  ];
  return cases.map(([inp, want, valid]) => {
    const d = cowlDigits(inp);
    return { inp, d, want, validGot: cowlValid(inp), valid, display: cowlDisplay({ cowlNo: inp }) };
  });
});
for (const c of cowls) {
  ok("cowlDigits(" + JSON.stringify(c.inp) + ") = " + c.want, c.d === c.want, "got " + c.d);
  ok("cowlValid(" + JSON.stringify(c.inp) + ")", c.validGot === c.valid, String(c.validGot));
  ok("cowlDisplay has no prefix for " + JSON.stringify(c.inp), !/^ENVSS/i.test(c.display) && !/^ESS/i.test(c.display) && c.display === c.d, c.display);
}

/* 2. upgrade fixture: load legacy records, open without mutating mediaId */
await ev(fix => {
  if (!db.projects.some(p => p.id === fix.project.id)) db.projects.push(fix.project);
  if (!db.events.some(e => e.id === fix.event.id)) db.events.push(fix.event);
  fix.trains.forEach(t => { if (!db.trains.some(x => x.id === t.id)) db.trains.push(JSON.parse(JSON.stringify(t))); });
  save();
}, fixture);
await ev(() => openTrain("t-afm-blank"));
await sleep(400);
const upgBlank = await ev(() => {
  const t = db.trains.find(x => x.id === "t-afm-blank");
  const h2 = (document.querySelector(".wrap h2.brand-type") || document.querySelector(".wrap h2") || {}).textContent || "";
  const envssLabel = [...document.querySelectorAll("span, p, label, .help")].some(el => el.id !== "cowlHelp" && /Stored and printed as ENVSS/.test(el.textContent || ""));
  const prefixSpan = [...document.querySelectorAll("span")].some(el => el.textContent.trim() === "ENVSS" && el.className.includes("muted"));
  return {
    displayNo: displayNo(t),
    heading: h2,
    input: (document.getElementById("cowlNo") || {}).value,
    mediaId: t.mediaId,
    cowlNo: t.cowlNo,
    prefixSpan,
    envssLabel,
    volNa: [...document.querySelectorAll("input")].some(i => i.disabled && i.value === "N/A"),
    du: !!document.getElementById("duSerial")
  };
});
ok("upgrade blank: displayNo is 0, not Sample 0 / A001", upgBlank.displayNo === "0", upgBlank.displayNo);
ok("upgrade blank: heading shows 0 and Field blank", /0/.test(upgBlank.heading) && /Field blank/i.test(upgBlank.heading), upgBlank.heading);
ok("upgrade blank: cowl input keeps leading zero 01850", upgBlank.input === "01850", upgBlank.input);
ok("upgrade blank: opening does not rewrite mediaId prefix", upgBlank.mediaId === "ENVSS01850", upgBlank.mediaId);
ok("upgrade blank: cowlNo stays 01850", upgBlank.cowlNo === "01850", upgBlank.cowlNo);
ok("upgrade blank: no ENVSS prefix label beside the box", !upgBlank.prefixSpan);
ok("upgrade blank: pump/flow shown as N/A", upgBlank.volNa);
ok("upgrade blank: DU serial field present", upgBlank.du);
await shot("upgrade-blank");

await ev(() => openTrain("t-afm-pump1"));
await sleep(400);
const upgPump = await ev(() => {
  const t = db.trains.find(x => x.id === "t-afm-pump1");
  const h2 = (document.querySelector(".wrap h2.brand-type") || document.querySelector(".wrap h2") || {}).textContent || "";
  return {
    displayNo: displayNo(t),
    heading: h2,
    input: (document.getElementById("cowlNo") || {}).value,
    mediaId: t.mediaId,
    vol: volumeLitres(t),
    avg: (num(t.startFlow) + num(t.endFlow)) / 2,
    flow: flowCheck(t),
    volWarn: !!(document.getElementById("volWarn")),
    mins: runtimeMinutes(t)
  };
});
ok("upgrade pump: displayNo is Pump 1, not Sample 1 / A001", upgPump.displayNo === "Pump 1", upgPump.displayNo);
ok("upgrade pump: heading is Pump 1", /Pump 1/.test(upgPump.heading), upgPump.heading);
ok("upgrade pump: cowl input 12574, mediaId not rewritten", upgPump.input === "12574" && upgPump.mediaId === "ENVSS12574", JSON.stringify({ input: upgPump.input, mediaId: upgPump.mediaId }));
ok("upgrade pump: volume is 712 L (356 min × 2.0)", upgPump.vol === 712, String(upgPump.vol) + " mins=" + upgPump.mins);
ok("upgrade pump: no short-volume warning at 712 L", !upgPump.volWarn);
ok("upgrade pump: flow ±10% ok at 2.0/2.0", upgPump.flow.ok === true && upgPump.flow.tol === 10, JSON.stringify(upgPump.flow));
await shot("upgrade-pump");

/* 3. new AFM event: auto blank 0, add Pump 1 / Pump 2, confirm dialog */
await ev(() => {
  if (!db.projects.some(p => p.id === "p-afm-new")) db.projects.push({ id: "p-afm-new", number: "0019400", name: "AFM new event fixture", status: "Active", active: true });
  const evn = { id: "e-afm-new", projectId: "p-afm-new", type: "fibre", stage: "planned", date: "2026-11-12",
    code: fibreEventCode({ number: "0019400" }, "2026-11-12", "001"), multiDay: false, notes: "", uploadReady: false,
    operators: [], protocol: "control", taskDesc: "New", tat: "next_0700", rotameter: "4430" };
  db.events.push(evn);
  db.trains.push(fibreTrainRecord(evn, 0, "blank"));
  save();
});
dialogs.length = 0;
const id1 = await ev(() => { addTrain("e-afm-new", "fibre_static"); return view.trainId; });
await sleep(200);
const id2 = await ev(() => { addTrain("e-afm-new", "fibre_static"); return view.trainId; });
await sleep(200);
const created = await ev((a, b) => {
  const ts = trainsOf("e-afm-new").sort((x, y) => sampleNoOf(x) - sampleNoOf(y));
  return {
    nos: ts.map(t => ({ no: sampleNoOf(t), kind: t.trainKind, label: displayNo(t), startFlow: t.startFlow })),
    proto: (db.events.find(e => e.id === "e-afm-new") || {}).code,
    a: displayNo(db.trains.find(t => t.id === a)),
    b: displayNo(db.trains.find(t => t.id === b)),
    confirm: true
  };
}, id1, id2);
ok("new event: field blank is 0, then Pump 1 and Pump 2",
  JSON.stringify(created.nos.map(x => x.label)) === JSON.stringify(["0", "Pump 1", "Pump 2"]),
  JSON.stringify(created.nos));
ok("new event: only one field blank (sample 0)", created.nos.filter(x => x.kind === "blank").length === 1 && created.nos[0].no === 0);
ok("new event: pump samples default start flow 2.0", created.nos.filter(x => x.kind !== "blank").every(x => x.startFlow === "2.0"));
ok("new event: addTrain asked for confirmation", dialogs.some(d => /add a new sample/i.test(d)), dialogs.join(" | "));
ok("new event: code stays ENVSS-HYG-AFM-… (reference format unchanged)", /^ENVSS-HYG-AFM-0019400-001-20261112$/.test(created.proto), created.proto);

/* 4. duplicate cowl + 5-digit validation on the new event */
await ev(id => {
  const t = db.trains.find(x => x.id === id);
  t.cowlNo = "01850"; t.mediaId = "01850";
  const blank = trainsOf("e-afm-new").find(x => x.trainKind === "blank");
  blank.cowlNo = "01850"; blank.mediaId = "01850";
  save();
  openTrain(id);
}, id1);
await sleep(300);
const dup = await ev(id => {
  const t = db.trains.find(x => x.id === id);
  return {
    gaps: startGaps(t),
    dups: cowlDuplicates(t).map(x => displayNo(x)),
    warn: (document.getElementById("cowlDup") || {}).style.display !== "none",
    warnText: (document.getElementById("cowlDup") || {}).textContent || ""
  };
}, id1);
ok("duplicate cowl: startGaps blocks with already-used message", dup.gaps.some(g => /already used/i.test(g)), JSON.stringify(dup.gaps));
ok("duplicate cowl: listed against 0", dup.dups.includes("0"), JSON.stringify(dup.dups));
ok("duplicate cowl: on-screen warning", dup.warn && /already on 0/i.test(dup.warnText), dup.warnText);
await shot("cowl-duplicate");

await ev(id => { const t = db.trains.find(x => x.id === id); t.cowlNo = "1257"; t.mediaId = "1257"; openTrain(id); }, id1);
await sleep(250);
const short = await ev(id => {
  const t = db.trains.find(x => x.id === id);
  return { gaps: startGaps(t), warn: (document.getElementById("cowlWarn") || {}).style.display !== "none", valid: cowlValid(t.cowlNo) };
}, id1);
ok("short cowl (4 digits) is invalid and shown", !short.valid && short.warn && short.gaps.some(g => /5 digits/i.test(g)), JSON.stringify(short));

await ev(id => { const t = db.trains.find(x => x.id === id); t.cowlNo = "01257"; t.mediaId = "01257"; openTrain(id); }, id1);
await sleep(250);
const led = await ev(() => ({ input: (document.getElementById("cowlNo") || {}).value, valid: cowlValid("01257") }));
ok("leading zero 01257 accepted as five-digit text", led.valid && led.input === "01257", JSON.stringify(led));

/* 5. volume warning ~333 L (warn only) and flow ±10% */
await ev(id => {
  const t = db.trains.find(x => x.id === id);
  t.cowlNo = "55551"; t.mediaId = "55551"; t.pumpSerial = "191560"; t.location = "North fence";
  t.startFlow = "2.0"; t.endFlow = "2.0";
  t.startAt = "2026-11-12T07:00:00+08:00";
  t.endAt = "2026-11-12T09:46:00+08:00"; /* 166 min × 2.0 = 332 L */
  t.status = "ended";
  openTrain(id);
}, id1);
await sleep(300);
const volLo = await ev(id => {
  const t = db.trains.find(x => x.id === id);
  return { vol: volumeLitres(t), mins: runtimeMinutes(t), warn: !!(document.getElementById("volWarn")), gaps: startGaps(t) };
}, id1);
ok("volume 332 L (< 333) warns", volLo.vol === 332 && volLo.warn, JSON.stringify(volLo));
ok("short volume does not block startGaps (warning only)", !volLo.gaps.some(g => /volume/i.test(g)), JSON.stringify(volLo.gaps));
const volNote = await ev(() => {
  const el = document.getElementById("volWarn");
  const rec = db.trains.find(x => x.id === view.trainId) || {};
  const audit = (rec.audit || []).map(a => [a.action, a.detail].join(" "));
  return { text: (el && el.textContent) || "", style: (el && el.getAttribute("style")) || "", audit };
});
ok("short volume is a soft note, never a reject", /soft note/i.test(volNote.text) && /not a reject/i.test(volNote.text), volNote.text);
ok("short volume has no danger styling and no audit reject line",
  !/danger/i.test(volNote.style) && !volNote.audit.some(a => /333|volume/i.test(a) && /reject/i.test(a)),
  JSON.stringify(volNote));
await shot("volume-warn");

await ev(id => {
  const t = db.trains.find(x => x.id === id);
  t.endAt = "2026-11-12T09:46:30+08:00"; /* 166.5 min × 2 = 333 L */
  openTrain(id);
}, id1);
await sleep(250);
const volOk = await ev(id => ({ vol: volumeLitres(db.trains.find(x => x.id === id)), warn: !!(document.getElementById("volWarn")) }), id1);
ok("volume 333 L does not warn", volOk.vol === 333 && !volOk.warn, JSON.stringify(volOk));

await ev(id => {
  const t = db.trains.find(x => x.id === id);
  t.endFlow = "2.2"; t.endAt = "2026-11-12T12:00:00+08:00";
  openTrain(id);
}, id1);
await sleep(250);
const flowOk = await ev(id => flowCheck(db.trains.find(x => x.id === id)), id1);
ok("AFM flow 2.0 → 2.2 is within ±10%", flowOk.ok === true && flowOk.tol === 10, JSON.stringify(flowOk));

await ev(id => {
  const t = db.trains.find(x => x.id === id);
  t.endFlow = "2.21";
  openTrain(id);
}, id1);
await sleep(250);
const flowHi = await ev(id => {
  const t = db.trains.find(x => x.id === id);
  return { chk: flowCheck(t), shown: !!(document.getElementById("flowWarn")) };
}, id1);
ok("AFM flow 2.0 → 2.21 warns over ±10%", flowHi.chk.ok === false && flowHi.shown, JSON.stringify(flowHi.chk));
await shot("flow-warn");

/* 6. hygiene numbering and INH flow check are unchanged */
await ev(() => {
  if (!db.projects.some(p => p.id === "p-hyg")) db.projects.push({ id: "p-hyg", number: "0019500", name: "Hygiene control", status: "Active", active: true });
  db.events.push({ id: "e-hyg", projectId: "p-hyg", type: "hygiene", stage: "planned", date: "2026-11-12", code: "0019500-001", multiDay: false, notes: "", uploadReady: false, operators: [] });
  save();
});
const hid = await ev(() => { addTrain("e-hyg", "airborne_personal"); return view.trainId; });
await sleep(200);
const hyg = await ev(id => {
  const t = db.trains.find(x => x.id === id);
  t.contaminantId = "INH"; t.startFlow = "2.0"; t.endFlow = "2.2";
  const other = { id: "tmp", contaminantId: "RSP", startFlow: "2.0", endFlow: "2.2" };
  /* RSP (or missing) default tol 5% unless catalog says otherwise */
  return {
    label: displayNo(t),
    no: sampleNoOf(t),
    inh: flowCheck(t),
    other: flowCheck(other),
    headingFibre: /Pump /.test(displayNo(t))
  };
}, hid);
ok("hygiene: displayNo stays Sample N (not Pump N / A001)", hyg.label === "Sample 1", hyg.label);
ok("hygiene INH: 2.0 → 2.2 still allowed (±10%)", hyg.inh.ok === true && hyg.inh.tol === 10, JSON.stringify(hyg.inh));
ok("hygiene non-INH default tolerance is not forced to AFM rules when not fibre", hyg.other.tol === 5, JSON.stringify(hyg.other));

/* 7. reject reasons, protocol Exposure, night-shift reuse wording, time order */
await ev(id => openTrain(id), id1);
await sleep(250);
const extras = await ev(id => {
  const t = db.trains.find(x => x.id === id);
  const evn = db.events.find(e => e.id === "e-afm-new");
  const reasons = rejectList(t).map(r => r.code + ":" + r.label);
  const proto = PROTO_OPTS.map(o => o[0]);
  const tat = TAT_OPTS.map(o => o[0]);
  t.startAt = "2026-11-12T12:00:00+08:00";
  t.endAt = "2026-11-12T11:00:00+08:00";
  t.endFlow = "2.0";
  return { reasons, proto, tat, reversed: new Date(t.endAt) < new Date(t.startAt) };
}, id1);
await ev(id => openTrain(id), id1);
await sleep(250);
const timeWarn = await ev(() => !!(document.getElementById("timeOrderWarn")));
ok("reject list includes pump failed, flow fault, compromised, overload",
  ["pump_fault", "flow_fault", "compromised", "overload"].every(c => extras.reasons.some(r => r.startsWith(c + ":"))),
  extras.reasons.join(" | "));
ok("protocol options include exposure (and keep background/control/clearance)",
  ["background", "control", "clearance", "exposure"].every(x => extras.proto.includes(x)), extras.proto.join(","));
ok("turnaround options include normal 3-day (and keep same_day / next_0700 / emergency)",
  ["same_day", "next_0700", "normal_3day", "emergency"].every(x => extras.tat.includes(x)), extras.tat.join(","));
ok("stop-before-start shows a warning", extras.reversed && timeWarn);

await ev(id => {
  const nightEv = { id: "e-night", projectId: "p-afm-new", type: "hygiene", stage: "planned", date: "2026-11-11", code: "0019400-002", multiDay: false, notes: "", uploadReady: false, operators: [] };
  db.events.push(nightEv);
  db.trains.push({
    id: "t-night", eventId: "e-night", pouch: "1", sampleNo: 1, trainKind: "airborne_personal",
    pumpSerial: "191560", shiftDate: "2026-11-11", shiftKind: "night", startAt: "2026-11-11T18:00:00+08:00",
    endAt: "2026-11-12T06:00:00+08:00", status: "ended", person: {},
    audit: []
  });
  const t = db.trains.find(x => x.id === id);
  t.pumpSerial = "191560"; t.shiftKind = "day"; t.shiftDate = "2026-11-12";
  t.startAt = "2026-11-12T07:00:00+08:00"; t.endAt = "2026-11-12T12:00:00+08:00";
  openTrain(id);
}, id1);
await sleep(350);
const reuse = await ev(id => ({
  text: (document.getElementById("afmReuseWarn") || {}).textContent || "",
  hits: (typeof v49AfmPrevNight === "function") ? v49AfmPrevNight("191560", db.trains.find(x => x.id === id)).length : -1
}), id1);
ok("AFM previous-night pump shows clean-before-use warning", /previous shift/i.test(reuse.text) && /clean before use/i.test(reuse.text), reuse.text);
await shot("night-reuse");


/* 9. live irregularity checks during the day + COC block on hard duplicates */
await ev(() => {
  if (!db.projects.some(p => p.id === "p-afm-new")) db.projects.push({ id: "p-afm-new", number: "0019400", name: "AFM new event fixture", status: "Active", active: true });
  const evn = { id: "e-afm-chk", projectId: "p-afm-new", type: "fibre", stage: "planned", date: "2026-11-12",
    code: "ENVSS-HYG-AFM-0019400-CHK-20261112", multiDay: false, notes: "", uploadReady: false,
    operators: [], protocol: "control", taskDesc: "Checks", tat: "next_0700", rotameter: "4430", audit: [] };
  const blank = fibreTrainRecord(evn, 0, "blank");
  blank.cowlNo = "11001"; blank.mediaId = "11001";
  const p1 = fibreTrainRecord(evn, 1, "fibre_static");
  p1.cowlNo = "11001"; p1.mediaId = "ENVSS11001"; p1.pumpSerial = "191560"; p1.location = "North fence";
  p1.startFlow = "2.0"; p1.endFlow = "2.5"; p1.status = "running";
  p1.startAt = "2026-11-12T07:00:00+08:00"; p1.rotameter = "4430";
  p1.podioAfm = { plannedStart: "2026-11-12T07:00:00+08:00", plannedEnd: "2026-11-12T08:00:00+08:00" };
  const p2 = fibreTrainRecord(evn, 2, "fibre_static");
  p2.cowlNo = "11002"; p2.mediaId = "11002"; p2.pumpSerial = "191560"; p2.location = "South fence";
  p2.startFlow = ""; p2.status = "running"; p2.startAt = "2026-11-12T07:05:00+08:00"; p2.rotameter = "9999";
  const p4 = fibreTrainRecord(evn, 4, "fibre_static");
  p4.cowlNo = "12"; p4.mediaId = "12"; p4.pumpSerial = "88473"; p4.location = "West"; p4.startFlow = "2.0"; p4.status = "prepped"; p4.rotameter = "4430";
  const failed = fibreTrainRecord(evn, 5, "fibre_static");
  failed.cowlNo = "11005"; failed.mediaId = "11005"; failed.pumpSerial = "70001"; failed.location = "East";
  failed.startFlow = "2.0"; failed.status = "rejected"; failed.rejectCode = ""; failed.rejectReason = "";
  db.events.push(evn);
  db.trains.push(blank, p1, p2, p4, failed);
  save();
  openEvent("e-afm-chk");
});
await sleep(400);
const chkPanel = await ev(() => {
  const evn = db.events.find(e => e.id === "e-afm-chk");
  const items = (typeof afmEventChecks === "function") ? afmEventChecks(evn) : [];
  const panel = document.getElementById("afmChecksPanel");
  return {
    codes: items.map(x => x.code).sort(),
    hard: items.filter(x => x.severity === "hard").map(x => x.code).sort(),
    texts: items.map(x => x.text),
    panel: !!(panel),
    panelText: (panel && panel.textContent) || "",
    blocked: typeof afmCocBlocked === "function" ? afmCocBlocked(evn) : null
  };
});
ok("checks helper is present", chkPanel.codes.length > 0, JSON.stringify(chkPanel.codes));
ok("checks: duplicate cowl (bare 5 digits, ENVSS ignored) is a hard finding", chkPanel.hard.includes("dup_cowl") && chkPanel.texts.some(x => /Cowl 11001 is already on/i.test(x)), JSON.stringify(chkPanel.texts));
ok("checks: duplicate pump is a hard finding", chkPanel.hard.includes("dup_pump") && chkPanel.texts.some(x => /Pump 191560 is on/i.test(x)), JSON.stringify(chkPanel.texts));
ok("checks: cowl not 5 digits is flagged", chkPanel.codes.includes("cowl_digits") && chkPanel.texts.some(x => /exactly 5 digits/i.test(x) && /12/.test(x)), JSON.stringify(chkPanel.texts));
ok("checks: missing start flow is flagged", chkPanel.codes.includes("missing_start_flow"));
ok("checks: end flow outside this sample's start-flow tolerance is flagged", chkPanel.codes.includes("flow_tol"));
ok("checks: pump still running long after planned end is flagged", chkPanel.codes.includes("overrun"));
ok("checks: rotameter mismatch is flagged", chkPanel.codes.includes("rotameter"));
ok("checks: failed sample with no reason is flagged", chkPanel.codes.includes("reject_reason"));
ok("checks: out-of-sequence sample numbers (missing Pump 3) is flagged", chkPanel.codes.includes("sample_seq") && chkPanel.texts.some(x => /Pump 3/.test(x)), JSON.stringify(chkPanel.texts));
ok("checks: event panel is visible with hard-block wording", chkPanel.panel && /Create COC is blocked/i.test(chkPanel.panelText) && /11001/.test(chkPanel.panelText), chkPanel.panelText.slice(0, 400));
ok("checks: COC is blocked while hard duplicates stand", chkPanel.blocked === true);
await shot("afm-checks-panel");

/* two field blanks / no field blank */
const blankCounts = await ev(() => {
  const evn = db.events.find(e => e.id === "e-afm-chk");
  const extra = fibreTrainRecord(evn, 0, "blank");
  extra.id = "t-blank-2"; extra.cowlNo = "11999"; extra.mediaId = "11999";
  db.trains.push(extra);
  const two = afmEventChecks(evn).filter(x => x.code === "blank_count");
  db.trains = db.trains.filter(x => x.id !== "t-blank-2");
  const savedBlanks = trainsOf("e-afm-chk").filter(t => isBlank(t));
  savedBlanks.forEach(t => { t._keep = t.trainKind; t.trainKind = "fibre_static"; t.sampleNo = 8; t.pouch = "8"; });
  const none = afmEventChecks(evn).filter(x => x.code === "blank_count");
  savedBlanks.forEach(t => { t.trainKind = "blank"; t.sampleNo = 0; t.pouch = "0"; });
  return { two: two.map(x => x.text), none: none.map(x => x.text) };
});
ok("checks: more than one field blank is flagged", blankCounts.two.some(x => /more than one field blank/i.test(x)), JSON.stringify(blankCounts.two));
ok("checks: no field blank is flagged", blankCounts.none.some(x => /no field blank/i.test(x)), JSON.stringify(blankCounts.none));

/* inline on the affected sample + re-check after save */
await ev(() => openTrain(trainsOf("e-afm-chk").find(t => sampleNoOf(t) === 1).id));
await sleep(300);
const inline = await ev(() => {
  const box = document.getElementById("afmSampleChecks");
  return { show: !!(box && !box.hidden && (box.textContent || "").trim()), text: (box && box.textContent) || "" };
});
ok("checks: inline warnings show on the affected sample", inline.show && /11001/.test(inline.text) && /191560/.test(inline.text), inline.text.slice(0, 400));
await shot("afm-checks-sample");

/* Create COC blocked, with a way to fix; already-existing COC is not blocked (AFM still explains Lifetree). */
dialogs.length = 0;
await ev(() => { view.eventId = "e-afm-chk"; view.page = "event"; });
const coc1 = await ev(async () => { const r = await createCoc(); return r; });
ok("checks: Create COC returns false when hard duplicates stand", coc1 === false);
ok("checks: Create COC names the clash and how to fix it",
  dialogs.some(d => /Can't create the COC yet/i.test(d) && /11001/.test(d) && /Open /i.test(d)),
  dialogs.join(" | ").slice(0, 500));
await ev(() => openEvent("e-afm-chk"));
await sleep(300);
await shot("afm-checks-coc-block");

dialogs.length = 0;
const coc2 = await ev(async () => {
  const evn = db.events.find(e => e.id === "e-afm-chk");
  evn.audit = evn.audit || [];
  evn.audit.push({ at: nowIso(), who: "Test", action: "Create COC", detail: "already downloaded", field: "event" });
  const blocked = afmCocBlocked(evn);
  const r = await createCoc();
  return { blocked, r, exists: afmCocExists(evn) };
});
ok("checks: an existing COC is not blocked by the hard-duplicate gate", coc2.exists === true && coc2.blocked === false, JSON.stringify(coc2));
ok("checks: existing-COC path does not show the hard-duplicate alert", !dialogs.some(d => /Can't create the COC yet/i.test(d)), dialogs.join(" | ").slice(0, 300));

/* re-check on save: fix the pump clash and the panel drops that hard item */
const afterSave = await ev(() => {
  const evn = db.events.find(e => e.id === "e-afm-chk");
  const p2 = trainsOf("e-afm-chk").find(t => sampleNoOf(t) === 2);
  p2.pumpSerial = "191599";
  if (typeof collectTrain === "function") try { collectTrain(p2); } catch (e) {}
  save();
  if (typeof paintAfmChecks === "function") paintAfmChecks();
  openEvent("e-afm-chk");
  const items = afmEventChecks(evn);
  return { pumps: items.filter(x => x.code === "dup_pump").length, stillCowl: items.some(x => x.code === "dup_cowl") };
});
await sleep(250);
const afterUi = await ev(() => {
  const text = (document.getElementById("afmChecksPanel") || {}).textContent || "";
  return { text, hasPump: /191560/.test(text) && /Pump 191560 is on/i.test(text) };
});
ok("checks: re-run after save drops the fixed pump duplicate", afterSave.pumps === 0 && afterSave.stillCowl === true, JSON.stringify(afterSave));
ok("checks: event panel updates after save", !afterUi.hasPump, afterUi.text.slice(0, 300));

/* 8. hygiene event still has no AFM cowl field; page errors */
await ev(id => openTrain(id), hid);
await sleep(250);
const hygUi = await ev(() => ({ cowl: !!document.getElementById("cowlNo"), du: !!document.getElementById("duSerial"), heading: (document.querySelector(".wrap h2.brand-type") || document.querySelector(".wrap h2") || {}).textContent || "" }));
ok("hygiene sample screen has no AFM cowl/DU fields", !hygUi.cowl && !hygUi.du, JSON.stringify(hygUi));
ok("hygiene heading is still Sample 1", /Sample 1/.test(hygUi.heading), hygUi.heading);
await shot("hygiene-unchanged");

ok("no page errors", errs.length === 0, errs.slice(0, 3).join(" | "));

console.log("\n--- " + vp + " " + results.length + " checks, " + fails + " failed ---");
results.forEach(r => console.log(r));
await browser.close();
server.close();
process.exit(fails ? 1 : 0);

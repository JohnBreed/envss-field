/* v48.3 tests: time capture lock, COC / Mark complete gate, not used / void, sign-in log. Supabase mocked; no production writes. */
import fs from "fs"; import path from "path";
import { serve, launch, VIEWPORTS, mockSupabase, sleep, SESSION } from "./harness.mjs";
const OUT = "/workspace/time-lock/work/v48-3/shots"; fs.mkdirSync(OUT, { recursive: true });
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail == null ? "" : String(detail) }); console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? " — " + String(detail).slice(0, 400) : "")); }
const H = 3600e3, now = Date.now(), iso = ms => new Date(ms).toISOString();
const pad = n => String(n).padStart(2, "0"); const ld = ms => { const d = new Date(ms); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
const TODAY = ld(now);
const who = "Field Tester <field.test@envss.com.au> · Android";
const base = (id, extra) => Object.assign({ id, eventId: "e483", trainKind: "airborne_personal", contaminantId: "INH", pumpSerial: "8" + id.length + "001", headId: "IESS" + id.length, mediaId: "C-" + id,
  startFlow: "2.0", endFlow: "", rotameter: "R1", shiftDate: TODAY, shiftKind: "day", status: "prepped", startAt: "", endAt: "",
  person: { first: "Pat", last: id, occupation: "Operator", hours: "8", sex: "male" }, rpd: {}, hpd: {}, audit: [] }, extra || {});
function fixture() {
  const s10 = now - 10 * H, s9 = now - 9 * H, e1 = now - 1 * H;
  return {
    catalogs: { contaminants: [{ id: "INH", name: "Inhalable dust", code: "INH", kind: "airborne", headHint: "IESS", flowTolPct: 10, defaultFlow: "2.0" }, { id: "NOISE", name: "Noise dose", code: "NOISE", kind: "noise" }],
      pumps: [], fleetPumps: [], heads: [], dosimeters: [], occupations: [], respirators: [], hpds: [] },
    projects: [{ id: "p483", number: "0019483", name: "v48.3 test", source: "field", site: "Test pit" }],
    events: [{ id: "e483", projectId: "p483", code: "0019483-001", type: "hygiene", date: TODAY, stage: "planned", audit: [] }],
    trains: [
      base("tA", { sampleNo: 1, pouch: "1", status: "running", startAt: iso(s10), audit: [{ at: iso(s10), who, action: "START pressed", detail: "" }] }),
      base("tB", { sampleNo: 2, pouch: "2" }),
      base("tC", { sampleNo: 3, pouch: "3", startAt: iso(s9), endAt: iso(e1), endFlow: "2.0" }),   /* typed, never pressed */
      base("tD", { sampleNo: 4, pouch: "4", status: "ended", startAt: iso(s9 + 30 * 60e3), endAt: iso(e1), endFlow: "2.0",
        audit: [{ at: iso(s9), who, action: "START pressed", detail: "" }, { at: iso(e1 + 120e3), who, action: "STOP pressed", detail: "" },
          { at: iso(e1 + 3600e3 / 2), who: "Tester B <tester.b@envss.com.au> · Chromebook", action: "Changed Start time", field: "startAt", from: iso(s9), to: iso(s9 + 30 * 60e3), detail: "" }] }),
      { id: "tE", eventId: "e483", trainKind: "blank", sampleNo: 5, pouch: "5", contaminantId: "INH", mediaId: "", status: "field_blank", shiftDate: TODAY, audit: [] },
      base("tF", { sampleNo: 1, pouch: "1", trainKind: "noise_personal", contaminantId: "NOISE", dosimeterSerial: "D1", noise: { method: "dose", values: {} } }),
      base("tG", { sampleNo: 6, pouch: "6", status: "ended", startAt: iso(s9), endAt: iso(e1 + 30e3), endFlow: "2.0", rejectAsked: "no", equipAsked: "no", commentAsked: "no", rpdAsked: "no",
        audit: [{ at: iso(s9), who, action: "START pressed", detail: "" }, { at: iso(e1 + 30e3), who, action: "STOP pressed", detail: "" }] }),
      base("tH", { sampleNo: 7, pouch: "7", status: "running", startAt: iso(now - 2 * H), audit: [{ at: iso(now - 2 * H), who, action: "START pressed", detail: "" }] })
    ], deletions: [], hires: [], _savedAt: iso(now + 60000)
  };
}
const { server, base: url } = await serve();
const browser = await launch();
const errs = [];
async function boot(vp, mockOpts) {
  const page = await browser.newPage(); page.on("pageerror", e => errs.push(vp + ": " + String(e)));
  await page.setViewport(VIEWPORTS[vp].viewport); await page.setUserAgent(VIEWPORTS[vp].ua);
  await page.setRequestInterception(true); const store = {}; const log = mockSupabase(page, store, mockOpts || {});
  const dialogs = []; let accept = true;
  page.on("dialog", async d => { dialogs.push(d.message()); if (d.type() === "confirm") await (accept ? d.accept() : d.dismiss()); else await d.accept(); });
  page.t = { dialogs, store, log, setAccept: v => { accept = v; } };
  await page.goto(url + "/field.html", { waitUntil: "domcontentloaded" }); await page.evaluate(SESSION);
  const fx = fixture(); await page.evaluate(d => { localStorage.setItem("envss-field-next-v32", JSON.stringify(d)); Object.keys(localStorage).filter(k => /^envss-field-login-(daily-|rpc-missing|log-queue)/.test(k)).forEach(k => localStorage.removeItem(k)); }, fx);
  await page.reload({ waitUntil: "networkidle0" }); await sleep(800);
  await page.evaluate(d => { db.projects = d.projects; db.events = d.events; db.trains = JSON.parse(JSON.stringify(d.trains)); db.catalogs = Object.assign(db.catalogs || {}, d.catalogs); persist();
    window.__dl = []; const _d = download; download = function (blob, name) { blob.text().then(t => window.__dl.push({ name, text: t })); }; }, fx);
  await sleep(200); return page;
}
const T = (page, id) => page.evaluate(id => JSON.parse(JSON.stringify(db.trains.find(x => x.id === id))), id);
const shot = (page, name, full) => page.screenshot({ path: path.join(OUT, name + ".png"), fullPage: !!full });
async function pickReason(page, code, text) { await page.evaluate((c, t) => { const r = document.querySelector('.v483-modal input[name="v483r"][value="' + c + '"]'); if (r) r.checked = true; if (t != null) document.querySelector("#v483rText").value = t; }, code, text); }

/* ================= Chromebook (laptop UA) ================= */
let page = await boot("chromebook");
const fx = fixture();
check("[chromebook] version 48.3", await page.evaluate(() => APP_VERSION === "48.3" && document.title === "ENVSS Field v48.3"), await page.evaluate(() => document.title));

/* 1. stored times untouched on upgrade; legacy labels derived only */
const before = fx.trains.map(t => [t.id, t.startAt, t.endAt, t.status]);
await page.evaluate(() => { openEvent("e483"); });
await sleep(300);
const after1 = await page.evaluate(() => db.trains.map(t => [t.id, t.startAt, t.endAt, t.status]));
check("existing samples: stored times and statuses unchanged after load + render", JSON.stringify(before) === JSON.stringify(after1), JSON.stringify(after1));
const caps = await page.evaluate(() => ["tA", "tC", "tD", "tG"].map(id => { const t = db.trains.find(x => x.id === id); return [id, v483.capture(t, "start"), v483.capture(t, "stop"), v483.timeFlag(t)]; }));
check("typed-never-pressed sample flagged manual (pre-v48.3)", caps[1][1] === "legacy_manual" && caps[1][2] === "legacy_manual", JSON.stringify(caps));
check("pressed-then-typed sample flagged edited (pre-v48.3)", caps[2][1] === "legacy_edited" && caps[2][2] === "pressed", JSON.stringify(caps[2]));
check("pressed sample has no flag", caps[3][3] === "" && caps[0][1] === "pressed", JSON.stringify([caps[0], caps[3]]));
const rowChips = await page.evaluate(() => [...document.querySelectorAll("#app .train .te-chip")].map(c => c.textContent));
check("event list shows legacy chips on rows", rowChips.includes("manual (pre-v48.3)") && rowChips.includes("edited (pre-v48.3)"), JSON.stringify(rowChips));
const noWrite = await page.evaluate(() => db.trains.find(x => x.id === "tC").audit.length);
check("legacy flag is display only (no audit / data written)", noWrite === 0, noWrite);
await shot(page, "chromebook-1-event-legacy-chips", true);

/* 2. read-only time boxes + Edit time on the sample screen */
await page.evaluate(() => openTrain("tG")); await sleep(300);
const ro = await page.evaluate(() => { const s = document.getElementById("startAt"), e = document.getElementById("endAt"); return { s: s && s.readOnly, e: e && e.readOnly, edits: [...document.querySelectorAll(".v483-edit")].map(b => b.textContent), help: (document.querySelector(".v483-help") || {}).textContent || "", laptop: !!document.getElementById("v483Laptop") }; });
check("start / stop boxes are read-only with Edit time buttons", ro.s && ro.e && ro.edits.length === 2 && ro.edits.every(x => x === "Edit time"), JSON.stringify(ro));
check("help text says times come from START / STOP", /Edit time and give a reason/.test(ro.help), ro.help);
const g0 = await T(page, "tG");
await page.evaluate(() => { const s = document.getElementById("startAt"); s.value = "03:03"; s.dispatchEvent(new Event("input", { bubbles: true })); s.dispatchEvent(new Event("change", { bubbles: true })); const c = document.getElementById("comments"); if (c) { c.dispatchEvent(new Event("change", { bubbles: true })); } collectTrain(db.trains.find(x => x.id === "tG")); });
const g1 = await T(page, "tG");
check("forcing a value into the box and saving does not change the stored time", g0.startAt === g1.startAt && g0.endAt === g1.endAt, g0.startAt + " vs " + g1.startAt);
await page.evaluate(() => render()); await sleep(200);
await page.click('.v483-edit[data-k="start"]'); await sleep(200);
await shot(page, "chromebook-2-edit-time-dialog");
const dlg = await page.evaluate(() => ({ title: document.querySelector(".v483-modal h3").textContent, reasons: [...document.querySelectorAll('.v483-modal input[name="v483r"]')].map(r => r.value), pressed: document.querySelector(".v483-modal .help:nth-of-type(2)") ? 1 : 0, text: document.querySelector(".v483-modal").innerText }));
check("edit dialog offers the five edit reasons", JSON.stringify(dlg.reasons) === JSON.stringify(["forgot_press", "pump_fault", "phone_flat", "wrong_press", "other"]), JSON.stringify(dlg.reasons));
check("edit dialog shows when START was pressed", /START was pressed/.test(dlg.text), dlg.text.slice(0, 300));
await page.click("#v483Save"); await sleep(100);
check("saving without a reason is refused", /Pick a reason/.test(await page.$eval("#v483Err", e => e.textContent)));
await pickReason(page, "other", ""); await page.click("#v483Save"); await sleep(100);
check("Other needs typed text", /Type the reason/.test(await page.$eval("#v483Err", e => e.textContent)));
const newStart = new Date(new Date(g0.startAt).getTime() - 15 * 60e3);
await page.evaluate((d, t) => { document.getElementById("v483d-start").value = d; document.getElementById("v483t-start").value = t; }, ld(newStart.getTime()), pad(newStart.getHours()) + ":" + pad(newStart.getMinutes()));
await pickReason(page, "wrong_press", "pressed late, pump on 15 min earlier"); await page.click("#v483Save"); await sleep(300);
const g2 = await T(page, "tG");
const te = (g2.audit.find(a => a.te) || {}).te || {};
check("edited start time saved", new Date(g2.startAt).getTime() === Math.floor(newStart.getTime() / 60000) * 60000, g2.startAt);
check("audit keeps pressed time, old time, new time, reason, who, device", te.pressedAt === g0.audit[0].at && te.from === g0.startAt && te.to === g2.startAt && te.reason === "wrong_press" && te.reasonText && /field.test@envss.com.au/.test(te.who) && te.device === "Chromebook" && te.manual === false, JSON.stringify(te));
const chip = await page.evaluate(() => [...document.querySelectorAll(".te-chip")].map(c => c.textContent));
check("'time edited' badge on the sample", chip.includes("time edited"), JSON.stringify(chip));
await shot(page, "chromebook-3-time-edited-badge");

/* 3. laptop warning on START (cancel = nothing happens, OK = pressed + noted) */
await page.evaluate(() => openTrain("tB")); await sleep(300);
const gapsB = await page.evaluate(() => startGaps(db.trains.find(x => x.id === "tB")));
const lapLine = await page.evaluate(() => (document.getElementById("v483Laptop") || {}).textContent || "");
check("laptop note shown on the sample screen", /Field capture should be on your phone/.test(lapLine), lapLine);
page.t.setAccept(false); page.t.dialogs.length = 0;
await page.click("#btnStart"); await sleep(400);
const b1 = await T(page, "tB");
check("laptop START warning shown; Cancel leaves it prepped", page.t.dialogs.some(d => /Field capture should be on your phone/.test(d)) && b1.status === "prepped" && !b1.startAt, JSON.stringify({ d: page.t.dialogs, s: b1.status, gaps: gapsB }));
page.t.setAccept(true); page.t.dialogs.length = 0;
await page.click("#btnStart"); await sleep(900);
const b2 = await T(page, "tB");
check("laptop START allowed after the warning and noted on the sample", b2.status === "running" && b2.audit.some(a => a.action === "START pressed") && b2.audit.some(a => a.lap && /START pressed on a Chromebook/.test(a.action)), JSON.stringify({ s: b2.status, gaps: gapsB, a: b2.audit.map(a => a.action) }));

/* 4. late STOP (tA started 10 h ago on an 8 h shift) */
await page.evaluate(() => openTrain("tA")); await sleep(300);
page.t.dialogs.length = 0;
await page.click("#btnStop"); await sleep(1200);
const late = await page.evaluate(() => { const m = document.querySelector('.v483-modal[data-v483="late"]'); return m ? m.innerText : ""; });
check("STOP > 15 min after the expected end offers the actual stop time", /after the expected end/.test(late) && /Enter actual stop time/.test(late), late.slice(0, 200));
await shot(page, "chromebook-4-late-stop");
await page.click("#v483LateFix"); await sleep(200);
const pre = await page.evaluate(() => (document.querySelector('.v483-modal input[name="v483r"]:checked') || {}).value);
check("late STOP opens Edit time with 'forgot to press' preselected", pre === "forgot_press", pre);
const a1 = await T(page, "tA"); const actual = new Date(new Date(a1.startAt).getTime() + 8 * H);
await page.evaluate((d, t) => { document.getElementById("v483d-stop").value = d; document.getElementById("v483t-stop").value = t; }, ld(actual.getTime()), pad(actual.getHours()) + ":" + pad(actual.getMinutes()));
await page.click("#v483Save"); await sleep(300);
const a2 = await T(page, "tA"); const teA = a2.audit.filter(a => a.te).pop().te;
check("actual stop time saved as an edit of the pressed STOP", a2.status === "ended" && teA.which === "stop" && teA.manual === false && teA.pressedAt && teA.reason === "forgot_press", JSON.stringify(teA));

/* 5. COC gate */
await page.evaluate(() => { openEvent("e483"); }); await sleep(300);
await page.evaluate(() => { window._v34LastCoc = undefined; createCoc(); }); await sleep(500);
const gate = await page.evaluate(() => { const m = document.querySelector('.v483-modal[data-v483="gate"]'); return m ? { ids: [...m.querySelectorAll("li[data-gate]")].map(l => l.dataset.gate), text: m.innerText } : null; });
check("Create COC blocked with a list of unfinished samples", gate && gate.ids.length > 0, JSON.stringify(gate && gate.ids));
check("COC list = typed-never-pressed (tC), blank missing details (tE), started-not-stopped (tB, tH); not noise, not finished", gate && JSON.stringify(gate.ids.slice().sort()) === JSON.stringify(["tB", "tC", "tE", "tH"]), JSON.stringify(gate && gate.ids));
check("nothing downloaded while blocked", await page.evaluate(() => window._v34LastCoc === undefined && window.__dl.length === 0));
const evLog = await page.evaluate(() => (eventById("e483").audit || []).map(a => a.action));
check("blocked COC noted on the event audit", evLog.includes("Create COC blocked"), JSON.stringify(evLog));
await shot(page, "chromebook-5-coc-gate");
/* Mark complete gate also lists the noise sample */
await page.evaluate(() => { document.querySelectorAll(".v483-modal").forEach(m => m.remove()); markEventUpload("e483"); }); await sleep(300);
const gateC = await page.evaluate(() => [...document.querySelectorAll('.v483-modal[data-v483="gate"] li[data-gate]')].map(l => l.dataset.gate).sort());
check("Mark event complete blocked; list includes the prepped noise sample", JSON.stringify(gateC) === JSON.stringify(["tB", "tC", "tE", "tF", "tH"]) && !(await page.evaluate(() => eventById("e483").uploadReady)), JSON.stringify(gateC));
await page.evaluate(() => document.querySelectorAll(".v483-modal").forEach(m => m.remove()));
/* resolve from the COC gate */
await page.evaluate(() => createCoc()); await sleep(300);
await page.click('[data-g="times"][data-id="tC"]'); await sleep(200);
const manDlg = await page.evaluate(() => ({ reasons: [...document.querySelectorAll('.v483-modal[data-v483="time"] input[name="v483r"]')].map(r => r.value), checked: (document.querySelector('.v483-modal[data-v483="time"] input[name="v483r"]:checked') || {}).value, s: document.getElementById("v483t-start").value, e: document.getElementById("v483t-stop").value, title: document.querySelector('.v483-modal[data-v483="time"] h3').textContent }));
check("Enter times on a never-pressed sample uses the manual reasons, 'paper field sheet' preselected, current times prefilled", manDlg.reasons[0] === "paper_sheet" && manDlg.checked === "paper_sheet" && manDlg.s && manDlg.e && /without/.test(manDlg.title), JSON.stringify(manDlg));
await shot(page, "chromebook-6-enter-times-from-paper");
await page.evaluate(() => { document.getElementById("v483rText").value = "from field sheet"; });
await page.click("#v483Save"); await sleep(400);
const c2 = await T(page, "tC");
check("paper times: sample moves out of prepped to ended; times kept; marked manual", c2.status === "ended" && Math.abs(new Date(c2.startAt) - new Date(fx.trains[2].startAt)) < 60e3 && c2.audit.filter(a => a.te && a.te.manual).length === 2 && (await page.evaluate(() => v483.timeFlag(db.trains.find(x => x.id === "tC")))) === "manual", JSON.stringify({ s: c2.status, a: c2.audit.map(a => a.action) }));
const gate2 = await page.evaluate(() => [...document.querySelectorAll('.v483-modal[data-v483="gate"] li[data-gate]')].map(l => l.dataset.gate).sort());
check("gate list refreshes after each fix", JSON.stringify(gate2) === JSON.stringify(["tB", "tE", "tH"]), JSON.stringify(gate2));
await page.click('[data-g="void"][data-id="tE"]'); await sleep(200);
const vpre = await page.evaluate(() => (document.querySelector('.v483-modal[data-v483="void"] input[name="v483r"]:checked') || {}).value);
await page.click("#v483Save"); await sleep(300);
const e2 = await T(page, "tE");
check("field blank: Not used / void keeps the record with reason", e2.status === "not_used" && /Field blank not used/.test(e2.notUsedReason) && e2.audit.some(a => a.action === "Marked not used / void") && vpre === "blank_unused", JSON.stringify({ s: e2.status, r: e2.notUsedReason }));
await page.click('[data-g="reject"][data-id="tH"]'); await sleep(200);
await page.evaluate(() => { const r = document.querySelector('.v483-modal[data-v483="reject"] input[name="v483r"]'); r.checked = true; document.getElementById("v483rText").value = "tube kinked"; });
await page.click("#v483Save"); await sleep(300);
const h2 = await T(page, "tH");
check("Reject with reason from the gate", h2.status === "rejected" && h2.rejectAsked === "yes" && !!h2.rejectCode && /tube kinked/.test(h2.rejectReason), JSON.stringify({ s: h2.status, c: h2.rejectCode, r: h2.rejectReason }));
await page.click('[data-g="times"][data-id="tB"]'); await sleep(200);
const bnow = new Date(Date.now() + 120e3);
await page.evaluate((d, t) => { document.getElementById("v483d-stop").value = d; document.getElementById("v483t-stop").value = t; }, ld(bnow.getTime()), pad(bnow.getHours()) + ":" + pad(bnow.getMinutes()));
await pickReason(page, "phone_flat", null); await page.click("#v483Save"); await sleep(300);
const b3 = await T(page, "tB");
const clear = await page.evaluate(() => { const m = document.querySelector('.v483-modal[data-v483="gate"]'); return m ? { clear: !!m.querySelector("#v483GateClear"), go: !!m.querySelector("#v483GateGo") } : null; });
check("stop time entered (STOP never pressed → manual) and gate clears with a Create COC button", b3.status === "ended" && b3.audit.some(a => a.te && a.te.which === "stop" && a.te.manual) && clear && clear.clear && clear.go, JSON.stringify({ s: b3.status, clear }));
await shot(page, "chromebook-7-gate-clear");
await page.click("#v483GateGo"); await sleep(800);
const tat = await page.evaluate(() => !!document.getElementById("cocTatOk"));
check("Create COC continues to the turnaround step once clear", tat);
if (tat) { await page.click("#cocTatOk"); await sleep(3000); }
const coc = await page.evaluate(() => window._v34LastCoc || null);
check("COC made without the not-used blank (6 lab rows: tA,tB,tC,tD,tG,tH)", coc && coc.rows === 6, JSON.stringify(coc));
check("trainsOf back to normal after COC (not-used still listed in the event)", await page.evaluate(() => trainsOf("e483").some(t => t.id === "tE") && !window._v483CocScope));
/* exports */
await page.evaluate(() => { window.__dl = []; exportWorkbookCsvs("e483"); exportCsv("e483"); }); await sleep(1500);
const dl = await page.evaluate(() => window.__dl);
const samples = (dl.find(d => /-samples\.csv$/.test(d.name)) || {}).text || "", cocCsv = (dl.find(d => /-coc\.csv$/.test(d.name)) || {}).text || "", flat = (dl.find(d => /ENVSS-Field\.csv$/.test(d.name)) || {}).text || "";
check("samples CSV has time capture columns and reasons", /time_start_capture/.test(samples) && /manual/.test(samples) && /Entered from paper field sheet/.test(samples) && /NOT USED/.test(samples), samples.split("\n")[0].slice(-120));
check("COC CSV: not-used blank left off; time_flag column shows edits", /time_flag/.test(cocCsv) && !/C-tE|"5"/.test(cocCsv.split("\n").filter(l => /"YES"/.test(l)).join()) && /manual time|time edited/.test(cocCsv), cocCsv.split("\n").length + " lines");
check("flat CSV has time capture columns", /time_edit_reasons/.test(flat) && /edited \(pre-v48\.3\)/.test(flat));
/* undo not used on the sample screen */
await page.evaluate(() => openTrain("tE")); await sleep(300);
const nuBox = await page.evaluate(() => !!document.getElementById("v483NotUsed"));
await shot(page, "chromebook-8-not-used-sample");
await page.click("#v483Undo"); await sleep(300);
const e3 = await T(page, "tE");
check("Undo not used restores the sample and logs it", nuBox && e3.status === "field_blank" && e3.audit.some(a => a.action === "Not used / void undone"), e3.status);
/* existing COC not affected: the gate only runs on Create COC; already-complete events keep uploadReady */
check("no page errors (chromebook)", !errs.length, errs.join(" | "));
await page.close();

/* ================= Pixel 7 (phone UA) ================= */
page = await boot("pixel7");
await page.evaluate(() => openTrain("tB")); await sleep(300);
const ph = await page.evaluate(() => ({ ro: document.getElementById("startAt").readOnly, laptop: !!document.getElementById("v483Laptop"), mobile: v483.MOBILE, enter: [...document.querySelectorAll(".v483-edit")].map(b => b.textContent), voidBtn: !!document.getElementById("v483VoidBtn") }));
check("[pixel7] phone: read-only time, no laptop note, 'Enter time without START' and Not used offered", ph.ro && !ph.laptop && ph.mobile && ph.enter.includes("Enter time without START") && ph.voidBtn, JSON.stringify(ph));
await shot(page, "pixel7-1-prepped-sample", true);
page.t.dialogs.length = 0;
await page.click("#btnStart"); await sleep(900);
const pb = await T(page, "tB");
check("[pixel7] START on the phone: no laptop warning, recorded as pressed", pb.status === "running" && !page.t.dialogs.some(d => /Field capture/.test(d)) && !pb.audit.some(a => a.lap) && (await page.evaluate(() => v483.capture(db.trains.find(x => x.id === "tB"), "start"))) === "pressed", JSON.stringify(page.t.dialogs));
await page.evaluate(() => openTrain("tG")); await sleep(300);
await page.click('.v483-edit[data-k="stop"]'); await sleep(200);
await shot(page, "pixel7-2-edit-time-dialog");
await page.evaluate(() => document.querySelectorAll(".v483-modal").forEach(m => m.remove()));
await page.evaluate(() => { openEvent("e483"); createCoc(); }); await sleep(400);
const pg = await page.evaluate(() => { const m = document.querySelector('.v483-modal[data-v483="gate"] .v483-dialog'); const r = m && m.getBoundingClientRect(); return m ? { ids: [...m.querySelectorAll("li[data-gate]")].length, w: r.width, fits: r.width <= 412 } : null; });
check("[pixel7] COC gate fits the phone screen", pg && pg.ids === 5 && pg.fits, JSON.stringify(pg));
await shot(page, "pixel7-3-coc-gate");
await page.click('[data-g="open"][data-id="tH"]'); await sleep(300);
check("[pixel7] tap-through opens the blocking sample", await page.evaluate(() => view.page === "train" && view.trainId === "tH"));
await page.evaluate(() => openTrain("tF")); await sleep(300);
const nz = await page.evaluate(() => ({ s: (document.getElementById("startAt") || {}).readOnly, e: (document.getElementById("endAt") || {}).readOnly, b: document.querySelectorAll(".v483-edit").length }));
check("[pixel7] noise sample: time boxes read-only with Edit / Enter time", nz.s === true && nz.e === true && nz.b >= 1, JSON.stringify(nz));
await shot(page, "pixel7-4-noise-sample", true);
await page.evaluate(() => { db.events.push({ id: "eafm", projectId: "p483", code: "0019483-AFM-001", type: "fibre", date: db.events[0].date, audit: [] });
  db.trains.push({ id: "tafm", eventId: "eafm", trainKind: "fibre_static", sampleNo: 1, pouch: "1", cowlNo: "12345", mediaId: "12345", pumpSerial: "77001", location: "Gate", startFlow: "2.0", status: "prepped", startAt: "", endAt: "", audit: [] }); persist(); openTrain("tafm"); });
await sleep(400);
const afm = await page.evaluate(() => ({ s: (document.getElementById("startAt") || {}).readOnly, b: [...document.querySelectorAll(".v483-edit")].map(x => x.textContent) }));
check("[pixel7] AFM sample: time boxes read-only too", afm.s === true && afm.b.length >= 1, JSON.stringify(afm));
await shot(page, "pixel7-5-afm-sample", true);
check("no page errors (pixel7)", !errs.length, errs.join(" | "));

/* ================= sign-in log ================= */
await sleep(1500);
const rpc = [...(page.t.store.rpc || new Map()).values()];
const p = (rpc.find(r => r.p && r.p.event === "app_open") || {}).p || {};
check("sign-in log: app open sent through envss_log_app_open with device detail", p.app_version === "48.3" && p.device_type === "phone" && p.os === "Android" && p.os_version === "14" && p.browser === "Chrome" && /^156/.test(p.browser_version) && p.display_mode === "browser_tab" && p.client_event_id, JSON.stringify(p));
check("sign-in log: daily_open also sent", rpc.some(r => r.p && r.p.event === "daily_open"), rpc.map(r => r.p && r.p.event).join(","));
check("sign-in log: no new staff-facing UI", !(await page.evaluate(() => !!document.getElementById("btnLoginLog"))));
await page.close();
/* fallback when the SQL is not applied yet: rpc 404 -> plain table insert (no ignore-duplicates), app_open skipped */
page = await browser.newPage(); page.on("pageerror", e => errs.push("fb: " + e));
await page.setViewport(VIEWPORTS.chromebook.viewport); await page.setUserAgent(VIEWPORTS.chromebook.ua); await page.setRequestInterception(true);
const seen = []; let firstRefused = false;
page.on("request", req => {
  const u = req.url(); if (!u.includes(".supabase.co/")) return req.continue();
  const hdr = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*", "Content-Type": "application/json" };
  if (req.method() === "OPTIONS") return req.respond({ status: 200, headers: hdr, body: "" });
  if (/\/rpc\/envss_log_app_open/.test(u)) { seen.push({ rpc: 1 }); return req.respond({ status: 404, headers: hdr, body: '{"code":"PGRST202"}' }); }
  if (/envss_login_log/.test(u) && req.method() === "POST") { const b = JSON.parse(req.postData() || "{}"); seen.push({ table: 1, prefer: req.headers()["prefer"], event: b.event, ext: "ext" in b, browser: b.browser, id: b.client_event_id });
    if (b.client_event_id === "bad-row") { firstRefused = true; return req.respond({ status: 403, headers: hdr, body: "{}" }); }
    return req.respond({ status: 201, headers: hdr, body: "" }); }
  return req.respond({ status: 200, headers: hdr, body: req.method() === "GET" ? "[]" : "" });
});
await page.goto(url + "/field.html", { waitUntil: "domcontentloaded" }); await page.evaluate(SESSION);
await page.evaluate(() => { Object.keys(localStorage).filter(k => /^envss-field-login-(daily-|rpc-missing|log-queue)/.test(k)).forEach(k => localStorage.removeItem(k)); });
await page.evaluate(() => localStorage.setItem("envss-field-login-log-queue-v45e", JSON.stringify([{ email: "field.test@envss.com.au", event: "daily_open", occurred_at: new Date().toISOString(), local_date: "2026-11-12", client_event_id: "bad-row" }])));
await page.reload({ waitUntil: "networkidle0" }); await sleep(2500);
const tbl = seen.filter(s => s.table);
check("fallback: rpc missing → plain insert, no ignore-duplicates, no extra field", seen.some(s => s.rpc) && tbl.length && tbl.every(s => !/ignore-duplicates/.test(s.prefer || "") && !s.ext), JSON.stringify(seen));
check("fallback: a refused row no longer blocks the rows behind it", firstRefused && tbl.some(s => s.id !== "bad-row" && s.event === "daily_open"), JSON.stringify(tbl.map(s => s.id + ":" + s.event)));
check("fallback: app_open is not forced into the old table; browser carries the major version", !tbl.some(s => s.event === "app_open") && tbl.some(s => /^Chrome \d+$/.test(s.browser || "")), JSON.stringify(tbl.map(s => s.browser)));
const q = await page.evaluate(() => JSON.parse(localStorage.getItem("envss-field-login-log-queue-v45e") || "[]").map(r => r.client_event_id + ":" + (r.tries || 0)));
check("fallback: refused row kept for a limited retry (tries counted)", q.length === 1 && /bad-row:1/.test(q[0]), JSON.stringify(q));
check("no page errors (sign-in log)", !errs.length, errs.join(" | "));
await page.close();

await browser.close(); server.close();
const passed = results.filter(r => r.ok).length;
fs.writeFileSync("/workspace/time-lock/work/v48-3/test-results.json", JSON.stringify({ passed, failed: results.length - passed, results }, null, 2));
console.log(`\n${passed} passed, ${results.length - passed} failed`);

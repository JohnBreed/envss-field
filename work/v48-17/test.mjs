/* v48.17 tests: photo Drive-status badge wording + wrap under the daily-log thumbnail.
   Usage: ROOT=/workspace/envss-v4817 OUT=/workspace/fit-shots/v4817 node work/v48-17/test.mjs [pixel7|chromebook]
   Supabase is mocked in memory. Fixture names are made up. */
import fs from "fs"; import path from "path";
import { serve, launch, VIEWPORTS, mockSupabase, sleep, SESSION } from "../v48-7/harness.mjs";
const OUT = process.env.OUT || "/workspace/fit-shots/v4817"; fs.mkdirSync(OUT, { recursive: true });
const SRC = process.env.ROOT || "/workspace/envss-v4817";
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail == null ? "" : String(detail) }); console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail && !ok ? " — " + String(detail).slice(0, 700) : "")); }

const html = fs.readFileSync(path.join(SRC, "field.html"), "utf8");
const sw = fs.readFileSync(path.join(SRC, "sw-field.js"), "utf8");
const BADGE = "Photo saved to device. Drive upload pending";
const span = '<span class="drive-st drive-wait">Photo saved to device.<br> Drive upload pending</span>';
check("field.html APP_VERSION is 48.19", /const APP_VERSION = "48\.19";/.test(html));
check("sw-field.js is v48.19 with cache envss-field-v48-19", /const VERSION = "48\.19";/.test(sw) && /const CACHE = "envss-field-v48-19";/.test(sw));
check("user-visible badge text is exactly the new wording in both sites (line break between the two sentences)", (html.split(span).length - 1) === 2);
check("the old 'Waiting for Drive' badge text is gone (only comments may mention it)", !/drive-wait">Waiting for Drive</.test(html));
check("'In Drive' wording is unchanged", /drive-ok">In Drive</.test(html));
check("badge CSS wraps: white-space normal, max-width 100%", /\.drive-st\{[^}]*white-space:normal/.test(html) && /\.drive-st\{[^}]*max-width:100%/.test(html) && /\.drive-st-wrap\{[^}]*max-width:100%/.test(html));

const PF = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth", year: "numeric", month: "2-digit", day: "2-digit" });
const TODAY = PF.format(new Date());
const person = (first, last) => ({ first, last, sex: "male", sexSet: true, dob: "1985-03-04", dobD: "04", dobM: "03", dobY: "1985", occupation: "Fitter", company: "Acme", hours: "12", daysOn: "8", daysOff: "6" });
function fixture() {
  return {
    catalogs: { contaminants: [{ id: "INH", name: "Inhalable dust", code: "INH", kind: "airborne", headHint: "IESS", flowTolPct: 10, defaultFlow: "2.0" }],
      pumps: [], fleetPumps: [], heads: [], dosimeters: [], occupations: [], respirators: [], hpds: [] },
    projects: [{ id: "p4817", number: "0019817", name: "v48.17 badge test", source: "field", site: "Test site", status: "Active" }],
    events: [{ id: "eH", projectId: "p4817", code: "0019817-001", type: "hygiene", date: TODAY, stage: "planned", audit: [] }],
    trains: [{ id: "h1", eventId: "eH", trainKind: "airborne_personal", mode: "personal", sampleNo: 1, pouch: "1", contaminantId: "INH", pumpSerial: "77001", headId: "IESS11", mediaId: "C-1",
      startFlow: "2.0", endFlow: "", rotameter: "R1", shiftDate: TODAY, shiftKind: "day", status: "prepped", startAt: "", endAt: "", comments: "", location: "Bay 1",
      person: person("Sam", "Test1"), rpd: {}, hpd: {}, audit: [], dailyLog: {} }],
    deletions: [], hires: [], _savedAt: new Date(Date.now() + 60000).toISOString()
  };
}

const { server, base: url } = await serve();
const browser = await launch(["--host-resolver-rules=MAP *.supabase.co 127.0.0.1:9"]);
const ext = [];
async function boot(vp) {
  const page = await browser.newPage(); page.errs = []; page.on("pageerror", e => page.errs.push(String(e)));
  await page.setViewport(VIEWPORTS[vp].viewport); await page.setUserAgent(VIEWPORTS[vp].ua);
  await page.setRequestInterception(true); const store = {}; page.mlog = mockSupabase(page, store, {});
  page.on("request", r => { const u = r.url(); if (!u.startsWith(url) && !u.startsWith("data:") && !u.startsWith("blob:") && !/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com|\.supabase\.co\//.test(u)) ext.push(vp + " " + r.method() + " " + u.split("?")[0]); });
  page.dialogs = []; page.on("dialog", async d => { page.dialogs.push(d.message()); await d.accept(); });
  await page.goto(url + "/field.html", { waitUntil: "domcontentloaded" }); await page.evaluate(SESSION);
  const fx = fixture(); await page.evaluate(d => { localStorage.setItem("envss-field-next-v32", JSON.stringify(d)); }, fx);
  await page.reload({ waitUntil: "networkidle0" }); await sleep(800);
  await page.evaluate(d => {
    db.projects = d.projects; db.events = d.events; db.trains = JSON.parse(JSON.stringify(d.trains));
    db.catalogs = Object.assign(db.catalogs || {}, d.catalogs); persist();
    pullActivity = async function () {}; window.pullActivity = pullActivity;
  }, fx);
  await sleep(200);
  return page;
}

async function addDailyLogPhoto(page) {
  return page.evaluate(async () => {
    const t = db.trains.find(x => x.id === "h1");
    const c = document.createElement("canvas"); c.width = 320; c.height = 400;
    const g = c.getContext("2d");
    g.fillStyle = "#d9c8a0"; g.fillRect(0, 0, 320, 400);
    g.fillStyle = "#333"; g.font = "22px sans-serif";
    g.fillText("Field sheet p1", 24, 48);
    g.strokeStyle = "#555"; g.strokeRect(20, 80, 280, 280);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.85));
    const file = new File([blob], "log.jpg", { type: "image/jpeg" });
    const p = await envssPhotos.add(file, t, "dailyLog");
    p.at = p.takenAt;
    t.dailyLog = { status: "attached", photos: [p], at: new Date().toISOString(), who: "V46 Test" };
    t.updatedAt = new Date().toISOString();
    save(); render();
    return p.pid;
  });
}

async function waitBadge(page, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const info = await page.evaluate(() => {
      const card = document.getElementById("dailyLogCard");
      const badge = card && card.querySelector(".drive-st");
      const fig = card && card.querySelector(".dl-photos figure");
      if (!card || !badge || !fig) return null;
      const fr = fig.getBoundingClientRect(), br = badge.getBoundingClientRect();
      return {
        text: badge.textContent.trim(),
        cls: badge.className,
        figW: Math.round(fr.width * 10) / 10,
        badgeW: Math.round(br.width * 10) / 10,
        badgeH: Math.round(br.height * 10) / 10,
        overflow: Math.round((br.right - fr.right) * 10) / 10
      };
    });
    if (info && info.text) return info;
    await sleep(150);
  }
  return null;
}

async function run(vp) {
  const page = await boot(vp);
  check(`[${vp}] app is v48.19`, await page.evaluate(() => APP_VERSION === "48.19" && document.getElementById("appVersion").textContent === "v48.19" && document.title === "ENVSS Field v48.19"));
  await page.evaluate(() => openTrain("h1")); await sleep(400);
  const pid = await addDailyLogPhoto(page); await sleep(400);
  const info = await waitBadge(page);
  check(`[${vp}] daily log card shows the new Drive badge text`, !!(info && info.text.replace(/\s+/g, " ") === BADGE), JSON.stringify(info) + " pid=" + pid);
  check(`[${vp}] badge keeps the drive-st drive-wait class`, !!(info && /\bdrive-st\b/.test(info.cls) && /\bdrive-wait\b/.test(info.cls)), info && info.cls);
  check(`[${vp}] badge stays within the 96px thumbnail column (no overflow)`, !!(info && info.overflow <= 1 && info.badgeW <= info.figW + 1), JSON.stringify(info));
  check(`[${vp}] longer text wraps to more than one line`, !!(info && info.badgeH >= 28), JSON.stringify(info));
  const card = await page.$("#dailyLogCard");
  if (card) {
    await card.evaluate(el => el.scrollIntoView({ block: "center" })); await sleep(200);
    const label = vp === "pixel7" ? "phone" : "chromebook";
    const dest = path.join(OUT, label + "-daily-log-badge.png");
    await card.screenshot({ path: dest });
    check(`[${vp}] wrote ${label}-daily-log-badge.png`, fs.existsSync(dest), dest);
    await page.screenshot({ path: path.join(OUT, label + "-daily-log-badge-page.png"), fullPage: false });
  } else {
    check(`[${vp}] daily log card present for screenshot`, false);
  }
  check(`[${vp}] no page errors`, !page.errs.length, page.errs.join(" | "));
  await page.close();
}

const vps = process.argv[2] ? [process.argv[2]] : ["pixel7", "chromebook"];
for (const vp of vps) { try { await run(vp); } catch (e) { check(`[${vp}] run completed`, false, e.stack); } }
check("no request left the box except the CDN libraries; every Supabase call was answered by the in-memory mock", !ext.length, ext.join("\n"));
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "test-results.json"), JSON.stringify(results, null, 1));
console.log(results.filter(r => r.ok).length + "/" + results.length + " passed");
await browser.close(); server.close();
process.exit(results.every(r => r.ok) ? 0 : 1);

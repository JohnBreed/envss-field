/* Layout A project-list tests (draft). Supabase is mocked; nothing reaches production.
   Usage: ROOT=/workspace/envss-projlist node work/projlist/test.mjs */
import fs from "fs"; import path from "path";
import { serve, launch, VIEWPORTS, mockSupabase, sleep, SESSION } from "./harness.mjs";

const fx = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "fixture.json"), "utf8"));
const NOW = "2026-11-23T10:00:00+08:00";
function storeFrom(projects) {
  const envss_projects = new Map(projects.map(p => [p.id, { id: p.id, payload: p, updated_at: NOW }]));
  return { envss_projects, envss_events: new Map(), envss_trains: new Map(), envss_deletions: new Map(), envss_hires: new Map(), v_field_hyg_events: new Map(), v_field_afm_events: new Map() };
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail == null ? "" : String(detail) });
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (!ok && detail ? " — " + String(detail).slice(0, 400) : ""));
}

const { server, base: url } = await serve();
const browser = await launch(["--host-resolver-rules=MAP *.supabase.co 127.0.0.1:9"]);

async function boot(vp) {
  const ctx = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
  const page = await ctx.newPage();
  page.errs = [];
  page.on("pageerror", e => page.errs.push(String(e)));
  await page.setViewport(VIEWPORTS[vp].viewport);
  await page.setUserAgent(VIEWPORTS[vp].ua);
  await page.setRequestInterception(true);
  page.mlog = mockSupabase(page, storeFrom(fx.currentProjects), {});
  await page.goto(url + "/field.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(SESSION);
  await page.evaluate(fix => { window.ENVSS_PROJLIST_FIXTURE = fix; window.ENVSS_PROJLIST_REVIEW = 1; }, fx);
  await page.reload({ waitUntil: "networkidle0" });
  await page.evaluate(fix => { window.ENVSS_PROJLIST_FIXTURE = fix; window.ENVSS_PROJLIST_REVIEW = 1; }, fx);
  await sleep(1200);
  await page.evaluate(() => {
    view.page = "dash";
    view.plrOpen = "";
    view.plrHideNone = false;
    view.plrCollapse = { nodate: true, test: true };
    render();
  });
  await sleep(300);
  return { page, ctx };
}

function writes(page) {
  /* Login-log RPC is mocked too; fail only if a table or Podio-shaped write is attempted. */
  return (page.mlog || []).filter(l => /^(POST|PATCH|PUT|DELETE) /.test(l) && !/envss_log_app_open/.test(l));
}

for (const vp of ["pixel7", "chromebook"]) {
  const { page, ctx } = await boot(vp);
  const info = await page.evaluate(() => {
    const cards = [...document.querySelectorAll(".plr-card")].map(el => ({
      id: el.getAttribute("data-project"),
      num: (el.querySelector(".brand-type") || {}).textContent || "",
      text: el.innerText.replace(/\s+/g, " ").trim()
    }));
    const groups = [...document.querySelectorAll(".plr-group")].map(g => ({
      key: g.getAttribute("data-plr-group"),
      title: (g.querySelector("h3") || {}).textContent || "",
      count: (g.querySelector(".plr-count") || {}).textContent || "",
      hidden: /hidden in this group/.test(g.innerText),
      nums: [...g.querySelectorAll(".plr-card .brand-type")].map(n => n.textContent)
    }));
    return {
      version: typeof APP_VERSION !== "undefined" ? APP_VERSION : "",
      heading: (document.querySelector(".wrap h2") || document.querySelector("h2") || {}).textContent || "",
      banner: (document.querySelector(".plr-banner") || {}).textContent || "",
      shown: (document.querySelector("#btnPlrHideNone") && document.querySelector("#btnPlrHideNone").parentElement
        ? document.querySelector("#btnPlrHideNone").parentElement.innerText : ""),
      cards, groups,
      nums: cards.map(c => c.num),
      errs: (window.__pageErrs) || []
    };
  });
  info.errs = page.errs;

  check(`[${vp}] app is v48.5`, info.version === "48.5", info.version);
  check(`[${vp}] Layout A is showing`, /grouped by when work is happening/.test(info.banner) && /Projects/.test(info.heading), info.heading + " | " + info.banner);
  check(`[${vp}] no page errors`, page.errs.length === 0, page.errs.join(" | "));
  check(`[${vp}] no Supabase writes`, writes(page).length === 0, writes(page).join(" | "));

  const counts = info.nums.reduce((m, n) => (m[n] = (m[n] || 0) + 1, m), {});
  const dups = Object.entries(counts).filter(([, n]) => n > 1);
  check(`[${vp}] one card per job number`, dups.length === 0, JSON.stringify(dups));
  check(`[${vp}] 0018637 and 0019219 appear once`, counts["0018637"] === 1 && counts["0019219"] === 1, JSON.stringify({ c: counts["0018637"], j: counts["0019219"] }));

  const today = info.groups.find(g => g.key === "today") || {};
  const week = info.groups.find(g => g.key === "week") || {};
  const nodate = info.groups.find(g => g.key === "nodate") || {};
  const test = info.groups.find(g => g.key === "test") || {};
  check(`[${vp}] On site today is 0019185, 0019219, 0019438`, (today.nums || []).slice().sort().join(",") === "0019185,0019219,0019438", JSON.stringify(today));
  check(`[${vp}] Next 7 days is 0017889, 0018637, 0019328, 0019467`, (week.nums || []).slice().sort().join(",") === "0017889,0018637,0019328,0019467", JSON.stringify(week));
  check(`[${vp}] No date set is collapsed`, !!(nodate.hidden && +nodate.count > 0 && (nodate.nums || []).length === 0), JSON.stringify(nodate));
  check(`[${vp}] Test / local only is collapsed`, !!(test.hidden && test.count === "4"), JSON.stringify(test));

  const c9219 = info.cards.find(c => c.num === "0019219") || { text: "" };
  const c8637 = info.cards.find(c => c.num === "0018637") || { text: "" };
  const c9467 = info.cards.find(c => c.num === "0019467") || { text: "" };
  const c9358 = (await page.evaluate(() => {
    /* 0019358 is in Later, so already in the DOM */
    const el = [...document.querySelectorAll(".plr-card")].find(c => (c.querySelector(".brand-type") || {}).textContent === "0019358");
    return el ? el.innerText.replace(/\s+/g, " ").trim() : "";
  }));
  check(`[${vp}] 0019219 shows both attendees`, /Marisabel Cuspoca, Talis Powdrill/.test(c9219.text) && !/Controller:/.test(c9219.text), c9219.text);
  check(`[${vp}] 0018637 next event falls back to labelled controller`, /Controller: Candice Shehan/.test(c8637.text), c8637.text);
  check(`[${vp}] 0019467 shows attendee Daryle, not a controller label`, /Daryle Van Geest/.test(c9467.text) && !/Controller:/.test(c9467.text), c9467.text);
  check(`[${vp}] 0019358 shows attendee Ben Adcock unlabelled`, /Ben Adcock/.test(c9358) && !/Controller:/.test(c9358), c9358);

  await page.evaluate(() => { view.plrOpen = "podio-job-0018637"; render(); });
  await sleep(200);
  const exp8637 = await page.evaluate(() => {
    const el = document.querySelector('[data-project="podio-job-0018637"]');
    return el ? el.innerText : "";
  });
  check(`[${vp}] 0018637 expanded lists Marisabel on 0018 and labelled controller on 0020`,
    /0018/.test(exp8637) && /Marisabel Cuspoca/.test(exp8637) && /0018637-0020/.test(exp8637) && /Controller: Candice Shehan/.test(exp8637),
    exp8637.replace(/\s+/g, " ").slice(0, 500));

  await page.evaluate(() => { view.plrOpen = "podio-job-0019321"; render(); });
  await sleep(200);
  const exp9321 = await page.evaluate(() => {
    const el = document.querySelector('[data-project="podio-job-0019321"]');
    return el ? el.innerText.replace(/\s+/g, " ").trim() : "";
  });
  check(`[${vp}] 0019321 shows 3 of 5 events done and labelled controller`,
    /3 of 5 events done/.test(exp9321) && /Controller: Ben Adcock/.test(exp9321) && /0019321-003/.test(exp9321) && /Needs fields/i.test(exp9321),
    exp9321.slice(0, 500));

  await ctx.close();
}

await browser.close();
server.close();
const failed = results.filter(r => !r.ok);
console.log("\n" + results.filter(r => r.ok).length + " passed, " + failed.length + " failed, " + results.length + " total");
if (failed.length) process.exit(1);

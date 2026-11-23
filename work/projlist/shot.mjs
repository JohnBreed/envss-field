/* Project-list review screenshots. Supabase is mocked in memory; nothing is written to production.
   Usage: ROOT=/workspace/envss-projlist node work/projlist/shot.mjs */
import fs from "fs"; import path from "path";
import { serve, launch, VIEWPORTS, mockSupabase, sleep, SESSION } from "./harness.mjs";

const OUT = process.env.OUT || "/workspace/envss-projlist/work/projlist/shots";
fs.mkdirSync(OUT, { recursive: true });
const fx = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "fixture.json"), "utf8"));
const NOW = "2026-11-23T10:00:00+08:00";

function storeFrom(projects) {
  const envss_projects = new Map(projects.map(p => [p.id, { id: p.id, payload: p, updated_at: NOW }]));
  return { envss_projects, envss_events: new Map(), envss_trains: new Map(), envss_deletions: new Map(), envss_hires: new Map(), v_field_hyg_events: new Map(), v_field_afm_events: new Map() };
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
  await page.evaluate(fix => { window.ENVSS_PROJLIST_FIXTURE = fix; window.ENVSS_PROJLIST_REVIEW = 0; }, fx);
  await page.reload({ waitUntil: "networkidle0" });
  await page.evaluate(fix => { window.ENVSS_PROJLIST_FIXTURE = fix; window.ENVSS_PROJLIST_REVIEW = 0; }, fx);
  await sleep(1500);
  await page.evaluate(() => { try { if (typeof render === "function") render(); } catch (e) {} });
  await sleep(400);
  return { page, ctx };
}

async function setMode(page, mode, openId) {
  await page.evaluate((m, id) => {
    window.ENVSS_PROJLIST_REVIEW = m;
    if (typeof view !== "undefined") {
      view.page = "dash";
      view.plrOpen = id || "";
      view.plrHideNone = false;
      view.plrCollapse = { nodate: true, test: true };
    }
    render();
  }, mode, openId || "");
  await sleep(400);
}

function shot(page, name, full) {
  const dest = path.join(OUT, name + ".png");
  return page.screenshot({ path: dest, fullPage: !!full }).then(() => { console.log("SHOT", dest); return dest; });
}

const names = [];
for (const vp of ["pixel7", "chromebook"]) {
  const { page, ctx } = await boot(vp);
  const title = await page.evaluate(() => (document.querySelector("h2") || {}).textContent || "");
  const cards = await page.evaluate(() => (document.querySelectorAll(".open-project, .card.open-project").length));
  const body = await page.evaluate(() => (document.querySelector("#app") || document.body).innerText.slice(0, 400));
  console.log(vp, "title=", title, "cards=", cards, "errs=", page.errs.slice(0, 3), "body=", body.replace(/\s+/g, " ").slice(0, 220));

  await shot(page, `current-${vp}`, false);
  await shot(page, `current-${vp}-full`, true);

  await setMode(page, 1);
  await shot(page, `a-${vp}`, false);
  await shot(page, `a-${vp}-full`, true);
  await setMode(page, 1, "podio-job-0019321");
  const ev = await page.$('[data-project="podio-job-0019321"]');
  if (ev) await ev.evaluate(el => el.scrollIntoView({ block: "center" }));
  await sleep(200);
  await shot(page, `a-${vp}-expanded-9321`, false);
  await setMode(page, 1, "podio-job-0018637");
  const ev2 = await page.$('[data-project="podio-job-0018637"]');
  if (ev2) await ev2.evaluate(el => el.scrollIntoView({ block: "center" }));
  await sleep(200);
  await shot(page, `a-${vp}-expanded-8637`, false);
  await setMode(page, 1, "podio-job-0019219");
  const ev21 = await page.$('[data-project="podio-job-0019219"]');
  if (ev21) await ev21.evaluate(el => el.scrollIntoView({ block: "center" }));
  await sleep(200);
  await shot(page, `a-${vp}-9219`, false);

  await setMode(page, 2);
  await shot(page, `b-${vp}`, false);
  await shot(page, `b-${vp}-full`, true);
  await setMode(page, 2, "podio-job-0019321");
  const ev3 = await page.$('[data-project="podio-job-0019321"]');
  if (ev3) await ev3.evaluate(el => el.scrollIntoView({ block: "center" }));
  await sleep(200);
  await shot(page, `b-${vp}-expanded-9321`, false);

  await ctx.close();
}

await browser.close();
server.close();
console.log("done");

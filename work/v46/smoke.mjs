import fs from "fs";
import { serve, launch, VIEWPORTS, mockSupabase, sleep } from "./harness.mjs";
const { server, base } = await serve();
const browser = await launch();
const projects = JSON.parse(fs.readFileSync("/tmp/projects_all.json"));
for (const vp of Object.keys(VIEWPORTS)) {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORTS[vp].viewport); await page.setUserAgent(VIEWPORTS[vp].ua);
  await page.setRequestInterception(true);
  const store = { envss_projects: new Map(projects.map(r => [r.id, r])) };
  mockSupabase(page, store);
  const errs = []; page.on("pageerror", e => errs.push(String(e))); page.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text()); });
  await page.goto(base + "/field.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("envss-field-auth-v45", JSON.stringify({access_token:"fake.at", refresh_token:"fake-rt", expires_at: Math.floor(Date.now()/1000)+3600, user:{id:"u-minah", email:"minah@envss.com.au", name:"Minah Munshi"}})); localStorage.setItem("envss-field-operator", JSON.stringify({name:"Minah Munshi", email:"minah@envss.com.au", source:"google", device:"Windows"})); });
  await page.reload({ waitUntil: "networkidle0" }); await sleep(2500);
  const r = await page.evaluate(() => ({ ver: document.getElementById("appVersion").textContent, gate: document.getElementById("loginGate") && document.getElementById("loginGate").className, dbProjects: db.projects.length, help: [...document.querySelectorAll(".help")].map(x=>x.textContent).find(t=>/active job/.test(t)), minah: [...document.querySelectorAll(".open-project")].filter(b=>/Minah/.test(b.textContent)).length, sync: (document.getElementById("syncBar")||{}).textContent }));
  console.log(vp, JSON.stringify(r), errs.slice(0,5));
  await page.screenshot({ path: "/tmp/v46-smoke-" + vp + ".png" });
  await page.close();
}
await browser.close(); server.close();

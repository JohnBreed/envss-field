/* Builds the Form 302 CoC xlsx with the app code at ROOT for the fixture event (fixed 'now') and writes it to OUT/<label>.xlsx.
   Used to compare the old format (live v48.18) with the new one. Usage: ROOT=<worktree> LABEL=before|after OUT=/tmp/cocfmt node work/v48-19/coc-format-compare.mjs */
import fs from "fs"; import path from "path";
import { serve, launch, VIEWPORTS, mockSupabase, sleep, SESSION } from "./harness.mjs";
import { fixture } from "./coc-fixture.mjs";
const OUT = process.env.OUT || "/tmp/cocfmt", LABEL = process.env.LABEL || "after"; fs.mkdirSync(OUT, { recursive: true });
const { server, base: url } = await serve();
const browser = await launch(["--host-resolver-rules=MAP *.supabase.co 127.0.0.1:9"]);
const page = await browser.newPage(); await page.setViewport(VIEWPORTS.chromebook.viewport);
await page.setRequestInterception(true); mockSupabase(page, {}, {});
page.on("dialog", async d => d.accept());
const fx = fixture(); const TAT = process.env.TAT || "standard"; fx.events[0].turnaround = TAT;
await page.goto(url + "/field.html", { waitUntil: "domcontentloaded" }); await page.evaluate(SESSION);
await page.evaluate(d => { localStorage.setItem("envss-field-next-v32", JSON.stringify(d)); }, fx);
await page.reload({ waitUntil: "networkidle0" }); await sleep(800);
await page.evaluate(d => { db.projects = d.projects; db.events = d.events; db.trains = JSON.parse(JSON.stringify(d.trains)); db.catalogs = Object.assign(db.catalogs || {}, d.catalogs); persist(); }, fx);
const b64 = await page.evaluate(async (TAT) => {
  const ev = eventById("eC"); window._v483CocScope = true;
  const out = await buildCocV45c(ev, { turnaround: TAT, now: new Date(2026, 10, 28, 16, 0, 0) });
  const u8 = new Uint8Array(out.buf); let s = ""; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s);
}, TAT);
fs.writeFileSync(path.join(OUT, LABEL + ".xlsx"), Buffer.from(b64, "base64"));
console.log("wrote", path.join(OUT, LABEL + ".xlsx"));
await browser.close(); server.close();

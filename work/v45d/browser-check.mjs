import fs from "fs";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
const puppeteer = await import(process.env.PUPPETEER_CORE || "/tmp/pw/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js").then(m => m.default || m);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = "/tmp/envss-v45d";
fs.mkdirSync(outDir, { recursive: true });

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  let p = path.join(root, decodeURIComponent(url.pathname));
  if (url.pathname === "/") p = path.join(root, "field.html");
  if (!p.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); res.end("missing"); return; }
    const ext = path.extname(p);
    const type = ext === ".html" ? "text/html" : ext === ".js" ? "text/javascript" : "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(buf);
  });
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1366,768"]
});
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });
const errors = [];
page.on("pageerror", e => errors.push(String(e)));
await page.goto("http://127.0.0.1:" + port + "/field.html", { waitUntil: "networkidle0", timeout: 60000 });
await page.waitForFunction(() => window.ExcelJS && window.buildCocV45c && window.envssPhotos && window.envssDrive, { timeout: 30000 });

const summary = await page.evaluate(async () => {
  function sample(id, extra) {
    return Object.assign({
      id, eventId: "e1", sampleNo: 1, trainKind: "airborne_static", mode: "static",
      mediaId: "IESS22", shiftDate: "2026-11-07",
      startAt: "2026-11-07T01:00:00.000Z", endAt: "2026-11-07T03:40:00.000Z",
      startFlow: "2", endFlow: "2", status: "ended", analyses: [], audit: []
    }, extra);
  }
  db.projects.push({ id: "p1", number: "0019333", name: "0019333-Example Client Pty Ltd-HYG-LPS-Example Primary School", source: "podio" });
  db.events.push({ id: "e1", projectId: "p1", code: "0019333-001", type: "hygiene", date: "2026-11-07", turnaround: "standard", stage: "planned" });
  const lead = [{ code: "PB", name: "Lead, inorganic dusts and fumes" }];
  db.trains.push(sample("t1", { sampleNo: 3, mediaId: "IESS22", analyses: lead }));
  db.trains.push(sample("tblank", { sampleNo: 1, trainKind: "blank", mode: "blank", mediaId: "IESS231", status: "field_blank", startAt: "", endAt: "", analyses: lead }));
  db.trains.push(sample("trej", { sampleNo: 2, trainKind: "blank", mode: "blank", mediaId: "IESS232", status: "rejected", rejectAsked: "yes", startAt: "", endAt: "", analyses: lead }));
  const one = await buildCocV45c(eventById("e1"), { turnaround: "standard", now: new Date("2026-11-08T05:54:00Z") });
  const names = ["Inhalable dust", "Respirable dust", "Crystalline silica", "Diesel particulate matter", "Welding fume", "Lead, inorganic dusts and fumes"];
  const codes = ["INH", "RES", "SIL", "DP", "WLD", "PB"];
  db.trains.forEach(t => { if (t.eventId === "e1") t.analyses = codes.map((c, i) => ({ code: c, name: names[i] })); });
  const many = await buildCocV45c(eventById("e1"), { turnaround: "standard", now: new Date("2026-11-08T05:54:00Z") });

  function b64(buf) {
    const u = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }

  /* compression: a 4032×3024 phone-like frame and a page of handwriting-sized text */
  async function bench(label, draw, qBefore) {
    const c = document.createElement("canvas");
    c.width = 4032; c.height = 3024;
    draw(c.getContext("2d"), c.width, c.height);
    const before = await new Promise(r => c.toBlob(r, "image/jpeg", qBefore));
    const url = URL.createObjectURL(before);
    const after = await envssPhotos.shrinkSrc(url);
    URL.revokeObjectURL(url);
    return { label, before: before.size, after: after.blob.size, w: after.w, h: after.h, maxPx: envssPhotos.maxPx, quality: envssPhotos.quality };
  }
  const photo = await bench("phone-like 4032x3024", (g, w, h) => {
    const img = g.createImageData(w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (i * 17 + (i >>> 3) * 13) & 255;
      d[i] = n; d[i + 1] = (n * 3) & 255; d[i + 2] = (n * 7) & 255; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.fillStyle = "#fff"; g.font = "bold 96px Arial";
    g.fillText("IESS231", 120, 500);
  }, 0.92);
  const doc = await bench("handwritten log", (g, w, h) => {
    g.fillStyle = "#f7f1e3"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#1a1a1a"; g.font = "72px Georgia";
    for (let i = 0; i < 28; i++) g.fillText("Daily log  line " + (i + 1) + "   IESS" + (200 + i) + "   2.0 L/min   07/11/2026", 80, 120 + i * 100);
  }, 0.92);

  openProject("p1");
  const text = document.body.innerText;
  return {
    version: document.getElementById("appVersion") && document.getElementById("appVersion").textContent,
    one: { names: one.analyteNames, widths: one.analyteWidths, bytes: one.buf.byteLength },
    many: { names: many.analyteNames, widths: many.analyteWidths, bytes: many.buf.byteLength },
    oneB64: b64(one.buf),
    manyB64: b64(many.buf),
    compress: [photo, doc],
    ui: {
      planned: text.includes("Planned in Podio"),
      refresh: text.includes("Refresh from Podio"),
      unplanned: text.includes("Start an event not in Podio"),
      viewport: { w: window.innerWidth, h: window.innerHeight }
    }
  };
});

fs.writeFileSync(path.join(outDir, "coc-1.xlsx"), Buffer.from(summary.oneB64, "base64"));
fs.writeFileSync(path.join(outDir, "coc-6.xlsx"), Buffer.from(summary.manyB64, "base64"));
delete summary.oneB64; delete summary.manyB64;

/* hire screen */
await page.evaluate(() => { if (window.openHireNew) openHireNew(); });
await new Promise(r => setTimeout(r, 300));
const hire = await page.evaluate(() => {
  const el = document.getElementById("hireSite");
  const groups = [...document.querySelectorAll("optgroup")].map(o => o.label);
  return { address: el ? el.value : "", firstGroup: groups[0] || "", most: groups.includes("Most used"), groups: groups.slice(0, 4) };
});
const flow = await page.evaluate(() => {
  localStorage.setItem("envss-podio-events-v45d", JSON.stringify({
    "0019333": { at: "2026-11-08", rows: [{ payload: {
      itemId: "900001933301", fieldCode: "0019333-009", reference: "0019333-009", jobNumber: "0019333",
      startDate: "2026-11-07", startStatus: "Site Works Start Date is now Confirmed", turnaround: "3_day",
      lab: "MPL Laboratories", siteContact: "School office 08 0000 0000",
      poc: { first: "Alex", last: "Nguyen", company: "Example Client Pty Ltd", role: "Site supervisor", phone: "0400 000 000", email: "alex@client.example" },
      task: "Lead dust monitoring at Example Primary School.", planned: true
    } }] }
  }));
  openProject("p1");
  const start = document.querySelector("[data-podio-start]");
  if (start) start.click();
  const ev = db.events.find(e => e.podioItemId === "900001933301");
  const fromPodio = ev ? { code: ev.code, date: ev.date, turnaround: ev.turnaround, lab: ev.lab, site: ev.siteContact, task: ev.taskDesc, unplanned: !!ev.podioUnplanned, poc: ev.poc && ev.poc.email, banner: document.body.innerText.includes("From Podio"), unplannedBanner: document.body.innerText.includes("Not in Podio yet") } : null;
  openProject("p1");
  document.getElementById("btnUnplanned") && document.getElementById("btnUnplanned").click();
  const create = document.getElementById("btnCreateEv");
  if (create) create.click();
  const made = db.events.filter(e => e.projectId === "p1" && e.podioUnplanned);
  return { fromPodio, unplannedCount: made.length, unplannedBanner: document.body.innerText.includes("Not in Podio yet - office to create/link") };
});
summary.flow = flow;
summary.hire = hire;
summary.pageErrors = errors;

await page.screenshot({ path: path.join(outDir, "hire-1366.png") });
await page.evaluate(() => openProject("p1"));
await new Promise(r => setTimeout(r, 200));
await page.screenshot({ path: path.join(outDir, "project-1366.png") });

fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ui: summary.ui, hire: summary.hire, compress: summary.compress, one: summary.one, many: summary.many, errors }, null, 2));
await browser.close();
server.close();

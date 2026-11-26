/* Render signed/unsigned TSI-layout PDFs via the live envssFit.buildReportPdf in Chrome. */
import fs from "fs";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.ROOT || path.resolve(__dir, "../..");
const OUT = process.env.OUT || "/workspace/fit-shots/v4812";
const PDF_LIB = "/tmp/pdflib/node_modules/pdf-lib/dist/pdf-lib.min.js";
const puppeteer = (await import("/tmp/pw/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;

fs.mkdirSync(OUT, { recursive: true });

const mime = {
  ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml",
  ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  let p;
  if (url.pathname === "/vendor/pdf-lib.min.js") p = PDF_LIB;
  else if (url.pathname === "/" || url.pathname === "/render.html") {
    res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
    res.end(`<!doctype html><meta charset="utf-8"><script src="/vendor/pdf-lib.min.js"></script><script src="/fit-test.js?v=48.13"></script>`);
    return;
  } else p = path.join(ROOT, decodeURIComponent(url.pathname));
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); res.end("missing"); return; }
    res.writeHead(200, { "Content-Type": mime[path.extname(p)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(buf);
  });
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port;

const ocrText = fs.readFileSync(path.join(ROOT, "work/v48-11/fixtures/frj2elok0-ocr.txt"), "utf8");
const sigTech = "data:image/png;base64," + fs.readFileSync("/tmp/sig-tech.png").toString("base64");
const sigClient = "data:image/png;base64," + fs.readFileSync("/tmp/sig-client.png").toString("base64");

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage();
page.on("pageerror", e => console.error("pageerror", e));
page.on("console", m => { if (m.type() === "error") console.error("console", m.text()); });
await page.goto(base + "/render.html", { waitUntil: "networkidle0", timeout: 30000 });
const ready = await page.evaluate(() => !!(window.envssFit && envssFit.buildReportPdf && window.PDFLib));
if (!ready) {
  const info = await page.evaluate(() => ({ fit: !!(window.envssFit), pdf: typeof PDFLib, keys: window.envssFit && Object.keys(window.envssFit) }));
  throw new Error("envssFit/PDFLib not ready " + JSON.stringify(info));
}

async function renderOne(signed) {
  const result = await page.evaluate(async (ocrText, sigTech, sigClient, signed) => {
    const parsed = envssFit.parseReport(ocrText);
    const rep = Object.assign({}, parsed.fields);
    rep.approval = rep.approval || "";
    rep.note = rep.note || "";
    rep.sigTech = sigTech;
    rep.sigClient = sigClient;
    rep.signedAt = "2026-11-25T08:00:00.000Z";
    const out = await envssFit.buildReportPdf(rep, { signed });
    const buf = new Uint8Array(await out.blob.arrayBuffer());
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) bin += String.fromCharCode.apply(null, buf.subarray(i, i + chunk));
    return { name: out.name, bytes: out.bytes, b64: btoa(bin) };
  }, ocrText, sigTech, sigClient, signed);
  const dest = path.join(OUT, result.name);
  fs.writeFileSync(dest, Buffer.from(result.b64, "base64"));
  return { dest, name: result.name, bytes: result.bytes };
}

const signed = await renderOne(true);
const unsigned = await renderOne(false);
await browser.close();
server.close();

function raster(pdfPath, prefix) {
  execSync("pdftoppm -png -r 140 " + JSON.stringify(pdfPath) + " " + JSON.stringify(prefix), { stdio: "inherit" });
}
raster(signed.dest, path.join(OUT, "signed"));
raster(unsigned.dest, path.join(OUT, "unsigned"));

/* pdftoppm writes signed-1.png for a one-page doc; copy to signed.png / unsigned.png */
function onePage(prefix, want) {
  const p1 = prefix + "-1.png";
  const p0 = prefix + ".png";
  if (fs.existsSync(p1)) fs.copyFileSync(p1, path.join(OUT, want));
  else if (fs.existsSync(p0)) fs.copyFileSync(p0, path.join(OUT, want));
  else throw new Error("missing raster " + prefix);
}
onePage(path.join(OUT, "signed"), "signed.png");
onePage(path.join(OUT, "unsigned"), "unsigned.png");

function info(pdf) {
  const txt = execSync("pdftotext -layout " + JSON.stringify(pdf) + " -", { encoding: "utf8" });
  const meta = execSync("pdfinfo " + JSON.stringify(pdf), { encoding: "utf8" });
  return { txt, pages: +((/Pages:\s*(\d+)/.exec(meta) || [])[1] || 0), meta };
}
const sInfo = info(signed.dest);
const uInfo = info(unsigned.dest);
fs.writeFileSync(path.join(OUT, "signed.txt"), sInfo.txt);
fs.writeFileSync(path.join(OUT, "unsigned.txt"), uInfo.txt);
console.log(JSON.stringify({
  signed: { file: signed.dest, bytes: signed.bytes, pages: sInfo.pages },
  unsigned: { file: unsigned.dest, bytes: unsigned.bytes, pages: uInfo.pages }
}, null, 2));
console.log("--- signed text ---");
console.log(sInfo.txt);
console.log("--- unsigned text ---");
console.log(uInfo.txt);

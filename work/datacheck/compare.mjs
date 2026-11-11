import fs from "fs";
const [,, a, b] = process.argv;
const A = JSON.parse(fs.readFileSync(a)), B = JSON.parse(fs.readFileSync(b));
const key = x => x.t + "|" + x.id;
const ma = new Map(A.map(x => [key(x), x])), mb = new Map(B.map(x => [key(x), x]));
const tables = [...new Set(A.concat(B).map(x => x.t))].sort();
const mask = s => s ? String(s).replace(/^(.)[^@]*@/, "$1***@") : "";
const out = { from: a, to: b, at_b: B[0] && B[0].at, tables: {} };
for (const t of tables) {
  const ra = A.filter(x => x.t === t), rb = B.filter(x => x.t === t);
  const missing = ra.filter(x => !mb.has(key(x))).map(x => x.id);
  const added = rb.filter(x => !ma.has(key(x))).map(x => ({ id: x.id, upd: x.upd, by: mask(x.updated_by) }));
  const changed = ra.filter(x => mb.has(key(x)) && mb.get(key(x)).h !== x.h).map(x => ({ id: x.id, upd_before: x.upd, upd_after: mb.get(key(x)).upd, by_after: mask(mb.get(key(x)).updated_by) }));
  const maxA = ra.map(x => x.upd).filter(Boolean).sort().pop() || null, maxB = rb.map(x => x.upd).filter(Boolean).sort().pop() || null;
  out.tables[t] = { before: ra.length, after: rb.length, missing, added, changed, max_upd_before: maxA, max_upd_after: maxB, unchanged: ra.length - missing.length - changed.length };
}
console.log(JSON.stringify(out, null, 1));

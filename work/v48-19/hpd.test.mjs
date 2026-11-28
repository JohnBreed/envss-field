/* v48.19 HPD unit tests (pure helpers in hpd.js + the library). Usage: node work/v48-19/hpd.test.mjs   No browser, no network. */
import fs from "fs"; import path from "path"; import vm from "vm"; import { fileURLToPath } from "url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sandbox = { document: { readyState: "loading", addEventListener() {} }, navigator: {}, console, addEventListener() {} };
sandbox.globalThis = sandbox; sandbox.window = sandbox; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, "hpd-library.js"), "utf8"), sandbox);
vm.runInContext(fs.readFileSync(path.join(root, "hpd.js"), "utf8"), sandbox);
const H = sandbox.ENVSS_HPD, LIB = sandbox.ENVSS_HPD_LIB.products;
let fails = 0; const res = [];
function check(n, ok, d) { res.push({ name: n, ok: !!ok, detail: ok ? "" : String(d || "") }); if (!ok) fails++; console.log((ok ? "PASS" : "FAIL") + "  " + n + (ok ? "" : " — " + d)); }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* library integrity */
check("library has 55 products", LIB.length === 55, LIB.length);
check("ids unique", new Set(LIB.map(p => p.id)).size === LIB.length);
check("every product: class matches the SLC80 band (Table E1)", LIB.every(p => H.classOfSlc(p.slc) === p.cls), LIB.filter(p => H.classOfSlc(p.slc) !== p.cls).map(p => p.id));
check("manufacturer-basis rows carry a source link", LIB.filter(p => p.basis === "mfr").every(p => /^https:\/\//.test(p.src)));
check("rows with no manufacturer value are flagged check", LIB.filter(p => p.basis !== "mfr").every(p => p.check));
check("SuperFit uses the manufacturer 24 dB (reports say 23 or 24)", H.byId(LIB.find(p => p.k === "3m-superfit").id).slc === 24);
check("Yellow Neons: class follows the 23 dB band (4), not the report's 5", LIB.find(p => p.k === "3m-yellow-neons").cls === 4);

/* class bands */
check("classOfSlc bands", [[9, null], [10, 1], [13, 1], [14, 2], [17, 2], [18, 3], [21, 3], [22, 4], [25, 4], [26, 5], [34, 5]].every(([s, c]) => H.classOfSlc(s) === c));
check("classNeeded (Table A1, Lcrit 85)", [[84.9, 0], [85, 1], [89.9, 1], [90, 2], [94.9, 2], [95, 3], [99.9, 3], [100, 4], [104.9, 4], [105, 5], [109.9, 5]].every(([l, c]) => H.classNeeded(l) === c) && H.classNeeded(110) === null && H.classNeeded("") === undefined);

/* assess */
let a = H.assess({ cls: 4, slc: 24, laeq: 90 });
check("assess: LAeq 90, SLC80 24 -> 66 dB, over-protection note (<=70)", a.eff === 66 && a.status === "over" && a.effBasis === "LAeq", JSON.stringify(a));
a = H.assess({ cls: 5, slc: 29, laeq: 90 });
check("assess: matches report 0019037 (90 - 29 = 61)", a.eff === 61, a.eff);
a = H.assess({ cls: 4, slc: 24, laeq: 112, lceq: 114 });
check("assess: LCeq wins over LAeq; >=110 asks for octave band", a.effBasis === "LCeq" && a.eff === 90 && a.status === "inadequate" && a.notes.some(n => /octave-band/.test(n)), JSON.stringify(a));
a = H.assess({ cls: 3, slc: 21, laeq: 96 });
check("assess: Class 3 < Class 3 needed? (96 needs 3: ok)", /meets the Class 3/.test(a.notes[0]) && a.eff === 75 && a.status === "ok", JSON.stringify(a));
a = H.assess({ cls: 4, slc: 24, laeq: 99, lcpeak: 141 });
check("assess: LCpeak >= 140 needs Class 5 -> inadequate", a.peakFail === true && a.status === "inadequate");
a = H.assess({ cls: 5, slc: 26, laeq: 99, lcpeak: 141 });
check("assess: Class 5 with peak is fine", !a.peakFail && a.status === "ok");
a = H.assess({ cls: null, slc: null, laeq: 99 });
check("assess: no class/SLC80 -> unknown, no number", a.status === "unknown" && a.eff === null);
a = H.assess({ cls: 4, laeq: 99 });
check("assess: class only (no SLC80): class check, no dB number", a.eff === null && a.status === "ok");
check("assess: effective 85 or more is inadequate", H.assess({ slc: 20, laeq: 105 }).status === "inadequate");
check("assess: exactly 70 is flagged over-protection (cl 6.2.2 'or less')", H.assess({ slc: 20, laeq: 90 }).status === "over");

/* search */
check("search 'superfit' finds 3M SuperFit first", H.search("superfit")[0].k === "3m-superfit");
check("search 'super fit' (two words)", H.search("super fit").some(p => p.k === "3m-superfit"));
check("search 'peltor h505b'", H.search("peltor h505b").length === 1);
check("search is accent/case blind: 'WÜRTH x100'", H.search("WÜRTH x100").some(p => p.k === "wurth-x100"));
check("search empty -> []", H.search("").length === 0 && H.search("zzzzqq").length === 0);

/* OCR suggestions */
let s = H.suggest("3M E-A-Rsoft\nSuperFit\nDisposable Earplugs\nClass 4 SLC80 24 dB\nAS/NZS 1270");
check("suggest: SuperFit box text", LIB.find(p => p.id === s.suggest[0].id).k === "3m-superfit" && s.printed.cls === 4 && s.printed.slc === 24, JSON.stringify(s));
s = H.suggest("MOLDEX SparkPlugs 6604 class 5 SLC80 29dB");
check("suggest: Moldex SparkPlugs", LIB.find(p => p.id === s.suggest[0].id).k === "moldex-6604" && s.printed.slc === 29);
s = H.suggest("Howard Leight by Honeywell MAX Lite LPF-1 Class 4 SLC80 25 dB");
check("suggest: Max Lite beats Max (numbers and phrase)", LIB.find(p => p.id === s.suggest[0].id).k === "hl-maxlite", JSON.stringify(s.suggest.map(x => LIB.find(p => p.id === x.id).k)));
s = H.suggest("Super Fit 24 dB");
check("suggest: OCR split 'Super Fit' still matches", s.suggest.length && LIB.find(p => p.id === s.suggest[0].id).k === "3m-superfit");
s = H.suggest("Random box of gloves nitrile size M");
check("suggest: unrelated text -> nothing", s.suggest.length === 0);
s = H.suggest("");
check("suggest: empty text -> nothing", s.suggest.length === 0);

/* item values + mismatch */
const p26 = LIB.find(p => p.k === "3m-skull-screws");
let it = { libId: p26.id, boxClass: "", boxSlc80: "" };
check("itemValues: library", H.itemValues(it).slc === 26 && H.itemValues(it).src === "manufacturer");
it.boxSlc80 = "27";
check("itemValues: box wins and class follows", H.itemValues(it).slc === 27 && H.itemValues(it).cls === 5 && H.itemValues(it).src === "box");
check("boxMismatch text when box differs from the library", /box says 27 dB but the library has 26 dB/.test(H.boxMismatch(it)));
check("itemValues: Class on the box that does not fit the SLC80 -> SLC80 wins, warning names it", (() => { const x = { libId: p26.id, boxClass: "4", boxSlc80: "27" }; return H.itemValues(x).cls === 5 && /Class 4 and 27 dB do not go together \(27 dB is Class 5\)/.test(H.boxMismatch(x)); })());
check("boxMismatch works for free-text items too", /do not go together/.test(H.boxMismatch({ other: true, boxClass: "2", boxSlc80: "30" })));
check("boxMismatch empty when same", H.boxMismatch({ libId: p26.id, boxSlc80: "26", boxClass: "5" }) === "");
check("itemValues: free text item with nothing -> nulls", (() => { const v = H.itemValues({ other: true, name: "Mystery plug" }); return v.cls == null && v.slc == null; })());

/* applies to / summary */
const noiseEv = { id: "e1", type: "noise", code: "0019919-002" };
check("appliesTo: noise event", H.appliesTo(noiseEv, []));
check("appliesTo: ACA NSED codes", H.appliesTo({ id: "e2", type: "hygiene", code: "x", podioEventKind: "noise" }, []));
check("appliesTo: hygiene event with a noise sample", H.appliesTo({ id: "e3", type: "hygiene", code: "x" }, [{ trainKind: "noise_personal" }]));
check("appliesTo: airborne only -> no", !H.appliesTo({ id: "e4", type: "hygiene", code: "x" }, [{ trainKind: "airborne_static" }]));
check("appliesTo: fibre / fit / vent -> no", !H.appliesTo({ type: "fibre" }, [{ trainKind: "noise_personal" }]) && !H.appliesTo({ type: "hygiene", code: "0019919-FIT-001" }, []) && !H.appliesTo({ type: "hygiene", code: "x", podioEventKind: "vent" }, []));
check("summary states", H.summary({}).state === "none" && H.summary({ hpd: { status: "none_onsite", items: [] } }).state === "none_onsite" && H.summary({ hpd: { items: [{ libId: "" }, { libId: "HPD-001" }] } }).text === "2 products · 1 to identify");

fs.writeFileSync(path.join(root, "work/v48-19/hpd-test-results.json"), JSON.stringify({ at: new Date().toISOString(), total: res.length, failed: fails, results: res }, null, 1));
console.log(fails ? fails + " FAILED" : "ALL " + res.length + " PASSED"); process.exit(fails ? 1 : 0);

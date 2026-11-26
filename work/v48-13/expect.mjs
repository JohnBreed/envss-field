/* Expected values for the 25 Nov 2026 TSI reference photo (same values the v48.11 Vision tests check). */
export function fieldChecks(f, exercises) {
  const ex = exercises || f.exercises || [];
  const ffOf = e => (e && (e.fitFactorRaw || (e.fitFactor && e.fitFactor.raw))) || "";
  const exS = (i, name, dur) => { const e = ex[i] || {}; return e.exercise === name && String(e.duration) === dur && ffOf(e) === "200+" && e.pass === "yes"; };
  const date = v => (v && typeof v === "object" ? v.display : v) || "";
  return [
    ["ID number", f.idNumber === "ENVSS1", f.idNumber], ["Last name", f.lastName === "Breed", f.lastName], ["First name", f.firstName === "John", f.firstName],
    ["Company", f.company === "ENVSS", f.company], ["Location", f.location === "Various", f.location],
    ["Test date", (f.testDateDisplay || date(f.testDate)) === "25/11/2026", f.testDateDisplay || date(f.testDate)], ["Test time", f.testTime === "10:45", f.testTime],
    ["Due date", (f.dueDateDisplay || date(f.dueDate)) === "25/11/2027", f.dueDateDisplay || date(f.dueDate)],
    ["PortaCount S/N", f.portaCountSn === "8048192704", f.portaCountSn], ["N95-Companion", /^yes$/i.test(f.n95Companion || ""), f.n95Companion],
    ["Respirator", /^3M Aura 9322A\+ Disposable P2 Flat-fold, 3-panel de/.test(f.respirator || ""), f.respirator],
    ["Manufacturer", f.manufacturer === "3M", f.manufacturer], ["Model", f.model === "Aura 9322A+", f.model],
    ["Respirator style", /^Disposable P2 Flat-fold, 3-panel design with exhalation valve$/.test(f.respiratorStyle || ""), f.respiratorStyle],
    ["Respirator size", f.respiratorSize === "One Size", f.respiratorSize], ["Protocol", f.protocol === "OSHA FAST-FILTERING FACE", f.protocol],
    ["Pass level", String(f.passLevel) === "100", f.passLevel], ["Approval (blank)", !f.approval, f.approval], ["Efficiency", /^yes$/i.test(f.efficiency || ""), f.efficiency],
    ["Exercise 1 BENDING OVER 50 200+ Yes", exS(0, "BENDING OVER", "50"), JSON.stringify(ex[0] || null)],
    ["Exercise 2 TALKING 30 200+ Yes", exS(1, "TALKING", "30"), JSON.stringify(ex[1] || null)],
    ["Exercise 3 HEAD SIDE TO SIDE 30 200+ Yes", exS(2, "HEAD SIDE TO SIDE", "30"), JSON.stringify(ex[2] || null)],
    ["Exercise 4 HEAD UP AND DOWN 30 200+ Yes", exS(3, "HEAD UP AND DOWN", "30"), JSON.stringify(ex[3] || null)],
    ["Overall FF 200+", (typeof f.overallFf === "object" ? (f.overallFf || {}).raw : f.overallFf) === "200+", typeof f.overallFf === "object" ? JSON.stringify(f.overallFf) : f.overallFf],
    ["Result PASS", f.result === "PASS", f.result],
    ["Fit-test operator EA", f.operator === "EA", f.operator], ["Name on report John Breed", f.operatorName === "John Breed", f.operatorName], ["Note (blank)", !f.note, f.note]
  ].map(c => ({ field: c[0], ok: !!c[1], got: c[2] == null ? "" : String(c[2]) }));
}

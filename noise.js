/* ENVSS Field — noise module (noise.js).
   Split out of field.html in v46 (John, 11 Nov 2026) with no change in behaviour, so noise can be refreshed on its own.
   Loaded by field.html straight after config.js; cached by sw-field.js and always re-checked with the server when online.

   Stable interface this module uses from the core app (window.envssCore, defined by field.html):
     db() · save() · saveQuiet() · audit(t, action, detail) · photos (envssPhotos) · sync (envssSync)
     operator() / who() · captureLocation() · render() · esc() · yn() · view() · trainsOf(eventId) · eventById(id)
     isNoise(t) · isStatic(t) · isBlank(t)
   What the core app calls in here (window.ENVSS_NOISE):
     version · rejects() · startGaps(t) · equipHtml(t) · hpdFields(t) · installTrainLayer()
   Field blanks and airborne flows stay in the core app. */
(function (g) {
  "use strict";
  const NOISE_VERSION = "46.0";
  const C = () => g.envssCore || {};
  const esc = s => (C().esc || g.esc)(s);

  /* noise fault reasons (was noiseRejects() in field.html) */
  function rejects() {
    return [
      { code: "battery_fault", label: "Battery fault", photo: false },
      { code: "measurement_fault", label: "Measurement fault", photo: false }
    ];
  }

  /* START gate for noise (B10). Noise personal: dosimeter serial, first name, last name, occupation.
     Noise static: dosimeter serial, location. Returns the missing labels. */
  function startGaps(t) {
    const miss = [];
    if (!t.dosimeterSerial) miss.push("Dosimeter serial");
    if (C().isStatic(t)) { if (!t.location) miss.push("Location"); }
    else {
      if (!t.person?.first) miss.push("First name");
      if (!t.person?.last) miss.push("Last name");
      if (!String(t.person?.occupation || "").trim()) miss.push("Occupation");
    }
    return miss;
  }

  /* dosimeter + field calibrator inputs on the sample screen (left column) */
  function equipHtml(t) {
    return `
          <label>Dosimeter serial</label>
          <div class="combo">
            <input id="dosimeter" value="${esc(t.dosimeterSerial)}" placeholder="Badge serial">
            <div class="suggest" id="sug-dosimeter"></div>
          </div>
          <p class="help">Serial on the badge (not the noise sample number).</p>
          <label>Field calibrator</label>
          <div class="combo">
            <input id="fieldCal" value="${esc(t.fieldCalibrator || "")}" placeholder="Acoustic calibrator serial" autocomplete="off">
            <div class="suggest" id="sug-fieldCal"></div>
          </div>
          <p class="help">Acoustic calibrator used for the dosimeter field calibration check.</p>`;
  }

  /* hearing protection (noise personal only). Not carried across a person's samples. */
  function hpdFields(t) {
    const yn = C().yn || g.yn;
    const h = t.hpd || {};
    const asked = t.hpdAsked || "";
    const on = asked === "yes";
    return `<div class="${asked ? "" : "need-yn"}">
      <label>Hearing protection worn?</label>
      ${yn("hpd", asked, [["yes","Yes"],["no","No"],["unknown","Unknown"]])}
    </div>
    <div id="hpdBox" style="${on ? "" : "display:none"}">
      <label>Brand / model</label>
      <input id="hpdModel" value="${esc(h.model)}" placeholder="Brand model or Unknown">
      <label>Style</label>
      <input id="hpdStyle" value="${esc(h.style)}" placeholder="earmuff / earplug">
      <label>Class / attenuation</label>
      <input id="hpdClass" value="${esc(h.classRating)}" placeholder="e.g. Class 4 / SLC80 or Unknown">
    </div>`;
  }

  /* v41 (moved): noise samples have no analyses. The "Add analysis" box is not shown for noise (personal or static);
     the contaminant stays NOISE (a stray analysis picked earlier is kept on the record, hidden, and never becomes the
     contaminant). Installed by field.html at the same point in its screen layers as before. */
  function installTrainLayer() {
    const c = C();
    function fixNoise(t) { if (t && c.isNoise(t) && !c.isBlank(t) && (t.trainKind || "").startsWith("noise") && t.contaminantId !== "NOISE") { t.contaminantId = "NOISE"; return true; } return false; }
    const _th41 = g.trainHtml;
    g.trainHtml = function () {
      let html = _th41.apply(this, arguments);
      const v = c.view();
      const t = c.db().trains.find(x => x.id === v.trainId);
      if (t && c.isNoise(t)) { fixNoise(t); const tp = document.createElement("template"); tp.innerHTML = html; tp.content.querySelectorAll(".analysis-box").forEach(e => e.remove()); html = tp.innerHTML; }
      return html;
    };
    try { let n = 0; (c.db().trains || []).forEach(t => { if (fixNoise(t)) n++; }); if (n) c.saveQuiet(); } catch (e) { console.warn("noise.js v41", e); }
  }

  g.ENVSS_NOISE = { version: NOISE_VERSION, loaded: true, rejects, startGaps, equipHtml, hpdFields, installTrainLayer };
})(window);

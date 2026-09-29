function hygieneTrainHtml() {
  const t = db.trains.find(x => x.id === view.trainId);
  if (!t) return `<div class="wrap">Missing sample train.</div>`;
  const ev = eventById(t.eventId);
  const c = contam(t.contaminantId);
  const running = t.status === "running";
  const ended = t.status === "ended" || t.status === "uploaded";
  const mins = runtimeMinutes(t);
  const avg = avgFlow(t);
  const vol = volumeLitres(t);
  const chk = flowCheck(t);
  const audit = t.audit || [];
  return `
    <div class="wrap">
      <button class="btn ghost" onclick="leaveSample('${t.id}','${t.eventId}')">← ${ev ? ev.code : "Event"}</button>
      <div class="row" style="margin-top:10px">
        <h2 class="brand-type" style="margin:0;color:var(--navy)">${displayNo(t)}</h2>
        ${badge(displayStatus(t))}
      </div>
      <label>Sample train type</label>
      <select id="trainKind">${trainKindOptions(t)}</select>
      <label>Shift date</label>
      <input id="shiftDate" type="date" value="${esc(t.shiftDate || (ev && ev.date) || "")}">
      <label>Shift</label>
      <div class="filters" id="shiftKind">
        ${[["day","Day"],["afternoon","Afternoon"],["night","Night"]].map(([v,l]) =>
          `<button type="button" class="chip ${(t.shiftKind||"day")===v?"on":""}" data-shift="${v}">${l}</button>`).join("")}
      </div>
      <input type="hidden" id="mode" value="${esc(t.mode || "personal")}">
      <div class="grid2">
        <div>
          <label>${isNoise(t) ? "Noise Dosimeter Number" : "Sample No."}</label>
          <input id="pouch" value="${esc(String(t.sampleNo || t.pouch || ""))}">
          <label>Contaminant</label>
          ${isNoise(t) ? `<input value="NOISE — Noise dose" disabled>` : `<div class="combo">
            <input id="contam" value="${esc(c ? c.code + " — " + c.name : "")}" placeholder="INH, SIL, DP, WLD, ASB">
            <div class="suggest" id="sug-contam"></div>
          </div>`}
          ${isNoise(t) ? `
          <label>Dosimeter serial</label>
          <div class="combo">
            <input id="dosimeter" value="${esc(t.dosimeterSerial)}" placeholder="Badge serial">
            <div class="suggest" id="sug-dosimeter"></div>
          </div>` : isBlank(t) ? `
          <label>Sample head</label>
          <input id="head" value="${esc(t.headId)}">
          <label>Cassette / filter / tube</label>
          <input id="media" value="${esc(t.mediaId)}">` : `
          <label>Pump serial</label>
          <input id="pump" value="${esc(t.pumpSerial)}" placeholder="Type serial">
          <div class="suggest" id="sug-pump"></div>
          <label>Sample head</label>
          <input id="head" value="${esc(t.headId)}">
          <label>Cassette / filter / tube</label>
          <input id="media" value="${esc(t.mediaId)}">`}
        </div>
        <div>
          ${isBlank(t) || isNoise(t) ? "" : `
          <label>Start flow (L/min)</label>
          <input id="startFlow" value="${esc(t.startFlow)}" inputmode="decimal">
          <label>End flow (L/min)</label>
          <input id="endFlow" value="${esc(t.endFlow)}" inputmode="decimal">
          <label>Average flow (L/min)</label>
          <input value="${t.endFlow && avg != null ? avg.toFixed(3) : "—"}" disabled>
          <label>Runtime</label>
          <input value="${mins == null ? "—" : mins.toFixed(1) + " min"}" disabled>
          <label>Volume sampled (L)</label>
          <input value="${t.endFlow && vol != null ? vol.toFixed(1) : "—"}" disabled>`}
        </div>
      </div>
      <div id="modeFields">${isBlank(t) ? "" : modeFields(t)}</div>
      ${isBlank(t) ? "" : `
      <div class="times" style="margin-top:8px">
        <div><label>Start time</label><input id="startAt" type="time" value="${toLocalInput(t.startAt)}"></div>
        <div><label>Stop time</label><input id="endAt" type="time" value="${toLocalInput(t.endAt)}"></div>
      </div>
      <div class="startstop">
        <button class="btn orange lg" id="btnStart" ${running||t.status==="rejected"?"disabled":""}>START</button>
        <button class="btn green lg" id="btnStop" ${!running?"disabled":""}>STOP</button>
      </div>`}
      ${isBlank(t) ? "" : followUpHtml(t)}
      ${typeof isAirbornePersonal === "function" && isAirbornePersonal(t) ? rpdFields(t) : ""}
      ${isNoise(t) && !isStatic(t) ? hpdFields(t) : ""}
      ${isBlank(t) ? "" : commentHtml(t)}
      <div class="footer-actions">
        <button class="btn danger" id="btnDelete" type="button" onclick="event.stopPropagation(); deleteSample('${t.id}')">Delete sample</button>
      </div>
    </div>`;
}
window.ENVSS_FIBRE = "41";
trainHtml = function () {
  const t = db.trains.find(function (x) { return x.id === view.trainId; });
  if (!t) return "<div class=\"wrap\">Missing sample.</div>";
  const ev = eventById(t.eventId);
  const afm = (ev && ev.type === "fibre") || String((ev && ev.code) || "").indexOf("AFM") !== -1 || (t.trainKind || "").indexOf("fibre") === 0;
  if (afm || (typeof isFibreTrain === "function" && isFibreTrain(t))) return fibreTrainHtml(t, ev);
  return hygieneTrainHtml();
};
if (typeof render === "function") render();

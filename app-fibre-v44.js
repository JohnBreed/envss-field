window.ENVSS_FIBRE = "44";

function gpsLines(t) {
  function line(label, loc) {
    if (!loc || loc.lat == null || loc.lng == null) return "<p class=\"help\">" + label + ": no GPS fix yet</p>";
    var acc = loc.acc != null ? " ±" + Math.round(Number(loc.acc)) + " m" : "";
    return "<p class=\"help\">" + label + " " + Number(loc.lat).toFixed(5) + ", " + Number(loc.lng).toFixed(5) + acc + "</p>";
  }
  return "<div id=\"gpsBlock\">" + line("Start location", t.startLoc) + line("Stop location", t.endLoc) + "</div>";
}

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
        <div class="menu-wrap">
          <button class="btn ghost" type="button" id="btnSampleMenu">☰</button>
          <div class="menu" id="sampleMenu" hidden>
            ${isNoise(t) ? `<button type="button" id="btnAddPump">Add this dosimeter to fleet</button>` : isBlank(t) ? "" : `<button type="button" id="btnAddPump">Add this pump to fleet</button>`}
            ${isNoise(t) || isBlank(t) ? "" : `<button type="button" id="btnAddHead">Add this sample head to fleet</button>`}
            <button type="button" onclick="window.print()">Print</button>
          </div>
        </div>
      </div>
      <label>Sample train type</label>
      <select id="trainKind">${trainKindOptions(t)}</select>
      <p class="help">${isNoise(t)
        ? "Noise trains can switch personal ↔ static only."
        : "Airborne and field blank can switch between personal, static and blank."}</p>
      <label>Shift date</label>
      <input id="shiftDate" type="date" value="${esc(t.shiftDate || (ev && ev.date) || "")}">
      <label>Shift</label>
      <div class="filters" id="shiftKind">
        ${[["day","Day"],["afternoon","Afternoon"],["night","Night"]].map(([v,l]) =>
          `<button type="button" class="chip ${(t.shiftKind||"day")===v?"on":""}" data-shift="${v}">${l}</button>`).join("")}
      </div>
      <p class="help">Prepped trains can be moved to another date or shift. Sample number does not change.</p>
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
          <div class="combo">
            <input id="head" value="${esc(t.headId)}" placeholder="IESS… / RESS… / DP…">
            <div class="suggest" id="sug-head"></div>
          </div>
          <label>Cassette / filter / tube</label>
          <input id="media" value="${esc(t.mediaId)}">` : `
          <label>Pump serial</label>
          <div class="combo">
            <input id="pump" value="${esc(t.pumpSerial)}" placeholder="Type serial — fleet or hire">
            <div class="suggest" id="sug-pump"></div>
          </div>
          <label>Sample head</label>
          <div class="combo">
            <input id="head" value="${esc(t.headId)}" placeholder="IESS… / RESS… / DP…">
            <div class="suggest" id="sug-head"></div>
          </div>
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
          <input value="${t.endFlow && vol != null ? vol.toFixed(1) : "—"}" disabled>
          <label class="check-row"><input type="checkbox" id="methodOn" ${t.methodOn || t.desiredVolumeL || t.minMinutes ? "checked" : ""}> Method minimum volume or minutes</label>
          <div id="methodBox" style="${t.methodOn || t.desiredVolumeL || t.minMinutes ? "" : "display:none"}">
            <label>Desired / method minimum volume (L)</label>
            <input id="desiredVolume" value="${esc(t.desiredVolumeL || "")}" inputmode="decimal">
            <label>Method minimum minutes</label>
            <input id="minMinutes" value="${esc(t.minMinutes || "")}" inputmode="decimal">
          </div>`}
        </div>
      </div>
      ${!isBlank(t) && !isNoise(t) && chk.pct != null ? `<p class="${chk.ok ? "muted" : ""}" style="${chk.ok ? "" : "color:var(--danger);font-weight:700"}">
        End flow is ${chk.pct.toFixed(1)}% from start. Tolerance ±${chk.tol}%.
        ${chk.ok ? "Within tolerance." : "Outside tolerance — reject unless you have a documented reason."}
      </p>` : ""}
      <div id="modeFields">${isBlank(t) ? "" : modeFields(t)}</div>
      ${isBlank(t) ? "" : mineCodesHtml(t)}
      ${isBlank(t) ? "" : `
      <div class="times" style="margin-top:8px">
        <div>
          <label>Start time</label>
          <input id="startAt" type="time" value="${toLocalInput(t.startAt)}">
        </div>
        <div>
          <label>Stop time</label>
          <input id="endAt" type="time" value="${toLocalInput(t.endAt)}">
        </div>
      </div>
      <div class="startstop">
        <button class="btn orange lg" id="btnStart" ${running||t.status==="rejected"?"disabled":""}>START</button>
        <button class="btn green lg" id="btnStop" ${!running?"disabled":""}>STOP</button>
      </div>
      <p class="help">Accidental START/STOP: edit the times. Leaving the field saves it. Location is stored when START or STOP gets a GPS fix.</p>
      ${gpsLines(t)}
      `}
      ${isBlank(t) ? "" : followUpHtml(t)}
      ${isAirbornePersonal(t) ? rpdFields(t) : ""}
      ${isNoise(t) && !isStatic(t) ? hpdFields(t) : ""}
      ${isBlank(t) ? "" : commentHtml(t)}
      <div class="footer-actions">
        <button class="btn danger" id="btnDelete" type="button" onclick="event.stopPropagation(); deleteSample('${t.id}')">Delete sample</button>
      </div>
      <h3 class="brand-type" style="color:var(--navy);margin-top:22px;cursor:pointer" id="auditToggle">Audit log</h3>
      <div id="auditBox">
      ${audit.length ? `<div class="card">${audit.slice().reverse().map(a =>
        `<div class="muted" style="margin-bottom:6px">${fmtTime(a.at)} · ${esc(a.who || "")} · ${esc(a.action)}${a.detail ? " · " + esc(a.detail) : ""}</div>`
      ).join("")}</div>` : `<p class="muted">No edits yet.</p>`}
      </div>
    </div>`;
}


trainHtml = function () {
  const t = db.trains.find(function (x) { return x.id === view.trainId; });
  if (!t) return "<div class=\"wrap\">Missing sample.</div>";
  const ev = eventById(t.eventId);
  if ((typeof isAfmEvent === "function" && isAfmEvent(ev)) || (typeof isFibreTrain === "function" && isFibreTrain(t))) {
    return typeof fibreTrainHtml === "function" ? fibreTrainHtml(t, ev) : hygieneTrainHtml();
  }
  return hygieneTrainHtml();
};

const _mineCodes44 = mineCodesHtml;
mineCodesHtml = function (t) {
  var html = _mineCodes44(t);
  if (!html) return html;
  if (html.indexOf("id=\\\"seg\\\"") === -1 && html.indexOf('id="seg"') === -1) {
    html += "<label>SEG</label><div class=\"combo\"><input id=\"seg\" value=\"" + esc(t.seg || "") + "\" placeholder=\"Type or add SEG\"><div class=\"suggest\" id=\"sug-seg\"></div></div>";
    html += "<button type=\"button\" class=\"btn ghost\" id=\"btnAddSeg\">Add SEG</button>";
  }
  return html;
};

function stampV44(html) {
  return String(html || "").replace(/ENVSS Field v\d+/g, "ENVSS Field v44");
}
["dashHtml", "projectHtml", "eventHtml"].forEach(function (name) {
  if (typeof window[name] === "function") {
    window[name] = (function (orig) {
      return function () { return stampV44(orig()); };
    })(window[name]);
  }
});


if (typeof fibreTrainHtml === "function" && !window._fibreGps44) {
  window._fibreGps44 = fibreTrainHtml;
  fibreTrainHtml = function (t, ev) {
    var html = window._fibreGps44(t, ev);
    if (html.indexOf("gpsBlock") === -1) {
      html = html.replace("</div></div>", gpsLines(t) + "</div></div>");
      if (html.indexOf("gpsBlock") === -1) html += gpsLines(t);
    }
    if (html.indexOf("auditBox") === -1) {
      var audit = t.audit || [];
      var rows = audit.length ? audit.slice().reverse().map(function (a) {
        return "<div class=\"muted\" style=\"margin-bottom:6px\">" + fmtTime(a.at) + " · " + esc(a.who || "") + " · " + esc(a.action) + (a.detail ? " · " + esc(a.detail) : "") + "</div>";
      }).join("") : "<p class=\"muted\">No edits yet.</p>";
      html += "<h3 class=\"brand-type\" style=\"color:var(--navy);margin-top:22px\">Audit log</h3><div id=\"auditBox\"><div class=\"card\">" + rows + "</div></div>";
    }
    return html;
  };
}

if (typeof render === "function") render();

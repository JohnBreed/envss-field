window.ENVSS_FIBRE = "41";
trainHtml = function () {
  const t = db.trains.find(function (x) { return x.id === view.trainId; });
  if (!t) return "<div class=\"wrap\">Missing sample.</div>";
  const ev = eventById(t.eventId);
  const afm = (ev && ev.type === "fibre") || String((ev && ev.code) || "").indexOf("AFM") !== -1 || (t.trainKind || "").indexOf("fibre") === 0;
  if (afm || (typeof isFibreTrain === "function" && isFibreTrain(t))) return fibreTrainHtml(t, ev);
  if (typeof hygieneTrainHtml === "function") return hygieneTrainHtml();
  return "<div class=\"wrap\"><p>Hygiene sample.</p><p class=\"muted\">Reload with ?v=41 if this screen is empty.</p></div>";
};

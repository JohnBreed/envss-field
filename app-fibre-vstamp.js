/* Force v36 labels and a second render after overlays load. localStorage key unchanged. */
window.ENVSS_FIBRE = "36";
if (typeof dashHtml === "function" && !window._dashV36) {
  window._dashV36 = dashHtml;
  dashHtml = function () {
    return window._dashV36().replace(/ENVSS Field v\d+/, "ENVSS Field v36");
  };
}
if (typeof projectHtml === "function" && !window._projV36) {
  window._projV36 = projectHtml;
  projectHtml = function () {
    return window._projV36().replace(/ENVSS Field v\d+/, "ENVSS Field v36");
  };
}
if (typeof eventHtml === "function") {
  const prev = eventHtml;
  eventHtml = function () {
    return prev().replace(/ENVSS Field v\d+/, "ENVSS Field v36");
  };
}
if (typeof render === "function") render();

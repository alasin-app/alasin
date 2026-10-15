// SPDX-License-Identifier: MIT
// Loaded before the app. If the app's own script fails to load — typically a
// page kept open across a new deployment, whose script files no longer exist —
// reload once to get the current version instead of showing a blank page.
(function () {
  var KEY = "alasin.bootReload";
  window.addEventListener(
    "error",
    function (e) {
      var el = e.target;
      if (!el || el.tagName !== "SCRIPT" || !/\/assets\//.test(el.src || "")) return;
      try {
        if (sessionStorage.getItem(KEY)) return;
        sessionStorage.setItem(KEY, "1");
      } catch {
        return;
      }
      location.reload();
    },
    true,
  );
  // The app started: allow another automatic reload after a later deployment.
  window.addEventListener("load", function () {
    try {
      if (document.getElementById("app") && document.getElementById("app").childElementCount) sessionStorage.removeItem(KEY);
    } catch {
      // Storage unavailable.
    }
  });
})();

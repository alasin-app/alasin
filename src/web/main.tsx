// SPDX-License-Identifier: MIT

import { render } from "preact";
import { App } from "./components/App";
import { initLanguage } from "./lib/i18n";
import { settings } from "./lib/settings";
import "./styles/app.css";

document.documentElement.style.setProperty("--accent", settings.accent);
initLanguage(settings.language);
render(<App />, document.getElementById("app")!);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  });
}

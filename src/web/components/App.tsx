// SPDX-License-Identifier: MIT

import { useEffect, useState } from "preact/hooks";
import { api, ApiError, clearLocalData, type Me, NetworkError } from "../lib/api";
import { resetContent } from "../lib/use-content";
import { t, useLanguage } from "../lib/i18n";
import { chooseSite, sitePath } from "../lib/current-site";
import { takeReturnPath } from "../lib/router";
import { Login } from "./Login";
import { Shell } from "./Shell";
import { SiteChooser } from "./SiteChooser";

type State =
  | { kind: "loading" }
  | { kind: "loggingOut" }
  | { kind: "anonymous" }
  | { kind: "signedIn"; me: Me }
  /** A deployment with sites, and none chosen yet. */
  | { kind: "chooseSite"; me: Me }
  | { kind: "error"; network: boolean };

export function App() {
  useLanguage();
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = async () => {
    setState({ kind: "loading" });
    try {
      const me = await api<Me>("/api/me");
      // Signed in from a link: back to where it led (sign-in itself returns to /).
      const back = takeReturnPath();
      if (back && location.pathname === "/") history.replaceState(null, "", back);
      const site = chooseSite(me, location.pathname);
      if (me.multi && !site) {
        history.replaceState(null, "", "/");
        setState({ kind: "chooseSite", me });
        return;
      }
      if (site) {
        // The chosen site in the address, and as the site the app shows.
        const base = sitePath();
        if (location.pathname !== base && !location.pathname.startsWith(`${base}/`)) history.replaceState(null, "", `${base}/`);
        me.site = me.sites.find((s) => s.id === site) ?? me.site;
      }
      setState({ kind: "signedIn", me });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setState({ kind: "anonymous" });
      else setState({ kind: "error", network: err instanceof NetworkError });
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const logout = async () => {
    // Leave the signed-in views at once, so nothing looks clickable while logging out.
    setState({ kind: "loggingOut" });
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      await clearLocalData();
      resetContent();
      history.replaceState(null, "", "/");
      setState({ kind: "anonymous" });
    }
  };

  switch (state.kind) {
    case "loading":
      return (
        <div class="center-screen" role="status">
          <span class="spinner" aria-hidden="true" />
          <span class="visually-hidden">{t("app.loading")}</span>
        </div>
      );
    case "loggingOut":
      return (
        <div class="center-screen" role="status" aria-live="polite">
          <span class="spinner" aria-hidden="true" />
          <span class="secondary">{t("account.loggingOut")}</span>
        </div>
      );
    case "anonymous":
      return <Login />;
    case "error":
      return (
        <div class="center-screen">
          <p class="secondary">{t(state.network ? "error.network" : "error.generic")}</p>
          <button type="button" class="btn btn-tinted" onClick={() => void load()}>
            {t("error.retry")}
          </button>
        </div>
      );
    case "chooseSite":
      return <SiteChooser me={state.me} onLogout={() => void logout()} />;
    case "signedIn":
      return <Shell me={state.me} onLogout={() => void logout()} />;
  }
}

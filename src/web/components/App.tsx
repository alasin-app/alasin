// SPDX-License-Identifier: MIT

import { useEffect, useState } from "preact/hooks";
import { api, ApiError, clearLocalData, type Me, NetworkError } from "../lib/api";
import { resetContent } from "../lib/use-content";
import { t, useLanguage } from "../lib/i18n";
import { Login } from "./Login";
import { Shell } from "./Shell";

type State =
  | { kind: "loading" }
  | { kind: "loggingOut" }
  | { kind: "anonymous" }
  | { kind: "signedIn"; me: Me }
  | { kind: "error"; network: boolean };

export function App() {
  useLanguage();
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = async () => {
    setState({ kind: "loading" });
    try {
      setState({ kind: "signedIn", me: await api<Me>("/api/me") });
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
    case "signedIn":
      return <Shell me={state.me} onLogout={() => void logout()} />;
  }
}

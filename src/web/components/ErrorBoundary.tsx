// SPDX-License-Identifier: MIT
// Catches errors while drawing the app, so a crash shows a message with the
// details and a way out instead of a blank page.

import { sitePath } from "../lib/current-site";
import { Component, type ComponentChildren } from "preact";
import { t } from "../lib/i18n";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ComponentChildren }, State> {
  override state: State = { error: null };

  static override getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: unknown) {
    console.error("Alasin crashed:", error);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div class="center-screen" role="alert">
        <h1 class="headline">{t("crash.title")}</h1>
        <p class="secondary">{t("crash.body")}</p>
        <pre class="crash-details">{`${error.name}: ${error.message}\n${(error.stack ?? "").split("\n").slice(1, 6).join("\n")}`}</pre>
        <div class="button-row">
          <button type="button" class="btn btn-filled" onClick={() => location.reload()}>
            {t("crash.reload")}
          </button>
          <button type="button" class="btn btn-tinted" onClick={() => location.assign(`${sitePath()}/drafts`)}>
            {t("crash.toDrafts")}
          </button>
        </div>
      </div>
    );
  }
}

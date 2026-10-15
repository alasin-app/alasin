// SPDX-License-Identifier: MIT

import { LogIn, TriangleAlert } from "lucide-preact";
import { type MessageKey, t, useLanguage } from "../lib/i18n";
import { settings } from "../lib/settings";
import { EnvBadge } from "./Shell";

const ERRORS = ["state", "denied", "not_allowed", "github", "rate_limited"] as const;

export function Login() {
  useLanguage();
  const code = new URLSearchParams(location.search).get("login_error");
  const error = ERRORS.find((e) => e === code);
  return (
    <main class="login">
      <div class="login-card">
        <img class="login-icon" src="/icons/icon.svg" alt="" width={96} height={96} />
        <h1 class="login-app">
          {settings.appName} <EnvBadge />
        </h1>
        <p class="login-subtitle">{t("login.subtitle")}</p>
        {error && (
          <p class="banner banner-error" role="alert">
            <TriangleAlert size={20} aria-hidden="true" />
            <span>{t(`login.error.${error}` as MessageKey)}</span>
          </p>
        )}
        <a class="btn btn-filled btn-large" href="/auth/login">
          <LogIn size={20} aria-hidden="true" />
          {t("login.button")}
        </a>
        <p class="footnote">{t("login.footnote")}</p>
      </div>
    </main>
  );
}

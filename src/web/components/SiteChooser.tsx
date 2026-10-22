// SPDX-License-Identifier: MIT
// The start page of a deployment with sites, when no site is chosen yet: the
// sites the user can write for (#325).

import { ChevronRight } from "lucide-preact";
import type { Me } from "../lib/api";
import { openSite, siteLabel } from "../lib/current-site";
import { t, useLanguage } from "../lib/i18n";
import { settings } from "../lib/settings";

export function SiteChooser(props: { me: Me; onLogout: () => void }) {
  useLanguage();
  const { sites } = props.me;
  return (
    <main class="login">
      <div class="login-card">
        <img class="login-icon" src="/icons/icon.svg" alt="" width={96} height={96} />
        <h1 class="login-app">{settings.appName}</h1>
        <p class="login-subtitle">{t(sites.length ? "sites.chooseBody" : "sites.none")}</p>
        {sites.length > 0 && (
          <>
            <h2 class="group-header">{t("sites.choose")}</h2>
            <ul class="grouped-list site-list">
              {sites.map((s) => (
                <li>
                  <button type="button" class="row row-button-left" onClick={() => openSite(s.id)}>
                    <span class="row-label">
                      {siteLabel(s)}
                      <span class="row-subtitle">{s.url}</span>
                    </span>
                    <ChevronRight class="chevron" size={18} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <button type="button" class="btn btn-plain" onClick={props.onLogout}>
          {t("account.logout")}
        </button>
      </div>
    </main>
  );
}

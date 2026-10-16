// SPDX-License-Identifier: MIT

import { TriangleAlert } from "lucide-preact";
import { useState } from "preact/hooks";
import type { Me } from "../lib/api";
import { getLanguage, LANGUAGES, type MessageKey, setLanguage, t, useLanguage } from "../lib/i18n";
import { settings } from "../lib/settings";
import { ActionSheet, Sheet } from "./Sheet";
import { buildId } from "../lib/new-build";

export function AccountSheet(props: { open: boolean; onClose: () => void; me: Me; onLogout: () => void }) {
  useLanguage();
  const [confirming, setConfirming] = useState(false);
  const { me } = props;
  return (
    <>
      <Sheet open={props.open && !confirming} onClose={props.onClose} title={t("account.title")} doneLabel={t("account.done")}>
        <div class="account-header">
          <img class="avatar avatar-large" src={me.user.avatar} alt="" width={72} height={72} />
          <div class="account-name">{me.user.name || me.user.login}</div>
          <div class="footnote">{t("account.signedInAs", { login: me.user.login })}</div>
        </div>

        <ul class="grouped-list">
          {me.environment && (
            <li class="row">
              <span class="row-label">{t("account.environment")}</span>
              <span class="badge badge-env">{me.environment}</span>
            </li>
          )}
          <li class="row">
            <span class="row-label">{t("account.site")}</span>
            <a class="row-value link" href={me.site.url} target="_blank" rel="noopener noreferrer">
              {t("account.viewSite")}
            </a>
          </li>
          <li class="row">
            <span class="row-label">{t("account.version")}</span>
            <span class="row-value">
              {me.version} ({buildId()})
            </span>
          </li>
        </ul>

        {me.housekeeping.length > 0 && (
          <>
            <h3 class="group-header">{t("housekeeping.title")}</h3>
            <ul class="grouped-list">
              {me.housekeeping.map((h) => (
                <li class="row">
                  <TriangleAlert class="warning-icon" size={20} aria-hidden="true" />
                  <span class="row-label">
                    {t(`housekeeping.${h.item}` as MessageKey)}
                    <span class="row-subtitle">
                      {h.lastRotated ? t("housekeeping.lastRotated", { date: h.lastRotated }) : t("housekeeping.notRecorded")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <p class="group-footer">{t("housekeeping.hint")}</p>
          </>
        )}

        <h3 class="group-header">{t("account.settings")}</h3>
        <ul class="grouped-list">
          <li class="row row-stacked">
            <span class="row-label" id="language-label">
              {t("account.language")}
            </span>
            <div class="segmented" role="radiogroup" aria-labelledby="language-label">
              {LANGUAGES.map((lang) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={getLanguage() === lang}
                  class={getLanguage() === lang ? "selected" : ""}
                  onClick={() => setLanguage(lang)}
                >
                  {t(`language.${lang}`)}
                </button>
              ))}
            </div>
          </li>
        </ul>

        <ul class="grouped-list">
          <li>
            <button type="button" class="row row-button destructive" onClick={() => setConfirming(true)}>
              {t("account.logout")}
            </button>
          </li>
        </ul>
      </Sheet>
      <ActionSheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t("account.logoutConfirm", { app: settings.appName })}
        message={t("account.logoutConfirmBody")}
        actions={[{ label: t("account.logout"), destructive: true, onSelect: props.onLogout }]}
        cancelLabel={t("common.cancel")}
      />
    </>
  );
}

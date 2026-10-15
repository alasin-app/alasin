// SPDX-License-Identifier: MIT
// App frame: a sidebar split view on iPad and desktop, a tab bar on iPhone.

import { ChevronRight, Ellipsis, FileText, House, Image, Newspaper, PenLine, Plus, Tags } from "lucide-preact";
import type { ComponentType } from "preact";
import { useState } from "preact/hooks";
import type { Me } from "../lib/api";
import { type MessageKey, t, useLanguage } from "../lib/i18n";
import { hrefFor, linkHandler, type Route, useRoute } from "../lib/router";
import { settings } from "../lib/settings";
import { AccountSheet } from "./AccountSheet";
import { NavBar } from "./NavBar";

type Icon = ComponentType<{ size?: number; "aria-hidden"?: "true" }>;

const SECTIONS: { route: Route; label: MessageKey; icon: Icon }[] = [
  { route: "home", label: "nav.home", icon: House },
  { route: "pages", label: "nav.pages", icon: FileText },
  { route: "posts", label: "nav.posts", icon: Newspaper },
  { route: "drafts", label: "nav.drafts", icon: PenLine },
  { route: "categories", label: "nav.categories", icon: Tags },
  { route: "media", label: "nav.media", icon: Image },
];

const TABS: { route: Route; label: MessageKey; icon: Icon }[] = [
  { route: "home", label: "nav.home", icon: House },
  { route: "drafts", label: "nav.drafts", icon: PenLine },
  { route: "media", label: "nav.media", icon: Image },
  { route: "more", label: "nav.more", icon: Ellipsis },
];

const MORE: Route[] = ["pages", "posts", "categories"];

export function EnvBadge() {
  return settings.environment ? <span class="badge badge-env">{settings.environment}</span> : null;
}

function AvatarButton(props: { me: Me; onClick: () => void }) {
  return (
    <button type="button" class="avatar-button" onClick={props.onClick} aria-label={t("account.title")}>
      <img class="avatar" src={`${props.me.user.avatar}?s=40`} alt="" width={32} height={32} />
    </button>
  );
}

export function Shell(props: { me: Me; onLogout: () => void }) {
  useLanguage();
  const route = useRoute();
  const [accountOpen, setAccountOpen] = useState(false);
  const section = SECTIONS.find((s) => s.route === route);
  const title = route === "more" ? t("nav.more") : t(section?.label ?? "nav.home");
  const tabActive = (r: Route) => r === route || (r === "more" && MORE.includes(route) );

  return (
    <div class="shell">
      <aside class="sidebar" aria-label={settings.appName}>
        <div class="sidebar-header">
          <span class="sidebar-app">
            {settings.appName} <EnvBadge />
          </span>
          <AvatarButton me={props.me} onClick={() => setAccountOpen(true)} />
        </div>
        <nav>
          <ul class="sidebar-list">
            {SECTIONS.map((s) => (
              <li>
                <a
                  href={hrefFor(s.route)}
                  class={`sidebar-item${s.route === route ? " active" : ""}`}
                  aria-current={s.route === route ? "page" : undefined}
                  onClick={linkHandler(s.route)}
                >
                  <s.icon size={22} aria-hidden="true" />
                  <span>{t(s.label)}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <main class="content" id="main">
        <NavBar
          title={title}
          leading={<span class="nav-env"><EnvBadge /></span>}
          trailing={<AvatarButton me={props.me} onClick={() => setAccountOpen(true)} />}
        />
        {route === "more" ? (
          <ul class="grouped-list">
            {MORE.map((r) => {
              const s = SECTIONS.find((x) => x.route === r)!;
              return (
                <li>
                  <a class="row row-link" href={hrefFor(r)} onClick={linkHandler(r)}>
                    <s.icon size={22} aria-hidden="true" />
                    <span class="row-label">{t(s.label)}</span>
                    <ChevronRight class="chevron" size={18} aria-hidden="true" />
                  </a>
                </li>
              );
            })}
          </ul>
        ) : (
          <>
            {route === "home" && (
              <div class="button-row">
                <button type="button" class="btn btn-filled" disabled>
                  <Plus size={20} aria-hidden="true" />
                  {t("home.newPost")}
                </button>
                <button type="button" class="btn btn-tinted" disabled>
                  <Plus size={20} aria-hidden="true" />
                  {t("home.newPage")}
                </button>
              </div>
            )}
            <div class="empty-state">
              <h2 class="headline">{t("empty.title")}</h2>
              <p class="secondary">{t("empty.body")}</p>
            </div>
          </>
        )}
      </main>

      <nav class="tab-bar" aria-label={settings.appName}>
        {TABS.map((tab) => (
          <a
            href={hrefFor(tab.route)}
            class={`tab${tabActive(tab.route) ? " active" : ""}`}
            aria-current={tabActive(tab.route) ? "page" : undefined}
            onClick={linkHandler(tab.route)}
          >
            <tab.icon size={26} aria-hidden="true" />
            <span>{t(tab.label)}</span>
          </a>
        ))}
      </nav>

      <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} me={props.me} onLogout={props.onLogout} />
    </div>
  );
}

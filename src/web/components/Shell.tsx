// SPDX-License-Identifier: MIT
// App frame: a sidebar split view on iPad and desktop, a tab bar on iPhone.

import { ChevronRight, Ellipsis, FileText, House, Image, Newspaper, PanelLeftClose, PanelLeftOpen, PenLine, Plus, Tags } from "lucide-preact";
import type { ComponentType } from "preact";
import { useState } from "preact/hooks";
import type { Me } from "../lib/api";
import { type MessageKey, t, useLanguage } from "../lib/i18n";
import { type DraftKind, hrefFor, linkHandler, navigate, type Section, useRoute } from "../lib/router";
import { ulid } from "../../shared/ulid";
import { DraftsList } from "./DraftsList";
import { Editor } from "./Editor";
import { settings } from "../lib/settings";
import { AccountSheet } from "./AccountSheet";
import { NavBar } from "./NavBar";

type Icon = ComponentType<{ size?: number; "aria-hidden"?: "true" }>;

const SECTIONS: { route: Section; label: MessageKey; icon: Icon }[] = [
  { route: "home", label: "nav.home", icon: House },
  { route: "pages", label: "nav.pages", icon: FileText },
  { route: "posts", label: "nav.posts", icon: Newspaper },
  { route: "drafts", label: "nav.drafts", icon: PenLine },
  { route: "categories", label: "nav.categories", icon: Tags },
  { route: "media", label: "nav.media", icon: Image },
];

const TABS: { route: Section; label: MessageKey; icon: Icon }[] = [
  { route: "home", label: "nav.home", icon: House },
  { route: "drafts", label: "nav.drafts", icon: PenLine },
  { route: "media", label: "nav.media", icon: Image },
  { route: "more", label: "nav.more", icon: Ellipsis },
];

const MORE: Section[] = ["pages", "posts", "categories"];

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

const SIDEBAR_KEY = "alasin.sidebar";

function storedCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "collapsed";
  } catch {
    return false;
  }
}

/** Whether the sidebar shows icons only; remembered on this device. */
function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(storedCollapsed);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_KEY, next ? "collapsed" : "expanded");
    } catch {
      // Private mode: the choice lasts for this visit only.
    }
  };
  return [collapsed, toggle];
}

export function Shell(props: { me: Me; onLogout: () => void }) {
  useLanguage();
  const route = useRoute();
  const [accountOpen, setAccountOpen] = useState(false);
  const [collapsed, toggleSidebar] = useSidebarCollapsed();
  // The editor belongs to the Drafts section.
  const current: Section = route.name === "editor" ? "drafts" : route.name;
  const section = SECTIONS.find((s) => s.route === current);
  const title = current === "more" ? t("nav.more") : t(section?.label ?? "nav.home");
  const tabActive = (r: Section) => r === current || (r === "more" && MORE.includes(current));
  const create = (type: DraftKind) => navigate({ name: "editor", type, id: ulid() });

  return (
    <div class={`shell${route.name === "editor" ? " editing" : ""}${collapsed ? " sidebar-collapsed" : ""}`}>
      <aside class="sidebar" aria-label={settings.appName}>
        <div class="sidebar-header">
          {collapsed ? (
            <EnvBadge />
          ) : (
            <span class="sidebar-app">
              {settings.appName} <EnvBadge />
            </span>
          )}
          <AvatarButton me={props.me} onClick={() => setAccountOpen(true)} />
        </div>
        <nav>
          <ul class="sidebar-list">
            {SECTIONS.map((s) => (
              <li>
                <a
                  href={hrefFor({ name: s.route })}
                  class={`sidebar-item${s.route === current ? " active" : ""}`}
                  aria-current={s.route === current ? "page" : undefined}
                  onClick={linkHandler({ name: s.route })}
                  title={collapsed ? t(s.label) : undefined}
                >
                  <s.icon size={22} aria-hidden="true" />
                  <span class={collapsed ? "visually-hidden" : undefined}>{t(s.label)}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div class="sidebar-footer">
          <button
            type="button"
            class="sidebar-toggle"
            onClick={toggleSidebar}
            aria-expanded={!collapsed}
            aria-label={collapsed ? t("nav.showSidebar") : t("nav.hideSidebar")}
            title={collapsed ? t("nav.showSidebar") : t("nav.hideSidebar")}
          >
            {collapsed ? <PanelLeftOpen size={22} aria-hidden="true" /> : <PanelLeftClose size={22} aria-hidden="true" />}
          </button>
        </div>
      </aside>

      <main class="content" id="main">
        {route.name === "editor" ? (
          <Editor key={route.id} me={props.me} type={route.type} id={route.id} />
        ) : (
          <>
            <NavBar
              title={title}
              leading={<span class="nav-env"><EnvBadge /></span>}
              trailing={<AvatarButton me={props.me} onClick={() => setAccountOpen(true)} />}
            />
            {(current === "home" || current === "drafts") && (
              <div class="button-row">
                <button type="button" class="btn btn-filled" onClick={() => create("post")}>
                  <Plus size={20} aria-hidden="true" />
                  {t("home.newPost")}
                </button>
                <button type="button" class="btn btn-tinted" onClick={() => create("page")}>
                  <Plus size={20} aria-hidden="true" />
                  {t("home.newPage")}
                </button>
              </div>
            )}
            {current === "more" ? (
              <ul class="grouped-list">
                {MORE.map((r) => {
                  const s = SECTIONS.find((x) => x.route === r)!;
                  return (
                    <li>
                      <a class="row row-link" href={hrefFor({ name: r })} onClick={linkHandler({ name: r })}>
                        <s.icon size={22} aria-hidden="true" />
                        <span class="row-label">{t(s.label)}</span>
                        <ChevronRight class="chevron" size={18} aria-hidden="true" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : current === "drafts" ? (
              <DraftsList me={props.me} />
            ) : (
              <div class="empty-state">
                <h2 class="headline">{t("empty.title")}</h2>
                <p class="secondary">{t("empty.body")}</p>
              </div>
            )}
          </>
        )}
      </main>

      <nav class="tab-bar" aria-label={settings.appName}>
        {TABS.map((tab) => (
          <a
            href={hrefFor({ name: tab.route })}
            class={`tab${tabActive(tab.route) ? " active" : ""}`}
            aria-current={tabActive(tab.route) ? "page" : undefined}
            onClick={linkHandler({ name: tab.route })}
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

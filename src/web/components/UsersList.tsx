// SPDX-License-Identifier: MIT
// Who can log in to this deployment: everyone with write access to the site
// repository on GitHub, each with their permission on the repository. The
// repository's admins invite and remove people on GitHub: the buttons open its
// collaborator settings (Alasin's GitHub App has no permission to change them).

import { ExternalLink, UserPlus } from "lucide-preact";
import { useEffect, useState } from "preact/hooks";
import { api } from "../lib/api";
import { t, useLanguage } from "../lib/i18n";

type Permission = "admin" | "maintain" | "write" | "triage" | "read" | "none";

interface User {
  login: string;
  id: number;
  name: string | null;
  permission: Permission | null;
  you: boolean;
}

const CAN_WRITE: Permission[] = ["admin", "maintain", "write"];

/** The repository's "Collaborators and teams" settings on GitHub, where people are invited and removed. */
const accessUrl = (repository: string) => `https://github.com/${repository}/settings/access`;

export function UsersList() {
  useLanguage();
  const [data, setData] = useState<{ repository: string; branch: string; users: User[] } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const load = () => void api<{ repository: string; branch: string; users: User[] }>("/api/users").then(setData, () => setError(true));
    load();
    // Back from GitHub: read the list again.
    const onShow = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, []);

  if (error) return <p class="empty-state secondary">{t("error.generic")}</p>;
  if (!data) {
    return (
      <div class="empty-state" role="status">
        <span class="spinner" aria-hidden="true" />
        <span class="visually-hidden">{t("app.loading")}</span>
      </div>
    );
  }
  const admin = data.users.some((u) => u.you && u.permission === "admin");
  return (
    <>
      <p class="secondary sheet-note list-note">
        {t("users.introRepository", { repository: data.repository })}
      </p>
      {admin && (
        <div class="users-actions">
          <a class="btn btn-tinted" href={accessUrl(data.repository)} target="_blank" rel="noopener noreferrer">
            <UserPlus size={18} aria-hidden="true" />
            {t("users.invite")}
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
      )}
      <ul class="grouped-list">
        {data.users.map((u) => {
          const ok = u.permission !== null && CAN_WRITE.includes(u.permission);
          return (
            <li class="row user-row">
              <img class="avatar" src={`/api/avatar/${u.id}?s=40`} alt="" width={32} height={32} />
              <span class="row-label">
                {u.name ?? u.login}
                {u.you && <span class="secondary"> · {t("users.you")}</span>}
                <span class="row-subtitle">@{u.login}</span>
              </span>
              <span class={`badge ${ok ? "badge-ok" : "badge-warn"}`} title={ok ? undefined : t("users.noWriteHint", { repository: data.repository })}>
                {u.permission === null ? t("users.permissionUnknown") : t(`users.permission.${u.permission}`)}
              </span>
              {admin && !u.you && (
                <a
                  class="btn-plain destructive user-remove"
                  href={accessUrl(data.repository)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("users.removeLabel", { login: u.login })}
                  title={t("users.removeLabel", { login: u.login })}
                >
                  {t("users.remove")}
                </a>
              )}
            </li>
          );
        })}
      </ul>
      <p class="secondary sheet-note list-note">{admin ? t("users.manageNote") : t("users.adminsOnly")}</p>
      <p class="secondary sheet-note list-note">{t("users.howTo")}</p>
    </>
  );
}

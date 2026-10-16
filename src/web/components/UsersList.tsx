// SPDX-License-Identifier: MIT
// Who can log in to this deployment: everyone with write access to the site
// repository on GitHub, or (with [users] allow in alasin.toml) only those of
// them listed there, each with their permission on the repository.

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

export function UsersList() {
  useLanguage();
  const [data, setData] = useState<{ repository: string; branch: string; list: "repository" | "list"; users: User[] } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    api<{ repository: string; branch: string; list: "repository" | "list"; users: User[] }>("/api/users").then(setData, () => setError(true));
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
  return (
    <>
      <p class="secondary sheet-note list-note">
        {t(data.list === "list" ? "users.introList" : "users.introRepository", { repository: data.repository })}
      </p>
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
            </li>
          );
        })}
      </ul>
      <p class="secondary sheet-note list-note">{t("users.howTo")}</p>
    </>
  );
}

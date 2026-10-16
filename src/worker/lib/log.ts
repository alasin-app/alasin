// SPDX-License-Identifier: MIT
// Structured logs. Only request IDs, routes, status codes and GitHub user IDs
// are logged — never tokens, cookies, secrets, request bodies or post content.

const TOKEN_PATTERN = /\b(gh[opusr]_[A-Za-z0-9_]{10,}|github_pat_[A-Za-z0-9_]{10,}|eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g;

export function redact(message: string): string {
  return message.replace(TOKEN_PATTERN, "[redacted]").slice(0, 300);
}

export interface LogFields {
  rid: string;
  method?: string;
  route?: string;
  status?: number;
  uid?: number;
  ms?: number;
  event?: string;
  error?: string;
  /** Counts of the nightly cleanup. */
  folders?: number;
  removedFolders?: number;
  removedObjects?: number;
}

export function log(fields: LogFields): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(fields));
}

export function logError(fields: LogFields, err: unknown): void {
  const e = err instanceof Error ? `${err.name}: ${redact(err.message)}` : "unknown error";
  console.error(JSON.stringify({ ...fields, error: e }));
}

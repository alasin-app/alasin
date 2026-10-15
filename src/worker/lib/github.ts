// SPDX-License-Identifier: MIT
// Minimal GitHub client for the GitHub App's user-to-server OAuth flow.

import { z } from "zod";

const USER_AGENT = "Alasin";
const API = "https://api.github.com";

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export interface UserTokens {
  accessToken: string;
  /** Epoch ms; undefined if the app's tokens don't expire. */
  accessExpiresAt?: number;
  refreshToken?: string;
  refreshExpiresAt?: number;
}

const tokenResponse = z.union([
  z.object({
    access_token: z.string().min(1),
    token_type: z.string().optional(),
    expires_in: z.number().optional(),
    refresh_token: z.string().optional(),
    refresh_token_expires_in: z.number().optional(),
  }),
  z.object({ error: z.string(), error_description: z.string().optional() }),
]);

const userResponse = z.object({
  id: z.number().int().positive(),
  login: z.string(),
  name: z.string().nullable().optional(),
});

export type GitHubUser = z.infer<typeof userResponse>;

async function postToken(params: Record<string, string>): Promise<UserTokens> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new GitHubError(`token endpoint returned ${res.status}`, res.status);
  const parsed = tokenResponse.safeParse(await res.json());
  if (!parsed.success) throw new GitHubError("unexpected token response", 502);
  const body = parsed.data;
  // GitHub reports OAuth errors with HTTP 200 and an `error` field.
  if ("error" in body) throw new GitHubError(`token endpoint error: ${body.error}`, 400);
  const now = Date.now();
  return {
    accessToken: body.access_token,
    accessExpiresAt: body.expires_in ? now + body.expires_in * 1000 : undefined,
    refreshToken: body.refresh_token,
    refreshExpiresAt: body.refresh_token_expires_in ? now + body.refresh_token_expires_in * 1000 : undefined,
  };
}

export function exchangeCode(opts: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<UserTokens> {
  return postToken({
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    code: opts.code,
    redirect_uri: opts.redirectUri,
    code_verifier: opts.codeVerifier,
  });
}

export function refreshTokens(opts: { clientId: string; clientSecret: string; refreshToken: string }): Promise<UserTokens> {
  return postToken({
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
  });
}

export async function getAuthenticatedUser(accessToken: string): Promise<GitHubUser> {
  const res = await fetch(`${API}/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) throw new GitHubError(`GET /user returned ${res.status}`, res.status);
  const parsed = userResponse.safeParse(await res.json());
  if (!parsed.success) throw new GitHubError("unexpected /user response", 502);
  return parsed.data;
}

/** Revokes a user token (logout, or a login that isn't on the allowlist). Best effort. */
export async function revokeToken(opts: { clientId: string; clientSecret: string; accessToken: string }): Promise<void> {
  await fetch(`${API}/applications/${encodeURIComponent(opts.clientId)}/token`, {
    method: "DELETE",
    headers: {
      Authorization: `Basic ${btoa(`${opts.clientId}:${opts.clientSecret}`)}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({ access_token: opts.accessToken }),
  });
}

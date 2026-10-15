// SPDX-License-Identifier: MIT
// Soft edit locks (one editor at a time per post or page). A SQLite-backed
// Durable Object so acquire, renew and take-over are atomic and immediately
// consistent. Declared now so the binding and migration exist from the first
// deployment; the lock protocol is implemented with the editor.

import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";

export class EditLocks extends DurableObject<Env> {
  override async fetch(): Promise<Response> {
    return new Response("Not implemented", { status: 501 });
  }
}

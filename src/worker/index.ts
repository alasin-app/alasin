// SPDX-License-Identifier: MIT
// Worker entry point.

import { createApp } from "./app";
import type { Env } from "./env";

export { EditLocks } from "./locks";

const app = createApp();

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;

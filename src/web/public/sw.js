// SPDX-License-Identifier: MIT
// Service worker: caches only static assets (hashed build files, icons and the
// app shell) so the app opens quickly and can be installed. API responses and
// auth routes are never cached.

// Bumped when cached content could be wrong; older caches are deleted on activation.
const CACHE = "alasin-static-v2";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

function isStatic(url) {
  return url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (isStatic(url)) {
    // Hashed file names: cache first.
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        // Never keep an HTML page under a build file's address.
        const type = res.headers.get("Content-Type") || "";
        if (res.ok && !type.startsWith("text/html")) await cache.put(req, res.clone());
        return res;
      })(),
    );
  } else if (req.mode === "navigate") {
    // App shell: network first, cached copy when offline.
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const res = await fetch(req);
          if (res.ok) await cache.put("/", res.clone());
          return res;
        } catch {
          return (await cache.match("/")) ?? Response.error();
        }
      })(),
    );
  }
});

// SPDX-License-Identifier: MIT
//
// Notices a new deployment while the app is open: the app page names its
// script by a hash of the build (/assets/index-<hash>.js), so a different name
// in a freshly fetched page means a newer build. Checked when the app comes
// back to the foreground and every 10 minutes while it's visible.

import { useEffect, useState } from "preact/hooks";

const INTERVAL_MS = 10 * 60 * 1000;
const SCRIPT = /<script\b[^>]*\bsrc="(\/assets\/[^"]+\.js)"/;

function runningScript(): string | null {
  return document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute("src") ?? null;
}

/** The running build's ID: the hash in its script's name ("dev" on the development server). */
export function buildId(): string {
  return /index-([^/.]+)\.js$/.exec(runningScript() ?? "")?.[1] ?? "dev";
}

/** The app page's script as deployed now, or null if it can't be told. */
async function deployedScript(): Promise<string | null> {
  try {
    const res = await fetch("/", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return null;
    return SCRIPT.exec(await res.text())?.[1] ?? null;
  } catch {
    return null; // Offline: try again later.
  }
}

/** True once a newer build of the app is deployed than the one running. */
export function useNewBuild(): boolean {
  const [newer, setNewer] = useState(false);
  useEffect(() => {
    const running = runningScript();
    if (!running) return; // Development server: no built script.
    let last = 0;
    const check = async () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 60_000) return;
      last = Date.now();
      const deployed = await deployedScript();
      if (deployed && deployed !== running) setNewer(true);
    };
    const timer = setInterval(() => void check(), INTERVAL_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);
  return newer;
}

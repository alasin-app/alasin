// SPDX-License-Identifier: MIT
//
// With the on-screen keyboard open, iOS and iPadOS scroll the visible area
// (the visual viewport) inside the page without moving sticky elements, so a
// sticky toolbar slides out of view. This keeps `--visible-top` on the root
// element set to how far the visible area's top is from the page's own top,
// so sticky elements can follow it.

import { useEffect } from "preact/hooks";

export function useVisibleTop(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      frame = 0;
      root.style.setProperty("--visible-top", `${Math.max(0, Math.round(vv.offsetTop))}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    return () => {
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      if (frame) cancelAnimationFrame(frame);
      root.style.removeProperty("--visible-top");
    };
  }, []);
}

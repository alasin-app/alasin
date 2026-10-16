// SPDX-License-Identifier: MIT
// Navigation bar with an iOS large title that collapses into the bar on scroll.

import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

export function NavBar(props: { title: string; leading?: ComponentChildren; trailing?: ComponentChildren }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const el = titleRef.current;
    if (!el || !("IntersectionObserver" in window)) return;
    // On wide screens the bar lies over the top of the page (see app.css), so
    // the large title is "gone" only once it has scrolled out of view.
    const wide = window.matchMedia("(min-width: 768px)").matches;
    const io = new IntersectionObserver(([entry]) => setCollapsed(!entry!.isIntersecting), {
      rootMargin: wide ? "0px" : "-52px 0px 0px 0px",
      threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <>
      <header class={`nav-bar${collapsed ? " collapsed" : ""}`}>
        <div class="nav-leading">{props.leading}</div>
        <div class="nav-inline-title" aria-hidden={!collapsed}>
          {props.title}
        </div>
        <div class="nav-trailing">{props.trailing}</div>
      </header>
      <h1 class="large-title" ref={titleRef}>
        {props.title}
      </h1>
    </>
  );
}

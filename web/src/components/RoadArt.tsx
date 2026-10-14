"use client";

import { useEffect, useRef } from "react";

/**
 * A drawing (an SVG file) written into the page when it comes into view, not carried in the page's HTML. Used for the road to the final: its SVG is about 17 KB,
 * and a string a page gives is sent twice (as markup and as data), so the page fetches the file instead, once, and only for a reader who scrolls to it. The box keeps
 * the drawing's shape (`ratio`, width over height) from the first byte, so nothing moves when it arrives. The drawing is written into the page, not shown as an
 * image, so it takes the page's colours, light and dark (the file leaves kyogijo's rules to the page); it is decorative, and the table beside it says the same.
 */
export function RoadArt({ src, ratio, className }: { src: string; ratio: number; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let live = true;
    const load = () => {
      fetch(src).then((r) => (r.ok ? r.text() : "")).then((svg) => {
        if (live && svg.startsWith("<svg")) el.innerHTML = svg;
      }).catch(() => undefined);
    };
    if (typeof IntersectionObserver === "undefined") {
      load();
      return () => { live = false; };
    }
    const watch = new IntersectionObserver((seen) => {
      if (seen.some((s) => s.isIntersecting)) { watch.disconnect(); load(); }
    }, { rootMargin: "300px 0px" });
    watch.observe(el);
    return () => { live = false; watch.disconnect(); };
  }, [src]);
  return <div ref={box} className={className} style={{ aspectRatio: String(ratio) }} aria-hidden="true" />;
}

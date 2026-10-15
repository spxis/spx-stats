"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * True once the element is near the screen (or at once where the browser has no IntersectionObserver), and then for good: the parts of a long page
 * that sit far down (charts, a country section) are fetched and drawn only when the reader gets close, so the page itself does not carry them.
 * `margin` is how far ahead of the screen to start, so the part is usually ready before it is reached.
 */
export function useSeen<T extends Element>(margin = "500px 0px"): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const open = () => setSeen(true);
    if (typeof IntersectionObserver === "undefined") { const t = setTimeout(open, 0); return () => clearTimeout(t); }
    const io = new IntersectionObserver((hits) => { if (hits.some((h) => h.isIntersecting)) { open(); io.disconnect(); } }, { rootMargin: margin });
    io.observe(el);
    // An address that points into the part (#countries) must open it even when the box is not yet near.
    const hash = () => { if (el.id && location.hash === `#${el.id}`) open(); };
    const t = setTimeout(hash, 0);
    window.addEventListener("hashchange", hash);
    return () => { clearTimeout(t); io.disconnect(); window.removeEventListener("hashchange", hash); };
  }, [margin, seen]);
  return [ref, seen];
}

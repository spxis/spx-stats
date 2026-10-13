"use client";

import { useEffect, useRef, type FocusEvent, type MouseEvent, type ReactNode } from "react";

const seasonOf = (el: EventTarget | null): string | null =>
  el instanceof Element ? el.closest("[data-season]")?.getAttribute("data-season") ?? null : null;

/**
 * Ties one season's marks together: pointing at (or tabbing to) anything with a data-season inside the block, say a season chip, a square
 * of the bar or a bar of a chart, gives every mark of that season the class `hl`. The class is set on the elements themselves, a frame
 * after the pointer moves, so nothing re-renders and no request is made; the look is plain CSS (.hl in globals.css).
 */
export function SeasonSync({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement | null>(null);
  const shown = useRef<string | null>(null);
  const wanted = useRef<string | null>(null);
  const frame = useRef(0);

  const paint = () => {
    frame.current = 0;
    if (wanted.current === shown.current) return;
    shown.current = wanted.current;
    const el = root.current;
    if (!el) return;
    el.querySelectorAll(".hl").forEach((n) => n.classList.remove("hl"));
    if (shown.current) el.querySelectorAll(`[data-season="${CSS.escape(shown.current)}"]`).forEach((n) => n.classList.add("hl"));
  };
  const want = (season: string | null) => {
    wanted.current = season;
    if (!frame.current) frame.current = requestAnimationFrame(paint);
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // When the pointer leaves, a chip that still has the keyboard focus keeps its season lit.
  const focused = () => seasonOf(document.activeElement);
  return (
    <div ref={root} className="seasonsync"
      onMouseOver={(e: MouseEvent) => want(seasonOf(e.target))}
      onMouseOut={(e: MouseEvent) => want(seasonOf(e.relatedTarget) ?? focused())}
      onFocus={(e: FocusEvent) => want(seasonOf(e.target))}
      onBlur={(e: FocusEvent) => want(seasonOf(e.relatedTarget))}>
      {children}
    </div>
  );
}

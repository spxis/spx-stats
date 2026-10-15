"use client";

import { useRef } from "react";

/**
 * Wraps a standings table and the buttons above it. Hovering or focusing a button lights what it stands for, with no request:
 *
 *   a sub-filter button (an element carrying `data-hi`, the class its clubs' rows hold, from lib/standingsGroups.ts) lights those rows and fades the others (`pv-hi`, alignment.css);
 *   a view button (`data-hicol`) lights the Conference / Division column of every row, the grouping it would sort the table into.
 *
 * The classes are put on the rows directly and taken off again when the pointer or focus leaves.
 */
export function StandingsFocus({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  const clear = () => {
    const el = root.current;
    if (!el) return;
    delete el.dataset.hi;
    delete el.dataset.hicol;
    for (const r of el.querySelectorAll(".pv-hi")) r.classList.remove("pv-hi");
  };
  const light = (target: EventTarget | null) => {
    const el = root.current;
    const from = target instanceof Element ? target.closest("[data-hi], [data-hicol]") : null;
    if (!el || !from) return;
    clear();
    const cls = from.getAttribute("data-hi");
    if (cls) {
      el.dataset.hi = "1";
      for (const r of el.querySelectorAll(`tr.${CSS.escape(cls)}`)) r.classList.add("pv-hi");
    } else if (from.hasAttribute("data-hicol")) el.dataset.hicol = from.getAttribute("data-hicol") ?? "1";
  };
  const leaves = (e: { target: EventTarget | null; relatedTarget: EventTarget | null }) => {
    const on = (t: EventTarget | null) => t instanceof Element && !!t.closest("[data-hi], [data-hicol]");
    if (on(e.target) && !on(e.relatedTarget)) clear();
  };

  return (
    <div
      ref={root}
      className="standfocus"
      onPointerOver={(e) => { if (e.pointerType !== "touch") light(e.target); }}
      onPointerOut={leaves}
      onFocus={(e) => light(e.target)}
      onBlur={leaves}
    >
      {children}
    </div>
  );
}

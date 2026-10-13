"use client";

import { useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { useHeatCard } from "./HeatCard";

/**
 * Hover, tap and keyboard for the marks of a chart (a bar, a slice, a season cell), the way the season heat map does it: a mouse or pen shows
 * the card while over the mark; a finger's first tap shows it and a second tap opens the mark; the arrow keys walk the marks (one tab stop for
 * the whole chart) and Enter opens one. The card is drawn in a portal (HeatCard) so no chart box can clip it.
 *
 * `keys` is the order the arrows walk; `open` is what a mark does when chosen (leave it out for a mark that only shows its card).
 * `bind(key, body)` gives the props for one mark; `body` is a function so the card is only built when it is shown.
 */
export function usePointCard(keys: readonly string[], open?: (key: string) => void) {
  const card = useHeatCard();
  const touched = useRef(false);
  const [picked, setPicked] = useState<string | null>(null);
  const stop = picked && keys.includes(picked) ? picked : keys[0] ?? null;

  const bind = (key: string, body: () => ReactNode) => ({
    "data-heat": key,
    tabIndex: key === stop ? 0 : -1,
    onPointerDown: (ev: PointerEvent) => { touched.current = ev.pointerType === "touch"; },
    onPointerEnter: (ev: PointerEvent<Element>) => { if (ev.pointerType !== "touch") card.show(ev.currentTarget, body()); },
    onPointerLeave: (ev: PointerEvent<Element>) => { if (ev.pointerType !== "touch") card.hide(); },
    onFocus: (ev: FocusEvent<Element>) => {
      setPicked(key);
      // Only a keyboard's arrival shows the card: a press that happens to focus the mark must not (a first tap would open it).
      if (ev.currentTarget.matches(":focus-visible")) card.show(ev.currentTarget, body());
    },
    onBlur: (ev: FocusEvent<Element>) => { if (card.shownOn() === ev.currentTarget) card.hide(); },
    onClick: (ev: MouseEvent<Element>) => {
      if (touched.current && card.shownOn() !== ev.currentTarget) { ev.preventDefault(); card.show(ev.currentTarget, body()); return; }
      if (open) { ev.preventDefault(); open(key); }
    },
    onKeyDown: (ev: KeyboardEvent<Element>) => {
      const at = keys.indexOf(key);
      let to = -1;
      if (ev.key === "ArrowRight" || ev.key === "ArrowDown") to = Math.min(keys.length - 1, at + 1);
      else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") to = Math.max(0, at - 1);
      else if (ev.key === "Home") to = 0;
      else if (ev.key === "End") to = keys.length - 1;
      else if ((ev.key === "Enter" || ev.key === " ") && open) { ev.preventDefault(); open(key); return; }
      else if (ev.key === "Escape") { card.hide(); return; }
      else return;
      ev.preventDefault();
      if (to >= 0 && to !== at) {
        const root = ev.currentTarget.closest("[data-marks]");
        root?.querySelector<HTMLElement | SVGElement>(`[data-heat="${CSS.escape(keys[to])}"]`)?.focus();
      }
    },
  });
  return { bind, element: card.element, hide: card.hide };
}

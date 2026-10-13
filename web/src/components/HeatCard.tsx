"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface Shown { anchor: Element; body: ReactNode }
interface Store { get: () => Shown | null; set: (s: Shown | null) => void; subscribe: (fn: () => void) => () => void }

const GAP = 8; // between the square and the card
const EDGE = 8; // the least room kept between the card and the window's edge

const makeStore = (): Store => {
  let cur: Shown | null = null;
  const subs = new Set<() => void>();
  return {
    get: () => cur,
    set: (s) => { cur = s; subs.forEach((f) => f()); },
    subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; },
  };
};

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Where a card of `w` x `h` goes for the square `a`: below it when there is room, else above, centred on it and kept inside the window. */
export function placeCard(a: { left: number; right: number; top: number; bottom: number }, w: number, h: number, vw: number, vh: number) {
  const below = vh - a.bottom - GAP - EDGE, above = a.top - GAP - EDGE;
  const top = h <= below || (h > above && below >= above) ? a.bottom + GAP : a.top - GAP - h;
  return {
    left: clamp((a.left + a.right) / 2 - w / 2, EDGE, vw - w - EDGE),
    top: clamp(top, EDGE, vh - h - EDGE),
  };
}

/**
 * The hover card of a season square. It is drawn in a portal on the page body with `position: fixed` and placed from the square's own
 * box, so no overflow-clipping ancestor (the chart's scroll box) can cut it and it never changes the page's size or scroll. The card
 * lives in its own store, so showing it re-renders the card alone, not the chart's hundreds of squares.
 */
export function useHeatCard() {
  const [store] = useState(makeStore);
  const [api] = useState(() => ({
    show: (anchor: Element, body: ReactNode) => store.set({ anchor, body }),
    hide: () => { if (store.get()) store.set(null); },
    /** The square the card is on now, if any. */
    shownOn: () => store.get()?.anchor ?? null,
  }));
  return { ...api, element: <HeatCardView store={store} /> };
}

function HeatCardView({ store }: { store: Store }) {
  const cur = useSyncExternalStore(store.subscribe, store.get, () => null);
  const box = useRef<HTMLDivElement | null>(null);

  const place = () => {
    const t = box.current;
    if (!t || !cur) return;
    const a = cur.anchor.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    // The square left the page (a redraw, a scroll) or slid out of its scrolling chart: no card.
    const clip = cur.anchor.closest(".chart")?.getBoundingClientRect();
    const cx = (a.left + a.right) / 2, cy = (a.top + a.bottom) / 2;
    if (!cur.anchor.isConnected || cx < 0 || cx > vw || cy < 0 || cy > vh || (clip && (cx < clip.left || cx > clip.right))) { store.set(null); return; }
    const p = placeCard(a, t.offsetWidth, t.offsetHeight, vw, vh);
    t.style.left = `${p.left}px`;
    t.style.top = `${p.top}px`;
  };

  // Placed before paint, so it never shows at the corner first.
  useLayoutEffect(place);

  useEffect(() => {
    if (!cur) return;
    let frame = 0;
    const again = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); };
    // A tap away from every square, or Escape, puts the card away; scrolling and resizing keep it on its square.
    const away = (ev: PointerEvent) => { if (!(ev.target instanceof Element && ev.target.closest("[data-heat]"))) store.set(null); };
    const esc = (ev: KeyboardEvent) => { if (ev.key === "Escape") store.set(null); };
    window.addEventListener("scroll", again, true);
    window.addEventListener("resize", again);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", again, true);
      window.removeEventListener("resize", again);
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur]);

  if (!cur) return null;
  return createPortal(<div className="tip heatcard" ref={box} role="tooltip">{cur.body}</div>, document.body);
}

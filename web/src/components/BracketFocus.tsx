"use client";

import { useEffect, useRef } from "react";
import { contextDay, fadedBy, playingOn, type BracketMark } from "@/lib/bracketGroups";

const SVG_NS = "http://www.w3.org/2000/svg";

/** The tie a link of the drawing belongs to, by the box's own address. */
const tiesOf = (root: HTMLElement) => [...root.querySelectorAll<SVGGElement>("g.tb-tie")].map((g) => ({ g, h: g.querySelector("a.tb-link")?.getAttribute("href") ?? "" }));

/**
 * Two things a season's bracket does in the reader's browser, so the drawing (a file cached a day, the same for everyone) never changes:
 *
 *   Preview. Hovering or focusing a group button (an element carrying `data-bg`, the group it would choose: "" for all) fades the ties with no club of that group, as a click
 *   would (`ko-dim`, knockout.css), without a request. It is a class (`pv-dim`) on the loaded SVG's ties, and the wrapper's `data-preview` lets the click's own fade give way
 *   while a preview shows.
 *
 *   Today. A tie with a game on the day the page is about (the address's ?date=, else the reader's own day) gets a ring and a small tag (`ko-today`), inviting a click.
 *   The days come with the page as data (`marks`), the day is worked out here. The drawings load when they come into view, so a watcher marks each one as it arrives.
 */
export function BracketFocus({ marks, asked, today, todayTitle, children }: { marks: BracketMark[]; asked: string; today: string; todayTitle: string; children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const mark = () => {
      const on = playingOn(marks, contextDay(asked, new Date()));
      for (const { g, h } of tiesOf(el)) {
        const has = on.has(h);
        g.classList.toggle("ko-today", has);
        const tag = g.querySelector(".ko-todaytag");
        const link = g.querySelector<SVGAElement>("a.tb-link");
        if (!has) {
          tag?.remove();
          if (link?.dataset.label != null) { link.setAttribute("aria-label", link.dataset.label); delete link.dataset.label; }
          continue;
        }
        const box = g.querySelector<SVGRectElement>("rect.tb-box");
        if (tag || !link || !box) continue;
        const x = Number(box.getAttribute("x")), y = Number(box.getAttribute("y")), w = Number(box.getAttribute("width"));
        const width = Math.max(44, today.length * 8 + 18);
        const t = document.createElementNS(SVG_NS, "g");
        t.setAttribute("class", "ko-todaytag");
        t.setAttribute("pointer-events", "none");
        const r = document.createElementNS(SVG_NS, "rect");
        r.setAttribute("x", String(x + w - width - 8)); r.setAttribute("y", String(y - 9)); r.setAttribute("width", String(width)); r.setAttribute("height", "18"); r.setAttribute("rx", "9");
        const tx = document.createElementNS(SVG_NS, "text");
        tx.setAttribute("x", String(x + w - width / 2 - 8)); tx.setAttribute("y", String(y + 3.5)); tx.setAttribute("text-anchor", "middle");
        tx.textContent = today;
        t.append(r, tx);
        link.append(t);
        link.dataset.label = link.getAttribute("aria-label") ?? "";
        link.setAttribute("aria-label", `${link.dataset.label} (${todayTitle})`.trim());
      }
    };
    mark();
    // A drawing arrives as an <svg> added to its box (RoadArt); marking adds only inside it, so this does not feed itself.
    const watch = new MutationObserver((list) => {
      if (list.some((m) => [...m.addedNodes].some((n) => n.nodeName.toLowerCase() === "svg"))) mark();
    });
    watch.observe(el, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, [marks, asked, today, todayTitle]);

  // A new page (a group chosen, a click's own fade drawn) answers whatever the pointer was previewing.
  useEffect(() => { if (root.current) delete root.current.dataset.preview; }, [marks]);

  const preview = (group: string | null) => {
    const el = root.current;
    if (!el) return;
    for (const { g } of tiesOf(el)) g.classList.remove("pv-dim");
    if (group == null) { delete el.dataset.preview; return; }
    el.dataset.preview = "1";
    const faded = fadedBy(marks, group);
    for (const { g, h } of tiesOf(el)) if (faded.has(h)) g.classList.add("pv-dim");
  };
  const groupOf = (t: EventTarget | null) => (t instanceof Element ? t.closest("[data-bg]")?.getAttribute("data-bg") ?? null : null);

  return (
    <div
      ref={root}
      className="bkfocus"
      onPointerOver={(e) => { if (e.pointerType !== "touch") { const g = groupOf(e.target); if (g != null) preview(g); } }}
      onPointerOut={(e) => { if (groupOf(e.target) != null && groupOf(e.relatedTarget) == null) preview(null); }}
      onFocus={(e) => { const g = groupOf(e.target); if (g != null) preview(g); }}
      onBlur={(e) => { if (groupOf(e.target) != null && groupOf(e.relatedTarget) == null) preview(null); }}
    >
      {children}
    </div>
  );
}

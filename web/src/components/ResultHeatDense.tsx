"use client";

import { useEffect, useMemo, useRef, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { heatHit, heatPaths, type GameTone, type HeatCell, type HeatGrid } from "@/lib/resultHeat";
import type { useHeatCard } from "./HeatCard";

/**
 * The squares of a long graph (a club's every game, up to 20,000): one path per result colour and one ring that follows the pointer, so the browser
 * styles, lays out and paints a handful of elements, not 20,000. The square under the pointer is found from its position, and its card is made only then.
 * The few-hundred-square graphs (one season) stay one element each in ResultHeat, where every square can be reached by keyboard.
 */
export function ResultHeatDense({ grid, left, top, cell, gap, width, height, aria, toneClass, card, bodyOf, open, marks }: {
  grid: HeatGrid; left: number; top: number; cell: number; gap: number; width: number; height: number; aria: string;
  toneClass: (t: GameTone) => string;
  card: ReturnType<typeof useHeatCard>;
  bodyOf: (c: HeatCell) => ReactNode;
  open: (c: HeatCell) => void;
  marks: ReactNode;
}) {
  const step = cell + gap;
  const svg = useRef<SVGSVGElement | null>(null);
  const ring = useRef<SVGRectElement | null>(null);
  const at = useRef<number | null>(null);
  const touched = useRef(false);
  const paths = useMemo(() => heatPaths(grid, left, top, cell, gap), [grid, left, top, cell, gap]);

  const hitOf = (ev: { clientX: number; clientY: number }) => {
    const el = svg.current;
    if (!el) return null;
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) return null;
    return heatHit(grid, (ev.clientX - b.left) * (width / b.width), (ev.clientY - b.top) * (height / b.height), left, top, step);
  };
  const clear = () => {
    at.current = null;
    if (ring.current) ring.current.setAttribute("visibility", "hidden");
    if (svg.current) svg.current.style.cursor = "";
    if (ring.current && card.shownOn() === ring.current) card.hide();
  };
  const show = ({ col, row, cell: c }: { col: number; row: number; cell: HeatCell }) => {
    const r = ring.current;
    if (!r) return;
    r.setAttribute("x", String(left + col * step - 2));
    r.setAttribute("y", String(top + row * step - 2));
    r.setAttribute("width", String(cell + 4));
    r.setAttribute("height", String(cell + 4));
    r.setAttribute("visibility", "visible");
    at.current = c.game.id;
    card.show(r, bodyOf(c));
  };

  // A tap elsewhere or Escape puts the ring away with the card.
  useEffect(() => {
    const away = (ev: Event) => { if (!(ev.target instanceof Node && svg.current?.contains(ev.target))) clear(); };
    const esc = (ev: KeyboardEvent) => { if (ev.key === "Escape") clear(); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // A new graph (another width or another club) has other squares under the ring.
  useEffect(() => clear, [grid]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMove = (ev: PointerEvent<SVGSVGElement>) => {
    if (ev.pointerType === "touch") return;
    const c = hitOf(ev);
    if (!c) { if (at.current != null) clear(); return; }
    if (c.cell.game.id === at.current) return;
    if (svg.current) svg.current.style.cursor = "pointer";
    show(c);
  };
  const onClick = (ev: MouseEvent<SVGSVGElement>) => {
    const c = hitOf(ev);
    if (!c) { if (touched.current) clear(); return; }
    if (touched.current && !(card.shownOn() === ring.current && at.current === c.cell.game.id)) {
      ev.preventDefault();
      show(c);
      return;
    }
    open(c.cell);
  };

  return (
    <svg ref={svg} viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={aria} data-heat="dense"
      data-games={grid.games} data-rows={grid.rows} data-cell={cell}
      onPointerDown={(ev) => { touched.current = ev.pointerType === "touch"; }}
      onPointerMove={onMove} onPointerLeave={(ev) => { if (ev.pointerType !== "touch") clear(); }} onClick={onClick}>
      {marks}
      {paths.map((p) => <path key={p.tone} className={`sq ${toneClass(p.tone)}`} d={p.d} />)}
      <rect ref={ring} className="hi" rx={3} visibility="hidden" pointerEvents="none" />
    </svg>
  );
}

"use client";

import { area, bisector, curveStepAfter, extent, line, pointer, scaleLinear } from "d3";
import { useState } from "react";
import { TipLines, useTooltip } from "./Tooltip";
import { useChartWidth } from "./useChartWidth";
import "./h2h.css";

/** One step of the line: the lead of side a (its wins minus the other's) after a season or a game, with the words the tooltip shows. */
export interface H2hPoint { x: number; y: number; title: string; lines: string[] }

interface Props {
  points: H2hPoint[];
  /** "{team} ahead" for each side, the legend. */
  legend: [string, string];
  aria: string;
  none: string;
  /** Games of one season are drawn game by game (the line ends where the last game is); seasons run on to the end of the last one. */
  byGame: boolean;
}

interface Node { x: number; y: number; at: number | null }

/** The running lead of one club over the other: above the line side a is ahead, below it side b is. */
export function H2hChart({ points, legend, aria, none, byGame }: Props) {
  const [ref, W] = useChartWidth(900, 300);
  const tip = useTooltip(ref);
  const [at, setAt] = useState<number | null>(null);
  if (points.length < 2 && !(points.length === 1 && !byGame)) return <div className="chart" ref={ref}><p className="note">{none}</p></div>;

  // The line starts from level before the first step, and (by season) runs to the end of the last season.
  const lead: Node = { x: points[0].x - 1, y: 0, at: null };
  const nodes: Node[] = [lead, ...points.map((p, i) => ({ x: p.x, y: p.y, at: i })), ...(byGame ? [] : [{ x: points[points.length - 1].x + 1, y: points[points.length - 1].y, at: null }])];
  const H = 260, m = { t: 12, r: 14, b: 26, l: 40 };
  const x = scaleLinear([lead.x, nodes[nodes.length - 1].x], [m.l, W - m.r]);
  const [lo = 0, hi = 0] = extent(nodes, (p) => p.y);
  const y = scaleLinear(lo === 0 && hi === 0 ? [-1, 1] : [Math.min(lo, 0), Math.max(hi, 0)], [H - m.b, m.t]).nice();
  const yTicks = y.ticks(5).filter(Number.isInteger);
  const xTicks = x.ticks(Math.max(2, Math.min(10, Math.floor((W - m.l - m.r) / 80)))).filter(Number.isInteger).filter((v) => v >= points[0].x - (byGame ? 1 : 0));
  const bis = bisector<H2hPoint, number>((p) => p.x).center;
  const cur = at == null ? null : points[at];
  const step = curveStepAfter;
  return (
    <div className="chart h2hchart" ref={ref}>
      <div className="legend">
        <span><i style={{ background: "var(--ca)" }} />{legend[0]}</span>
        <span><i style={{ background: "var(--cb)" }} />{legend[1]}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria}>
        <g>{yTicks.map((t) => <line key={t} x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--rule)" />)}</g>
        <g>{yTicks.map((t) => <text key={t} x={m.l - 6} y={y(t)} dy="0.32em" textAnchor="end">{Math.abs(t)}</text>)}</g>
        <g>{xTicks.map((v) => <text key={v} x={x(v)} y={H - 6} textAnchor="middle">{v}</text>)}</g>
        <path d={area<Node>().x((p) => x(p.x)).y0(y(0)).y1((p) => y(Math.max(p.y, 0))).curve(step)(nodes) ?? undefined} fill="var(--ca)" opacity={0.28} />
        <path d={area<Node>().x((p) => x(p.x)).y0(y(0)).y1((p) => y(Math.min(p.y, 0))).curve(step)(nodes) ?? undefined} fill="var(--cb)" opacity={0.28} />
        <line className="zero" x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} />
        <path d={line<Node>().x((p) => x(p.x)).y((p) => y(p.y)).curve(step)(nodes) ?? undefined} fill="none" stroke="var(--ink)" strokeWidth={1.8} strokeLinejoin="round" />
        {cur ? <circle cx={x(cur.x)} cy={y(cur.y)} r={4.5} fill={cur.y >= 0 ? "var(--ca)" : "var(--cb)"} stroke="var(--paper)" strokeWidth={1.5} /> : null}
        <rect x={m.l} y={0} width={W - m.l - m.r} height={H - m.b} fill="transparent" style={{ touchAction: "pan-y" }}
          onPointerMove={(ev) => {
            const [mx] = pointer(ev.nativeEvent, ev.currentTarget);
            const i = Math.max(0, Math.min(points.length - 1, bis(points, x.invert(mx))));
            setAt(i);
            tip.show(ev, <TipLines title={points[i].title} lines={points[i].lines} />);
          }}
          onPointerLeave={() => { tip.hide(); setAt(null); }} />
      </svg>
      {tip.element}
    </div>
  );
}

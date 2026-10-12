"use client";

import { bisector, curveLinear, curveStepAfter, extent, line, pointer, scaleLinear } from "d3";
import { useState } from "react";
import { TipLines, useTooltip } from "./Tooltip";
import { useChartWidth } from "./useChartWidth";
import "./h2h.css";

/** One step of a team's line: wins minus losses after a game (x is the game number) or a season (x is the year), with the words its tooltip shows. */
export interface ComparePoint { x: number; y: number; title: string; line: string }
export interface CompareSeries { name: string; points: ComparePoint[] }

interface Props {
  /** The two teams, first side first (--ca and --cb colour them, from SeriesStyle). */
  series: [CompareSeries, CompareSeries];
  aria: string;
  none: string;
  /** Seasons are drawn as steps; the games of one season as a straight line. */
  steps?: boolean;
}

const bis = bisector<ComparePoint, number>((p) => p.x).right;
/** The last point at or before x (a team that has played fewer games than the other keeps its last figure). */
const at = (pts: ComparePoint[], x: number): ComparePoint | null => { const i = bis(pts, x) - 1; return i >= 0 ? pts[i] : null; };

/** Both teams' wins minus losses on one axis: above the zero line a team is over .500, below it under. */
export function CompareChart({ series, aria, none, steps }: Props) {
  const [ref, W] = useChartWidth(900, 300);
  const tip = useTooltip(ref);
  const [cur, setCur] = useState<number | null>(null);
  const all = [...series[0].points, ...series[1].points];
  if (all.length < 2) return <div className="chart" ref={ref}><p className="note">{none}</p></div>;

  const H = 280, m = { t: 12, r: 14, b: 26, l: 40 };
  const [x0 = 0, x1 = 1] = extent(all, (p) => p.x);
  const x = scaleLinear([x0, x1 === x0 ? x0 + 1 : x1], [m.l, W - m.r]);
  const [lo = 0, hi = 0] = extent(all, (p) => p.y);
  const y = scaleLinear([Math.min(lo, 0), Math.max(hi, 0, 1)], [H - m.b, m.t]).nice();
  const yTicks = y.ticks(6).filter(Number.isInteger);
  const xTicks = x.ticks(Math.max(2, Math.min(10, Math.floor((W - m.l - m.r) / 80)))).filter(Number.isInteger);
  const xs = [...new Set(all.map((p) => p.x))].sort((p, q) => p - q);
  const path = (pts: ComparePoint[]) => line<ComparePoint>().x((p) => x(p.x)).y((p) => y(p.y)).curve(steps ? curveStepAfter : curveLinear)(pts) ?? undefined;
  const dots = cur == null ? [] : series.map((s, i) => ({ i, p: at(s.points, cur) })).filter((d): d is { i: number; p: ComparePoint } => d.p != null);
  return (
    <div className="chart h2hchart" ref={ref}>
      <div className="legend">
        <span><i style={{ background: "var(--ca)" }} />{series[0].name}</span>
        <span><i style={{ background: "var(--cb)" }} />{series[1].name}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria}>
        <g>{yTicks.map((t) => <line key={t} x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--rule)" />)}</g>
        <g>{yTicks.map((t) => <text key={t} x={m.l - 6} y={y(t)} dy="0.32em" textAnchor="end">{t > 0 ? `+${t}` : t < 0 ? `−${Math.abs(t)}` : 0}</text>)}</g>
        <g>{xTicks.map((v) => <text key={v} x={x(v)} y={H - 6} textAnchor="middle">{v}</text>)}</g>
        <line className="zero" x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} />
        <path d={path(series[0].points)} fill="none" stroke="var(--ca)" strokeWidth={2.2} strokeLinejoin="round" />
        <path d={path(series[1].points)} fill="none" stroke="var(--cb)" strokeWidth={2.2} strokeLinejoin="round" strokeDasharray="6 3" />
        {cur != null ? <line x1={x(cur)} x2={x(cur)} y1={m.t} y2={H - m.b} stroke="var(--muted)" strokeDasharray="2 3" /> : null}
        {dots.map((d) => <circle key={d.i} cx={x(d.p.x)} cy={y(d.p.y)} r={4.5} fill={d.i === 0 ? "var(--ca)" : "var(--cb)"} stroke="var(--paper)" strokeWidth={1.5} />)}
        <rect x={m.l} y={0} width={W - m.l - m.r} height={H - m.b} fill="transparent" style={{ touchAction: "pan-y" }}
          onPointerMove={(ev) => {
            const [mx] = pointer(ev.nativeEvent, ev.currentTarget);
            const target = x.invert(mx);
            const v = xs.reduce((best, c) => (Math.abs(c - target) < Math.abs(best - target) ? c : best), xs[0]);
            setCur(v);
            const here = series.map((s) => at(s.points, v));
            tip.show(ev, <TipLines title={(here.find((p) => p?.x === v) ?? here[0] ?? here[1])?.title ?? ""} lines={here.map((p, i) => (p ? `${series[i].name}: ${p.line}` : null))} />);
          }}
          onPointerLeave={() => { tip.hide(); setCur(null); }} />
      </svg>
      {tip.element}
    </div>
  );
}

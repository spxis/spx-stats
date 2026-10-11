"use client";

import { max, scaleBand, scaleLinear } from "d3";
import { useSpeaker } from "./i18n/LocaleProvider";
import { useChartWidth } from "./useChartWidth";

export interface SeasonPoint { year: number; label: string; value: number | null }

/** One bar for each season of the main stat, regular season; a season the player sat out stays an empty slot. */
export function PlayerChart({ points, stat, aria }: { points: SeasonPoint[]; stat: string; aria: string }) {
  const { fmt } = useSpeaker();
  const [ref, W] = useChartWidth(320, 260);
  const H = 190, m = { t: 12, r: 8, b: 26, l: 36 };
  const top = max(points, (p) => p.value ?? 0) ?? 0;
  const x = scaleBand<number>(points.map((p) => p.year), [m.l, W - m.r]).paddingInner(0.18);
  const y = scaleLinear([0, Math.max(top, 1)], [H - m.b, m.t]).nice();
  const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor((W - m.l - m.r) / 54))));
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria}>
        <g>{y.ticks(4).map((t) => (
          <g key={t}><line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--rule)" /><text x={m.l - 6} y={y(t)} dy="0.32em" textAnchor="end">{fmt(t)}</text></g>
        ))}</g>
        <g>{points.map((p) => p.value == null ? null : (
          <rect key={p.year} className="seg-w" x={x(p.year)} y={y(p.value)} width={x.bandwidth()} height={Math.max(0, y(0) - y(p.value))}>
            <title>{`${p.label}: ${fmt(p.value)} ${stat}`}</title>
          </rect>
        ))}</g>
        <g>{points.map((p, i) => i % every ? null : (
          <text key={p.year} x={(x(p.year) ?? 0) + x.bandwidth() / 2} y={H - 8} textAnchor="middle">{p.label}</text>
        ))}</g>
      </svg>
    </div>
  );
}

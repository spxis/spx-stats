"use client";

import { max, scaleBand, scaleLinear } from "d3";
import { useRouter } from "next/navigation";
import { fmt } from "@/lib/format";
import { TipLines, useTooltip } from "./Tooltip";
import { useChartWidth } from "./useChartWidth";

export interface BarSeason { year: number; label: string; games: number; finals: number; champion: string | null }

/** Games held (pale) and games with a result (solid), a bar per season. */
export function SeasonBars({ list, lg }: { list: BarSeason[]; lg: string }) {
  const router = useRouter();
  const [ref, W] = useChartWidth(1180, 300);
  const tip = useTooltip(ref);
  const H = 220, m = { t: 10, r: 6, b: 24, l: 48 };
  const x = scaleBand<number>(list.map((s) => s.year), [m.l, W - m.r]).padding(0.15);
  const y = scaleLinear([0, max(list, (s) => s.games) || 1], [H - m.b, m.t]).nice();
  const ticks = y.ticks(4);
  const step = Math.ceil(list.length / Math.max(1, Math.floor((W - m.l) / 42)));
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Games and results per season">
        <g>{ticks.map((t) => <line key={t} x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--rule)" />)}</g>
        <g>{ticks.map((t) => <text key={t} x={m.l - 6} y={y(t)} dy="0.32em" textAnchor="end">{fmt(t)}</text>)}</g>
        <g>{list.filter((_, i) => i % step === 0).map((s) => (
          <text key={s.year} x={(x(s.year) ?? 0) + x.bandwidth() / 2} y={H - 6} textAnchor="middle">{s.year}</text>
        ))}</g>
        <g>{list.map((s) => (
          <g key={s.year} style={{ cursor: "pointer" }} onClick={() => router.push(`/${lg}/${s.year}`)}
            onMouseMove={(ev) => tip.show(ev, <TipLines title={s.label} lines={[`${fmt(s.games)} games, ${fmt(s.finals)} with a result`, s.champion ? `Champion: ${s.champion}` : null]} />)}
            onMouseLeave={tip.hide}>
            <rect x={x(s.year)} width={x.bandwidth()} y={y(s.games)} height={y(0) - y(s.games)} fill="var(--accent)" opacity={0.22} rx={2} />
            <rect x={x(s.year)} width={x.bandwidth()} y={y(s.finals)} height={y(0) - y(s.finals)} fill="var(--accent)" rx={2} />
          </g>
        ))}</g>
      </svg>
      {tip.element}
    </div>
  );
}

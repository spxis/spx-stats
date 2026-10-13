"use client";

import { max, scaleBand, scaleLinear } from "d3";
import { useRouter } from "next/navigation";
import { useSpeaker } from "./i18n/LocaleProvider";
import { TipLines, useTooltip } from "./Tooltip";
import { useChartWidth } from "./useChartWidth";
import { seasonPath } from "@/lib/slug";

export interface BarSeason { year: number; label: string; games: number; finals: number; champion: string | null; none?: boolean }

/** Games held (pale) and games with a result (solid), a bar per season. */
export function SeasonBars({ list, lg }: { list: BarSeason[]; lg: string }) {
  const router = useRouter();
  const { say, fmt } = useSpeaker();
  const [ref, W] = useChartWidth(1180, 300);
  const tip = useTooltip(ref);
  const H = 220, m = { t: 10, r: 6, b: 24, l: 48 };
  const x = scaleBand<number>(list.map((s) => s.year), [m.l, W - m.r]).padding(0.15);
  const y = scaleLinear([0, max(list, (s) => s.games) || 1], [H - m.b, m.t]).nice();
  const ticks = y.ticks(4);
  const step = Math.ceil(list.length / Math.max(1, Math.floor((W - m.l) / 42)));
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={say("bars.aria")}>
        <g>{ticks.map((t) => <line key={t} x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--rule)" />)}</g>
        <g>{ticks.map((t) => <text key={t} x={m.l - 6} y={y(t)} dy="0.32em" textAnchor="end">{fmt(t)}</text>)}</g>
        <g>{list.filter((_, i) => i % step === 0).map((s) => (
          <text key={s.year} x={(x(s.year) ?? 0) + x.bandwidth() / 2} y={H - 6} textAnchor="middle">{s.year}</text>
        ))}</g>
        <g>{list.map((s) => (
          <g key={s.year} data-season={s.year} style={{ cursor: "pointer" }} onClick={() => router.push(seasonPath(lg, s.year))}
            onMouseMove={(ev) => tip.show(ev, <TipLines title={s.label} lines={s.none ? [say("noseason.league")] : [say("bars.tip", { games: fmt(s.games), finals: fmt(s.finals) }), s.champion ? say("tip.champion", { team: s.champion }) : null]} />)}
            onMouseLeave={tip.hide}>
            <rect className="hit" x={(x(s.year) ?? 0) - x.step() * x.paddingInner() / 2} width={x.step()} y={m.t} height={H - m.b - m.t} fill="transparent" />
            {s.none ? <rect x={x(s.year)} width={x.bandwidth()} y={y(ticks[ticks.length - 1])} height={y(0) - y(ticks[ticks.length - 1])} fill="var(--soft)" stroke="var(--rule)" strokeDasharray="3 2" rx={2} /> : null}
            <rect x={x(s.year)} width={x.bandwidth()} y={y(s.games)} height={y(0) - y(s.games)} fill="var(--accent)" opacity={0.22} rx={2} />
            <rect x={x(s.year)} width={x.bandwidth()} y={y(s.finals)} height={y(0) - y(s.finals)} fill="var(--accent)" rx={2} />
          </g>
        ))}</g>
      </svg>
      {tip.element}
    </div>
  );
}

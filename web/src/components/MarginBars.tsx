"use client";

import { format, max, scaleBand, scaleLinear } from "d3";
import { useRouter } from "next/navigation";
import { fmt } from "@/lib/format";
import { seasonLabel } from "@/lib/leagues";
import { TipLines, useTooltip } from "./Tooltip";
import { useChartWidth } from "./useChartWidth";

export interface MarginSeason { year: number; gp: number; pf: number; pa: number }

/** Scoring margin per game for each season: bars up in the team colour when it outscored its opponents. A bar opens that season's games. */
export function MarginBars({ rows, lg, f }: { rows: MarginSeason[]; lg: string; f: number }) {
  const router = useRouter();
  const [ref, W] = useChartWidth(1180, 300);
  const tip = useTooltip(ref);
  const list = rows.filter((r) => r.gp > 0).map((r) => ({ ...r, d: (r.pf - r.pa) / r.gp })).sort((a, b) => a.year - b.year);
  if (list.length < 2) return <div className="chart" ref={ref}><p className="note">No scoring figures for this team yet.</p></div>;
  const H = 220, m = { t: 10, r: 6, b: 24, l: 40 };
  const x = scaleBand<number>(list.map((s) => s.year), [m.l, W - m.r]).padding(0.12);
  const ext = max(list, (s) => Math.abs(s.d)) || 1;
  const y = scaleLinear([-ext, ext], [H - m.b, m.t]).nice();
  const ticks = y.ticks(4);
  const step = Math.ceil(list.length / Math.max(1, Math.floor((W - m.l) / 42)));
  const g1 = format(".2f"), tick = format("~g");
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Points for minus points against per game, by season">
        <g>{ticks.map((t) => <line key={t} x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--rule)" />)}</g>
        <g>{ticks.map((t) => <text key={t} x={m.l - 6} y={y(t)} dy="0.32em" textAnchor="end">{(t > 0 ? "+" : "") + tick(t)}</text>)}</g>
        <g>{list.filter((_, i) => i % step === 0).map((s) => (
          <text key={s.year} x={(x(s.year) ?? 0) + x.bandwidth() / 2} y={H - 6} textAnchor="middle">{s.year}</text>
        ))}</g>
        <g>{list.map((s, i) => (
          <rect key={s.year} className="bar-grow" x={x(s.year)} width={x.bandwidth()} y={Math.min(y(s.d), y(0))} height={Math.abs(y(s.d) - y(0))}
            fill={s.d >= 0 ? "var(--accent)" : "color-mix(in srgb, var(--ink) 55%, var(--paper))"}
            style={{ cursor: "pointer", transformOrigin: `0px ${y(0)}px`, animationDelay: `${Math.min(i * 4, 400)}ms` }}
            onClick={() => router.push(`/${lg}/${s.year}/team/${f}`)}
            onMouseMove={(ev) => tip.show(ev, <TipLines title={seasonLabel(lg, s.year)} lines={[`${s.d >= 0 ? "+" : ""}${g1(s.d)} per game`, `${fmt(s.pf)} for, ${fmt(s.pa)} against in ${s.gp} games`]} />)}
            onMouseLeave={tip.hide} />
        ))}</g>
        <line className="zero" x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} />
      </svg>
      {tip.element}
    </div>
  );
}

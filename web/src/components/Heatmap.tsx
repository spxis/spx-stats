"use client";

import { max, min, range } from "d3";
import { useRouter } from "next/navigation";
import { fmt } from "@/lib/format";
import { LG } from "@/lib/leagues";
import { TipLines, useTooltip } from "./Tooltip";
import { useChartWidth } from "./useChartWidth";

export interface HeatSeason {
  league: string; year: number; label: string; games: number; finals: number; share: number; champion: string | null;
}

const shareColor = (s: number) => (s <= 0 ? "transparent" : `color-mix(in srgb, var(--accent-cell) ${Math.round(18 + 82 * s)}%, transparent)`);

/** Each square is a season, shaded by how many of its games have a result. */
export function Heatmap({ seasons, leagues }: { seasons: HeatSeason[]; leagues: string[] }) {
  const router = useRouter();
  const [ref, W] = useChartWidth(1180, 640);
  const tip = useTooltip(ref);
  const y0 = min(seasons, (s) => s.year) ?? 0, y1 = max(seasons, (s) => s.year) ?? 0;
  const years = range(y0, y1 + 1);
  const left = 46, rowH = 26, top = 18;
  const cw = (W - left) / years.length;
  const x = (y: number) => left + (y - years[0]) * cw;
  const decades = years.filter((y) => y % 10 === 0);
  const H = top + rowH * leagues.length + 4;
  return (
    <div className="chart scroll" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Share of games with a result, by league and season">
        <g>{decades.map((y) => <text key={y} x={x(y)} y={11}>{y}</text>)}</g>
        <g>{decades.map((y) => <line key={y} x1={x(y)} x2={x(y)} y1={top - 3} y2={top + rowH * leagues.length} stroke="var(--rule)" />)}</g>
        {leagues.map((lg, i) => (
          <g key={lg} transform={`translate(0,${top + i * rowH})`} style={{ "--accent-cell": `var(--${lg})` } as React.CSSProperties}>
            <text className="lab" x={0} y={rowH / 2 + 5}>{LG[lg as keyof typeof LG]}</text>
            {seasons.filter((s) => s.league === lg).map((s) => (
              <rect key={s.year} x={x(s.year) + 0.5} y={3} width={Math.max(1, cw - 1)} height={rowH - 6}
                fill={shareColor(s.share)} stroke={s.share > 0 ? "none" : "var(--rule)"} strokeWidth={0.5} style={{ cursor: "pointer" }}
                onClick={() => router.push(`/${lg}/${s.year}`)}
                onMouseMove={(ev) => tip.show(ev, <TipLines title={`${LG[lg as keyof typeof LG]} ${s.label}`} lines={[
                  s.games ? `${fmt(s.finals)} of ${fmt(s.games)} regular-season games with a result` : "No games held yet",
                  s.champion ? `Champion: ${s.champion}` : null]} />)}
                onMouseLeave={tip.hide} />
            ))}
          </g>
        ))}
      </svg>
      {tip.element}
    </div>
  );
}

"use client";

import { extent, format, line, scaleLinear } from "d3";
import { useRouter } from "next/navigation";
import { fmt3 } from "@/lib/format";
import { seasonLabel } from "@/lib/leagues";
import { useSpeaker } from "./i18n/LocaleProvider";
import { NO_SEASON_KEY, type NoSeasonKind } from "./ui";
import { TipLines, useTooltip } from "./Tooltip";
import { useChartWidth } from "./useChartWidth";
import { seasonPath } from "@/lib/slug";

/** [year, wins, losses, ties, overtime losses] */
export type WinSeason = [number, number, number | null, number | null, number | null];

/** A franchise's winning share, season by season; filled dots are championship seasons. */
export function WinLine({ seasons, titles, lg, idle = [] }: { seasons: WinSeason[]; titles: number[]; lg: string; idle?: [number, NoSeasonKind][] }) {
  const router = useRouter();
  const { say } = useSpeaker();
  const [ref, W] = useChartWidth(1180, 300);
  const tip = useTooltip(ref);
  const pts = seasons
    .map(([y, w, l, t, o]) => ({ y, w, l: l ?? 0, t, o, pct: w + (l ?? 0) + (o || 0) ? w / (w + (l ?? 0) + (o || 0)) : null }))
    .filter((p): p is typeof p & { pct: number } => p.pct != null);
  if (!pts.length) return <div className="chart" ref={ref}><p className="note">{say("winline.none")}</p></div>;
  const H = 240, m = { t: 14, r: 10, b: 26, l: 40 };
  const [a = 0, b = 0] = extent(pts, (p) => p.y);
  const x = scaleLinear([a, b], [m.l, W - m.r]);
  const y = scaleLinear([0, 1], [H - m.b, m.t]);
  const won = new Set(titles);
  const path = line<(typeof pts)[number]>().defined((p, i) => i === 0 || p.y - pts[i - 1].y <= 1).x((p) => x(p.y)).y((p) => y(p.pct))(pts);
  const slot = Math.min(14, (W - m.l - m.r) / Math.max(1, b - a));
  const rules = [0.25, 0.5, 0.75];
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={say("winline.aria")}>
        <g>{rules.map((v) => <line key={v} x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke={v === 0.5 ? "var(--muted)" : "var(--rule)"} strokeDasharray={v === 0.5 ? "4 3" : undefined} />)}</g>
        <g>{rules.map((v) => <text key={v} x={m.l - 6} y={y(v)} dy="0.32em" textAnchor="end">{format(".3f")(v)}</text>)}</g>
        <g>{x.ticks(Math.min(8, pts.length)).filter(Number.isInteger).map((v) => <text key={v} x={x(v)} y={H - 6} textAnchor="middle">{v}</text>)}</g>
        <g>{idle.filter(([v]) => v >= a && v <= b).map(([v, k]) => (
          <rect key={v} x={x(v) - slot / 2} width={slot} y={m.t} height={H - m.b - m.t} fill="var(--soft)" stroke="var(--rule)" strokeDasharray="3 2"
            onMouseMove={(ev) => tip.show(ev, <TipLines title={seasonLabel(lg, v)} lines={[say(NO_SEASON_KEY[k])]} />)} onMouseLeave={tip.hide} />
        ))}</g>
        <path d={path ?? undefined} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
        <g>{pts.map((p) => (
          <circle key={p.y} cx={x(p.y)} cy={y(p.pct)} r={won.has(p.y) ? 6 : 2.5} fill={won.has(p.y) ? "var(--accent)" : "var(--panel)"}
            stroke="var(--accent)" strokeWidth={1.5} style={{ cursor: "pointer" }} onClick={() => router.push(seasonPath(lg, p.y))}
            onMouseMove={(ev) => tip.show(ev, <TipLines title={seasonLabel(lg, p.y)} lines={[`${p.w}-${p.l}${p.t ? `-${p.t}` : ""}${p.o ? `-${p.o}` : ""}`, say("winline.share", { share: fmt3(p.pct) }), won.has(p.y) ? say("winline.won") : null]} />)}
            onMouseLeave={tip.hide} />
        ))}</g>
      </svg>
      {tip.element}
    </div>
  );
}

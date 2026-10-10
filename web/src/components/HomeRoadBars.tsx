"use client";

import { scaleBand, scaleLinear } from "d3";
import { useRouter } from "next/navigation";
import { fmt3 } from "@/lib/format";
import type { Speaker } from "@/lib/i18n/i18n";
import { seasonLabel } from "@/lib/leagues";
import { addRec, EMPTY, recordAt, share } from "@/lib/loc";
import type { StandingRow } from "@/lib/api/types";
import { useSpeaker } from "./i18n/LocaleProvider";
import { TipLines, useTooltip } from "./Tooltip";
import { useChartWidth } from "./useChartWidth";
import "./team.css";

/** What the split says in a sentence: the better side and by how much. Pure, so the team and team-season pages word it alike. */
export function verdictOf(home: number | null, road: number | null, say: Speaker["say"]): { head: string; sub: string } | null {
  if (home == null || road == null) return null;
  const d = home - road;
  const sub = say("verdict.sub", { home: fmt3(home), road: fmt3(road) });
  if (Math.abs(d) < 0.01) return { head: say("verdict.same"), sub };
  return { head: say(d > 0 ? "verdict.betterHome" : "verdict.betterRoad", { by: fmt3(Math.abs(d)) }), sub };
}

/** Win share at home and on the road for each season, as paired bars, with the all-time answer above them. */
export function HomeRoadBars({ rows, lg, f }: { rows: StandingRow[]; lg: string; f: number }) {
  const router = useRouter();
  const { say } = useSpeaker();
  const [ref, W] = useChartWidth(1180, 300);
  const tip = useTooltip(ref);
  const list = rows
    .map((r) => ({ year: r.year, home: share(recordAt(r, "home")), road: share(recordAt(r, "road")) }))
    .filter((r) => r.home != null && r.road != null)
    .sort((a, b) => a.year - b.year) as { year: number; home: number; road: number }[];
  const tot = (loc: "home" | "road") => share(rows.reduce((a, r) => addRec(a, recordAt(r, loc)), EMPTY));
  const v = verdictOf(tot("home"), tot("road"), say);
  if (!list.length) return <div className="chart" ref={ref}><p className="note">{say("hr.none")}</p></div>;
  const H = 220, m = { t: 10, r: 6, b: 24, l: 40 };
  const x = scaleBand<number>(list.map((s) => s.year), [m.l, W - m.r]).padding(0.14);
  const y = scaleLinear([0, 1], [H - m.b, m.t]);
  const half = x.bandwidth() / 2;
  const step = Math.ceil(list.length / Math.max(1, Math.floor((W - m.l) / 42)));
  return (
    <div className="hrbars">
      {v ? <div className="verdict"><b>{v.head}</b><span>{v.sub} {say("hr.together")}</span></div> : null}
      <div className="chart" ref={ref}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={say("hr.aria")}>
          <g>{[0.25, 0.5, 0.75].map((t) => <line key={t} x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke={t === 0.5 ? "var(--muted)" : "var(--rule)"} strokeDasharray={t === 0.5 ? "4 3" : undefined} />)}</g>
          <g>{[0.25, 0.5, 0.75].map((t) => <text key={t} x={m.l - 6} y={y(t)} dy="0.32em" textAnchor="end">{fmt3(t)}</text>)}</g>
          <g>{list.filter((_, i) => i % step === 0).map((s) => <text key={s.year} x={(x(s.year) ?? 0) + x.bandwidth() / 2} y={H - 6} textAnchor="middle">{s.year}</text>)}</g>
          <g>{list.map((s, i) => (
            <g key={s.year} style={{ cursor: "pointer" }} onClick={() => router.push(`/${lg}/${s.year}/team/${f}`)}
              onMouseMove={(ev) => tip.show(ev, <TipLines title={seasonLabel(lg, s.year)} lines={[say("hr.tipHome", { v: fmt3(s.home) }), say("hr.tipRoad", { v: fmt3(s.road) }), say(s.home === s.road ? "hr.same" : s.home > s.road ? "hr.betterHome" : "hr.betterRoad")]} />)}
              onMouseLeave={tip.hide}>
              <rect className="hr-home bar-grow" x={x(s.year)} width={half} y={y(s.home)} height={y(0) - y(s.home)} style={{ transformOrigin: `0px ${y(0)}px`, animationDelay: `${Math.min(i * 4, 400)}ms` }} />
              <rect className="hr-road bar-grow" x={(x(s.year) ?? 0) + half} width={half} y={y(s.road)} height={y(0) - y(s.road)} style={{ transformOrigin: `0px ${y(0)}px`, animationDelay: `${Math.min(i * 4, 400)}ms` }} />
            </g>
          ))}</g>
        </svg>
        {tip.element}
      </div>
      <div className="legend"><span><i className="hr-home" />{say("split.home")}</span><span><i className="hr-road" />{say("split.road")}</span><span>{say("hr.dashed")}</span></div>
    </div>
  );
}

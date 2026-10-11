"use client";

import { area, bisector, curveStepAfter, extent, line, pointer, scaleLinear } from "d3";
import { useState } from "react";
import { fmt3, atUtc } from "@/lib/format";
import { RESULT_KEY } from "@/lib/i18n/keys";
import { playedInOrder, type TeamGame } from "@/lib/teamSeason";
import { useSpeaker } from "./i18n/LocaleProvider";
import { TipLines, useTooltip } from "./Tooltip";
import { useChartWidth } from "./useChartWidth";

interface Point { n: number; diff: number; share: number; g: TeamGame }

/** Wins minus losses after each game with a result, in the order played: how far over (or under) .500 the team stood. */
export function RunningLine({ games }: { games: TeamGame[] }) {
  const { say, dt } = useSpeaker();
  const [ref, W] = useChartWidth(300, 300);
  const tip = useTooltip(ref);
  const [at, setAt] = useState<number | null>(null);
  const played = playedInOrder(games);
  const pts: Point[] = [];
  let diff = 0, w = 0;
  played.forEach((g, i) => {
    if (g.res === "W") { w++; diff++; } else if (g.res === "L" || g.res === "OTL") diff--; else w += 0.5;
    pts.push({ n: i + 1, diff, share: w / (i + 1), g });
  });
  if (pts.length < 2) return <div className="chart" ref={ref}><p className="note">{say("running.none")}</p></div>;
  const H = 240, m = { t: 14, r: 12, b: 26, l: 40 };
  const x = scaleLinear([1, pts.length], [m.l, W - m.r]);
  const [lo = 0, hi = 0] = extent(pts, (p) => p.diff);
  const y = scaleLinear([Math.min(lo, 0), Math.max(hi, 0)], [H - m.b, m.t]).nice();
  const ticks = y.ticks(4);
  const bis = bisector<Point, number>((p) => p.n).center;
  const cur = at == null ? null : pts[at];
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={say("running.aria")}>
        <g>{ticks.map((t) => <line key={t} x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--rule)" />)}</g>
        <g>{ticks.map((t) => <text key={t} x={m.l - 6} y={y(t)} dy="0.32em" textAnchor="end">{(t > 0 ? "+" : "") + t}</text>)}</g>
        <g>{x.ticks(Math.min(8, pts.length)).filter(Number.isInteger).map((v) => <text key={v} x={x(v)} y={H - 6} textAnchor="middle">{v}</text>)}</g>
        <line className="zero" x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} />
        <path d={area<Point>().x((p) => x(p.n)).y0(y(0)).y1((p) => y(p.diff)).curve(curveStepAfter)(pts) ?? undefined} fill="var(--accent)" opacity={0.14} />
        <path className="line-draw" pathLength={1} d={line<Point>().x((p) => x(p.n)).y((p) => y(p.diff)).curve(curveStepAfter)(pts) ?? undefined}
          fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
        {cur ? <circle cx={x(cur.n)} cy={y(cur.diff)} r={4} fill="var(--accent)" stroke="var(--paper)" strokeWidth={1.5} /> : null}
        <rect x={m.l} y={0} width={W - m.l - m.r} height={H - m.b} fill="transparent" style={{ touchAction: "pan-y" }}
          onPointerMove={(ev) => {
            const [mx] = pointer(ev.nativeEvent, ev.currentTarget);
            const i = Math.max(0, Math.min(pts.length - 1, bis(pts, x.invert(mx))));
            const p = pts[i];
            setAt(i);
            tip.show(ev, <TipLines title={say("running.game", { n: p.n, date: dt.monthDayShort(atUtc(p.g.date)) })} lines={[
              say(p.g.loc === "Home" ? "running.vs" : "running.at", { res: say(RESULT_KEY[p.g.res as keyof typeof RESULT_KEY]), mine: p.g.mine ?? "", theirs: p.g.theirs ?? "", opp: p.g.oppName ?? "—" }),
              say("running.record", { rec: p.g.rec }),
              say("running.over", { diff: (p.diff > 0 ? "+" : "") + p.diff, share: fmt3(p.share) }),
            ]} />);
          }}
          onPointerLeave={() => { tip.hide(); setAt(null); }} />
      </svg>
      {tip.element}
    </div>
  );
}

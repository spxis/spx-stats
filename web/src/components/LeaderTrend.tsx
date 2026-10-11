"use client";

import { area, bisector, extent, line, scaleLinear } from "d3";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { leadersPath, showTeam, type TeamKind } from "@/lib/leaderStats";
import { seasonLabel } from "@/lib/leagues";
import { useSpeaker } from "./i18n/LocaleProvider";
import { TipLines, useTooltip } from "./Tooltip";
import { useChartWidth } from "./useChartWidth";
import "./leaders.css";

export interface TrendPoint { year: number; label: string; value: number; worst: number; mean: number; teams: string }

interface Props {
  lg: string;
  points: TrendPoint[];
  /** The season on show, and the season with the best figure ever (null when they are the same or unknown). */
  year: number;
  recordYear: number | null;
  kind: TeamKind;
  stat: string;
  lowIsBest: boolean;
  /** Years the league did not play, drawn as grey slots. */
  idle: number[];
  statId: string;
  view: string;
}

const find = bisector((p: TrendPoint) => p.year).center;

/**
 * The leading value of a stat in every season of the league, with the band from the best to the worst team and the league
 * average; the season on show is marked. Hover (or tap) a season for its leader, press it to open that season's leaders.
 */
export function LeaderTrend({ lg, points, year, recordYear, kind, stat, lowIsBest, idle, statId, view }: Props) {
  const router = useRouter();
  const { say, fmt } = useSpeaker();
  const [ref, W] = useChartWidth(1180, 300);
  const tip = useTooltip(ref);
  const [hover, setHover] = useState<number | null>(null);
  const armed = useRef(false);
  const narrow = W < 520;
  const H = narrow ? 250 : 300, m = { t: 30, r: narrow ? 14 : 22, b: 28, l: narrow ? 40 : 52 };
  const [a = 0, b = 0] = extent(points, (p) => p.year);
  const x = scaleLinear([a, b], [m.l, W - m.r]);
  const [lo = 0, hi = 1] = extent(points.flatMap((p) => [p.value, p.worst, p.mean]));
  const pad = (hi - lo) * 0.06 || 1;
  const y = scaleLinear([lo - pad, hi + pad], [H - m.b, m.t]).nice();
  const joined = (p: TrendPoint, i: number) => i === 0 || p.year - points[i - 1].year <= 1;
  const lead = line<TrendPoint>().defined(joined).x((p) => x(p.year)).y((p) => y(p.value))(points);
  const mean = line<TrendPoint>().defined(joined).x((p) => x(p.year)).y((p) => y(p.mean))(points);
  const band = area<TrendPoint>().defined(joined).x((p) => x(p.year)).y0((p) => y(p.worst)).y1((p) => y(p.value))(points);
  const slot = Math.max(2, Math.min(14, (W - m.l - m.r) / Math.max(1, b - a)));
  const sel = points.find((p) => p.year === year);
  const rec = recordYear != null && recordYear !== year ? points.find((p) => p.year === recordYear) : undefined;
  const shown = hover != null ? points.find((p) => p.year === hover) : undefined;
  const q = new URLSearchParams();
  if (view !== "teams") q.set("view", view);
  q.set("stat", statId);
  const open = (yr: number) => router.push(`${leadersPath(lg, yr)}?${q.toString()}`);
  const xTicks = x.ticks(Math.max(2, Math.floor((W - m.l - m.r) / (narrow ? 62 : 80)))).filter(Number.isInteger);
  const side = (px: number): "start" | "end" | "middle" => (px < m.l + 60 ? "start" : px > W - m.r - 60 ? "end" : "middle");

  const pick = (ev: React.MouseEvent<SVGRectElement>): TrendPoint | undefined => {
    const r = ev.currentTarget.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * (W - m.l - m.r) + m.l;
    return points[find(points, x.invert(px))];
  };
  const tipFor = (p: TrendPoint) => (
    <TipLines title={p.label} lines={[
      `${p.teams}: ${showTeam(kind, p.value, fmt)}`,
      say("leaders.trend.avg", { value: showTeam(kind, p.mean, fmt) }),
      say("leaders.trend.last", { value: showTeam(kind, p.worst, fmt) }),
      p.year === year ? null : say("leaders.trend.open"),
    ]} />
  );

  return (
    <div className="chart ltrend" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={say("leaders.trend.aria", { stat })}>
        <g>{y.ticks(5).map((t) => <line key={t} x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--rule)" />)}</g>
        <g>{y.ticks(5).map((t) => <text key={t} x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end">{showTeam(kind, t, fmt)}</text>)}</g>
        <g>{xTicks.map((t) => <text key={t} x={x(t)} y={H - 8} textAnchor="middle">{t}</text>)}</g>
        <g>{idle.filter((v) => v >= a && v <= b).map((v) => (
          <rect key={v} className="idle" x={x(v) - slot / 2} width={slot} y={m.t} height={H - m.b - m.t}
            onPointerMove={(ev) => tip.show(ev, <TipLines title={seasonLabel(lg, v)} lines={[say("noseason.league")]} />)} onPointerLeave={tip.hide} />
        ))}</g>
        <path className="band" d={band ?? undefined} />
        <path className="mean" d={mean ?? undefined} />
        <path className="lead line-draw" pathLength={1} d={lead ?? undefined} />
        {points.length <= 60 ? <g>{points.map((p) => <circle key={p.year} className="pt" cx={x(p.year)} cy={y(p.value)} r={2.5} />)}</g> : null}
        {rec ? (
          <g>
            <rect className="rec" x={x(rec.year) - 5} y={y(rec.value) - 5} width={10} height={10} transform={`rotate(45 ${x(rec.year)} ${y(rec.value)})`} />
            <text className="tag2" x={x(rec.year)} y={y(rec.value) + (lowIsBest ? 20 : -12)} textAnchor={side(x(rec.year))}>{say("leaders.trend.record")}</text>
          </g>
        ) : null}
        {sel ? (
          <g>
            <line className="guide" x1={x(sel.year)} x2={x(sel.year)} y1={m.t - 8} y2={H - m.b} />
            <circle className="sel" cx={x(sel.year)} cy={y(sel.value)} r={7} />
            <text className="tag" x={x(sel.year)} y={m.t - 14} textAnchor={side(x(sel.year))}>{`${sel.label} · ${showTeam(kind, sel.value, fmt)}`}</text>
          </g>
        ) : null}
        {shown && shown.year !== year ? <circle className="hov" cx={x(shown.year)} cy={y(shown.value)} r={5} /> : null}
        <rect className="hit" x={m.l} y={m.t - 8} width={Math.max(0, W - m.l - m.r)} height={H - m.b - m.t + 8}
          onPointerMove={(ev) => { const p = pick(ev); if (p) { setHover(p.year); tip.show(ev, tipFor(p)); } }}
          onPointerLeave={() => { setHover(null); tip.hide(); }}
          onPointerDown={(ev) => {
            if (ev.pointerType !== "touch") return;
            const p = pick(ev);
            if (!p || p.year === hover) return;
            armed.current = true;
            setHover(p.year);
            tip.show(ev, tipFor(p));
          }}
          onClick={(ev) => {
            if (armed.current) { armed.current = false; return; }
            const p = pick(ev);
            if (p && p.year !== year) open(p.year);
          }} />
      </svg>
      {tip.element}
      <div className="ltrend-legend">
        <span><i className="k-lead" />{say("leaders.trend.leader")}</span>
        <span><i className="k-band" />{say("leaders.trend.band")}</span>
        <span><i className="k-mean" />{say("leaders.trend.avgKey")}</span>
        <span><i className="k-sel" />{say("leaders.trend.thisSeason")}</span>
        {rec ? <span><i className="k-rec" />{say("leaders.trend.record")}</span> : null}
      </div>
    </div>
  );
}

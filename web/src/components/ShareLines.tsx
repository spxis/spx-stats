"use client";

import { bisector, line, scaleLinear } from "d3";
import { useRef, useState, type PointerEvent } from "react";
import { LG } from "@/lib/leagues";
import { pctText } from "@/lib/people-format";
import { useSpeaker } from "./i18n/LocaleProvider";
import { TipLines, useTooltip } from "./Tooltip";
import { useChartWidth } from "./useChartWidth";
import "./country.css";

export interface SharePointData { x: number; share: number; n: number; of: number }
export interface ShareSeries { league: string; points: SharePointData[] }

/**
 * A country's share of each league's players (those whose country is known), decade by decade: one line per league in the league's own colour,
 * with a dot on each decade. Hovering names the decade's figures; the table under the chart holds the same figures.
 */
export function ShareLines({ series, label, tableLabel }: { series: ShareSeries[]; label: string; tableLabel: string }) {
  const { say, fmt, locale } = useSpeaker();
  const [ref, W] = useChartWidth(720, 280);
  const box = useRef<HTMLDivElement | null>(null);
  const tip = useTooltip(box);
  const [at, setAt] = useState<number | null>(null);
  const live = series.filter((s) => s.points.some((p) => p.n > 0));
  const xs = [...new Set(live.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b);
  const H = 240, m = { t: 12, r: 14, b: 26, l: 44 };
  if (!xs.length) return <p className="note">{say("country.trendNone")}</p>;
  const x = scaleLinear([xs[0], xs.at(-1)! === xs[0] ? xs[0] + 10 : xs.at(-1)!], [m.l + 6, W - m.r]);
  const top = Math.max(0.05, ...live.flatMap((s) => s.points.map((p) => p.share)));
  const y = scaleLinear([0, top], [H - m.b, m.t]).nice();
  const path = line<SharePointData>().x((p) => x(p.x)).y((p) => y(p.share));
  const pc = (v: number) => pctText(v, locale);
  const near = bisector<number, number>((v) => v).center;
  const move = (ev: PointerEvent<SVGSVGElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    const i = near(xs, x.invert(((ev.clientX - r.left) / r.width) * W));
    setAt(i);
    tip.show(ev, <TipLines title={say("country.decade", { decade: xs[i] })} lines={live.flatMap((s) => { const p = s.points.find((q) => q.x === xs[i]); return p ? [`${LG[s.league as keyof typeof LG] ?? s.league}: ${pc(p.share)} (${fmt(p.n)} / ${fmt(p.of)})`] : []; })} />);
  };
  return (
    <div className="cline">
      <div className="chart" ref={(el) => { ref.current = el; box.current = el; }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerMove={move} onPointerLeave={() => { setAt(null); tip.hide(); }}>
          <g>{y.ticks(4).map((t) => <line key={t} x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--rule)" />)}</g>
          <g>{y.ticks(4).map((t) => <text key={t} x={m.l - 6} y={y(t)} dy="0.32em" textAnchor="end">{pctText(t, locale, 0)}</text>)}</g>
          <g>{xs.map((t) => <text key={t} x={x(t)} y={H - 8} textAnchor="middle">{t}s</text>)}</g>
          {at != null ? <line className="guide" x1={x(xs[at])} x2={x(xs[at])} y1={m.t} y2={H - m.b} /> : null}
          {live.map((s) => (
            <g key={s.league}>
              <path className="ln" d={path(s.points) ?? undefined} stroke={`var(--${s.league})`} />
              {s.points.map((p) => <circle key={p.x} cx={x(p.x)} cy={y(p.share)} r={4} fill={`var(--${s.league})`} />)}
            </g>
          ))}
        </svg>
        {tip.element}
      </div>
      <div className="legend">{live.map((s) => <span key={s.league}><i style={{ background: `var(--${s.league})` }} />{LG[s.league as keyof typeof LG] ?? s.league}</span>)}</div>
      <details className="ctable">
        <summary>{tableLabel}</summary>
        <div className="tablebox">
          <table>
            <thead><tr><th scope="col">{say("country.decadeCol")}</th>{live.map((s) => <th key={s.league} scope="col" className="num">{LG[s.league as keyof typeof LG] ?? s.league}</th>)}</tr></thead>
            <tbody>
              {xs.map((d) => (
                <tr key={d}>
                  <th scope="row">{d}s</th>
                  {live.map((s) => { const p = s.points.find((q) => q.x === d); return <td key={s.league} className="num">{p ? `${pc(p.share)} (${fmt(p.n)})` : "–"}</td>; })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

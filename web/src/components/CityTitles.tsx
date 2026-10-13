"use client";

import { max, scaleBand, scaleLinear } from "d3";
import { useRef, type FocusEvent, type MouseEvent } from "react";
import { LG } from "@/lib/leagues";
import { useSpeaker } from "./i18n/LocaleProvider";
import { TipLines, useTooltip } from "./Tooltip";
import { useChartWidth } from "./useChartWidth";
import "./city.css";

export interface DecadeTitles { decade: number; counts: Record<string, number> }

/**
 * Championships won by the city's clubs, a column for each decade stacked by league (each in its league's colour). Hovering, tapping or
 * tabbing to a column names the titles of the decade; the championship list under the chart holds the same figures as links.
 */
export function CityTitles({ decades, leagues }: { decades: DecadeTitles[]; leagues: string[] }) {
  const { say, fmt, plural } = useSpeaker();
  const [ref, W] = useChartWidth(720, 280);
  const box = useRef<HTMLDivElement | null>(null);
  const tip = useTooltip(box);
  const total = (d: DecadeTitles) => leagues.reduce((a, l) => a + (d.counts[l] ?? 0), 0);
  const top = max(decades, total) || 1;
  const H = 220, m = { t: 12, r: 8, b: 26, l: 30 };
  const x = scaleBand<number>(decades.map((d) => d.decade), [m.l, W - m.r]).padding(0.18);
  const y = scaleLinear([0, top], [H - m.b, m.t]).nice();
  const ticks = y.ticks(Math.min(4, top));
  const step = Math.ceil(decades.length / Math.max(1, Math.floor((W - m.l) / 46)));
  const lines = (d: DecadeTitles) => leagues.filter((l) => d.counts[l]).map((l) => `${LG[l as keyof typeof LG]}: ${fmt(d.counts[l])}`);
  const label = (d: DecadeTitles) => `${say("titles.decade", { decade: String(d.decade) })}: ${total(d) ? lines(d).join(", ") : say("titles.none")}`;
  const showAt = (ev: FocusEvent<SVGGElement>, d: DecadeTitles) => {
    if (!ev.currentTarget.matches(":focus-visible")) return;
    const r = ev.currentTarget.getBoundingClientRect();
    tip.show({ clientX: r.left + r.width / 2, clientY: r.top } as MouseEvent, <TipLines title={say("titles.decade", { decade: String(d.decade) })} lines={total(d) ? [plural("count.championships", total(d)), ...lines(d)] : [say("titles.none")]} />);
  };
  return (
    <div className="chart citytitles" ref={(el) => { ref.current = el; box.current = el; }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={say("titles.aria")}>
        <g>{ticks.map((t) => <line key={t} x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--rule)" />)}</g>
        <g>{ticks.map((t) => <text key={t} x={m.l - 6} y={y(t)} dy="0.32em" textAnchor="end">{fmt(t)}</text>)}</g>
        <g>{decades.filter((_, i) => i % step === 0).map((d) => <text key={d.decade} x={(x(d.decade) ?? 0) + x.bandwidth() / 2} y={H - 8} textAnchor="middle">{d.decade}s</text>)}</g>
        {decades.map((d) => {
          let base = 0;
          return (
            <g key={d.decade} tabIndex={0} role="img" aria-label={label(d)} className="decade"
              onMouseMove={(ev) => tip.show(ev, <TipLines title={say("titles.decade", { decade: String(d.decade) })} lines={total(d) ? [plural("count.championships", total(d)), ...lines(d)] : [say("titles.none")]} />)}
              onMouseLeave={tip.hide} onFocus={(ev) => showAt(ev, d)} onBlur={tip.hide}>
              <rect className="hit" x={(x(d.decade) ?? 0) - x.step() * x.paddingInner() / 2} width={x.step()} y={m.t} height={H - m.b - m.t} fill="transparent" />
              {leagues.map((l) => {
                const n = d.counts[l] ?? 0;
                if (!n) return null;
                const y1 = y(base + n), y0 = y(base);
                base += n;
                return <rect key={l} x={x(d.decade)} width={x.bandwidth()} y={y1} height={y0 - y1} fill={`var(--${l})`} stroke="var(--paper)" strokeWidth={1} rx={1} />;
              })}
            </g>
          );
        })}
      </svg>
      <div className="legend">{leagues.map((l) => <span key={l}><i style={{ background: `var(--${l})` }} />{LG[l as keyof typeof LG]}</span>)}</div>
      {tip.element}
    </div>
  );
}

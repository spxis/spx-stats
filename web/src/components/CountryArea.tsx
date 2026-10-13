"use client";

import { area, bisector, curveMonotoneX, scaleLinear, stack, stackOffsetExpand, stackOffsetNone } from "d3";
import { useRef, useState, type PointerEvent } from "react";
import type { Stack } from "@/lib/countryModel";
import { seasonLabel } from "@/lib/leagues";
import { countryName, pctText } from "@/lib/people-format";
import { slotColor, type Slice } from "./CountryDonut";
import { useSpeaker } from "./i18n/LocaleProvider";
import { SortTable } from "./SortTable";
import { TipLines, useTooltip } from "./Tooltip";
import { useChartWidth } from "./useChartWidth";
import { tableOf } from "@/lib/sort";
import "./country.css";

interface Layer { key: string; slice: Slice; values: number[] }

/**
 * The countries of a franchise's or a league's players over the seasons, stacked: players each season (or their share of the season's players),
 * the biggest countries in their own colours, the rest together, and the players with no country known on top. Hovering names the season's figures;
 * the table under the chart ("Show as a table") holds them all.
 */
export function CountryArea({ stack: s, league, label, tableLabel, allowShare = true }: { stack: Stack; league: string; label: string; tableLabel: string; allowShare?: boolean }) {
  const { say, fmt, locale } = useSpeaker();
  const [mode, setMode] = useState<"count" | "share">("count");
  const [ref, W] = useChartWidth(720, 280);
  const box = useRef<HTMLDivElement | null>(null);
  const tip = useTooltip(box);
  const [at, setAt] = useState<number | null>(null);
  const layers: Layer[] = [
    ...s.keep.map((c, i) => ({ key: c, slice: { code: c, n: 0, slot: i } as Slice, values: s.counts[c] })),
    { key: "other", slice: { code: "other", n: 0, kind: "other" } as Slice, values: s.other },
    { key: "unknown", slice: { code: "ZZ", n: 0, kind: "unknown" } as Slice, values: s.unknown },
  ].filter((l) => l.values.some((v) => v > 0));
  const nameOf = (l: Layer) => (l.slice.kind === "other" ? say("country.other") : l.slice.kind === "unknown" ? say("country.unknown") : countryName(l.key, locale));
  const H = 260, m = { t: 10, r: 10, b: 26, l: 40 };
  const years = s.years;
  if (!years.length) return null;
  const rows = years.map((y, i) => Object.fromEntries([["year", y], ...layers.map((l) => [l.key, l.values[i]])]) as Record<string, number>);
  const gen = stack<Record<string, number>>().keys(layers.map((l) => l.key)).offset(mode === "share" ? stackOffsetExpand : stackOffsetNone);
  const stacked = gen(rows);
  const top = mode === "share" ? 1 : Math.max(1, ...stacked.map((l) => Math.max(...l.map((p) => p[1]))));
  const x = scaleLinear([years[0], years.at(-1)! === years[0] ? years[0] + 1 : years.at(-1)!], [m.l, W - m.r]);
  const y = scaleLinear([0, top], [H - m.b, m.t]).nice();
  const shape = area<[number, number] & { data: Record<string, number> }>().x((p) => x(p.data.year)).y0((p) => y(p[0])).y1((p) => y(p[1])).curve(curveMonotoneX);
  const yTicks = y.ticks(4);
  const xTicks = x.ticks(Math.max(2, Math.floor((W - m.l) / 70)));
  const near = bisector<number, number>((v) => v).center;
  const point = (ev: PointerEvent<SVGSVGElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const i = near(years, x.invert(px));
    setAt(i);
    const total = layers.reduce((a, l) => a + l.values[i], 0);
    tip.show(ev, <TipLines title={seasonLabel(league, years[i])} lines={[...layers.filter((l) => l.values[i] > 0).map((l) => `${nameOf(l)}: ${fmt(l.values[i])} (${pctText(l.values[i] / Math.max(total, 1), locale, 0)})`), `${say("country.total")}: ${fmt(total)}`]} />);
  };
  const tbl = tableOf(rows.map((r, i) => ({ r, i })), [
    { key: "season", label: say("col.season"), num: true, get: (d) => d.r.year, cell: (d) => seasonLabel(league, d.r.year) },
    ...layers.map((l) => ({ key: `k_${l.key.toLowerCase()}`, label: nameOf(l), num: true, get: (d: { i: number }) => l.values[d.i], cell: (d: { i: number }) => fmt(l.values[d.i]) })),
  ], (d) => d.r.year);
  return (
    <div className="carea">
      {allowShare ? (
        <div className="cmode">
          <div className="seg" role="group" aria-label={say("country.areaMode")}>
            <button type="button" aria-pressed={mode === "count"} onClick={() => setMode("count")}>{say("country.modeCount")}</button>
            <button type="button" aria-pressed={mode === "share"} onClick={() => setMode("share")}>{say("country.modeShare")}</button>
          </div>
        </div>
      ) : null}
      <div className="chart" ref={(el) => { ref.current = el; box.current = el; }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerMove={point} onPointerLeave={() => { setAt(null); tip.hide(); }}>
          <g>{yTicks.map((t) => <line key={t} x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--rule)" />)}</g>
          <g>{yTicks.map((t) => <text key={t} x={m.l - 6} y={y(t)} dy="0.32em" textAnchor="end">{mode === "share" ? pctText(t, locale, 0) : fmt(t)}</text>)}</g>
          <g>{xTicks.filter((t) => Number.isInteger(t)).map((t) => <text key={t} x={x(t)} y={H - 8} textAnchor="middle">{seasonLabel(league, t)}</text>)}</g>
          {stacked.map((l, i) => <path key={l.key} className="layer" d={shape(l as unknown as ([number, number] & { data: Record<string, number> })[]) ?? undefined} fill={slotColor(layers[i].slice)} />)}
          {at != null ? <line className="guide" x1={x(years[at])} x2={x(years[at])} y1={m.t} y2={H - m.b} /> : null}
        </svg>
        {tip.element}
      </div>
      <div className="legend">{layers.map((l) => <span key={l.key}><i style={{ background: slotColor(l.slice) }} />{nameOf(l)}</span>)}</div>
      <details className="ctable">
        <summary>{tableLabel}</summary>
        <div className="tablebox"><SortTable {...tbl} param="sort_stack" def="season.desc" label={label} /></div>
      </details>
    </div>
  );
}

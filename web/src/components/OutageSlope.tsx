"use client";

import { extent, scaleLinear } from "d3";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fmt3 } from "@/lib/format";
import { TipLines, useTooltip } from "./Tooltip";
import { useChartWidth } from "./useChartWidth";
import "./outage.css";

export interface SlopeItem {
  f: number;
  name: string;
  abbr: string;
  href: string;
  /** Strength before the gap and after it; null where the club played on one side only. */
  a: number | null;
  b: number | null;
}

interface Props {
  items: SlopeItem[];
  labelA: string;
  labelB: string;
  /** The address of each season's page, for the column headings. */
  hrefA: string;
  hrefB: string;
  /** The title the picture goes by for screen readers. */
  aria: string;
  /** The line under the picture saying how to read it. */
  note: string;
}

/** Moves labels apart so none sits closer than `gap` to the one above, keeping their order and staying inside [lo, hi]. */
export function spread(ys: number[], gap: number, lo: number, hi: number): number[] {
  const order = ys.map((y, i) => i).sort((p, q) => ys[p] - ys[q]);
  const out = [...ys];
  let prev = lo - gap;
  for (const i of order) { out[i] = Math.max(ys[i], prev + gap); prev = out[i]; }
  let next = hi + gap;
  for (const i of [...order].reverse()) { out[i] = Math.min(out[i], next - gap); next = out[i]; }
  return out;
}

/**
 * A slope chart: each club is a line from its standing before the gap (left) to its standing after (right), green where it rose and red
 * where it fell. Names sit at both ends; pressing a line or a name opens the club's page.
 */
export function OutageSlope({ items, labelA, labelB, hrefA, hrefB, aria, note }: Props) {
  const router = useRouter();
  const [ref, W] = useChartWidth(720, 300);
  const tip = useTooltip(ref);
  const [on, setOn] = useState<number | null>(null);
  const both = items.filter((i) => i.a != null && i.b != null);
  const [lo = 0, hi = 1] = extent(items.flatMap((i) => [i.a, i.b]).filter((v): v is number => v != null));
  const pad = Math.max(0.02, (hi - lo) * 0.04);
  const H = Math.max(420, items.length * 17);
  const m = { t: 38, r: W < 480 ? 54 : 84, b: 12, l: W < 480 ? 54 : 84 };
  const y = scaleLinear([lo - pad, hi + pad], [H - m.b, m.t]);
  const xa = m.l, xb = W - m.r;
  const gap = 13;
  const left = items.filter((i) => i.a != null), right = items.filter((i) => i.b != null);
  const ly = spread(left.map((i) => y(i.a!)), gap, m.t, H - m.b);
  const ry = spread(right.map((i) => y(i.b!)), gap, m.t, H - m.b);
  const short = W < 480;
  const colour = (i: SlopeItem) => (i.a == null || i.b == null ? "var(--rule)" : i.b - i.a > 0.01 ? "var(--ok)" : i.b - i.a < -0.01 ? "var(--bad)" : "var(--muted)");
  const text = (i: SlopeItem, v: number | null) => `${short ? "" : `${i.abbr} `}${v != null ? fmt3(v).replace(/^0/, "") : ""}`;
  return (
    <div className="chart outslope" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria}>
        <g className="heads">
          <text x={xa} y={16} textAnchor="middle" className="lab nm" onClick={() => router.push(hrefA)}>{labelA}</text>
          <text x={xb} y={16} textAnchor="middle" className="lab nm" onClick={() => router.push(hrefB)}>{labelB}</text>
        </g>
        <line x1={xa} x2={xa} y1={m.t - 8} y2={H - m.b} stroke="var(--rule)" />
        <line x1={xb} x2={xb} y1={m.t - 8} y2={H - m.b} stroke="var(--rule)" />
        <g>{both.map((i) => (
          <line key={i.f} x1={xa} x2={xb} y1={y(i.a!)} y2={y(i.b!)} stroke={colour(i)} strokeWidth={on === i.f ? 3.5 : 1.8} opacity={on == null || on === i.f ? 0.9 : 0.25}
            style={{ cursor: "pointer" }} onClick={() => router.push(i.href)} />
        ))}</g>
        <g>{items.map((i) => (i.a != null && i.b != null ? (
          <g key={i.f}>
            <circle cx={xa} cy={y(i.a)} r={on === i.f ? 4.5 : 3} fill={colour(i)} />
            <circle cx={xb} cy={y(i.b)} r={on === i.f ? 4.5 : 3} fill={colour(i)} />
          </g>
        ) : null))}</g>
        <g>{left.map((i, k) => (
          <text key={i.f} x={xa - 8} y={ly[k]} dy="0.32em" textAnchor="end" className={"nm" + (on === i.f ? " on" : "")} onClick={() => router.push(i.href)}
            onMouseEnter={() => setOn(i.f)} onMouseLeave={() => setOn(null)}>{text(i, i.a)}</text>
        ))}</g>
        <g>{right.map((i, k) => (
          <text key={i.f} x={xb + 8} y={ry[k]} dy="0.32em" textAnchor="start" className={"nm" + (on === i.f ? " on" : "")} onClick={() => router.push(i.href)}
            onMouseEnter={() => setOn(i.f)} onMouseLeave={() => setOn(null)}>{text(i, i.b)}</text>
        ))}</g>
        <g>{both.map((i) => (
          <line key={i.f} x1={xa} x2={xb} y1={y(i.a!)} y2={y(i.b!)} stroke="transparent" strokeWidth={10} style={{ cursor: "pointer" }}
            onClick={() => router.push(i.href)} onMouseEnter={() => setOn(i.f)}
            onMouseMove={(ev) => tip.show(ev, <TipLines title={i.name} lines={[`${labelA}: ${fmt3(i.a!)}`, `${labelB}: ${fmt3(i.b!)}`, `${i.b! - i.a! >= 0 ? "+" : "−"}${fmt3(Math.abs(i.b! - i.a!))}`]} />)}
            onMouseLeave={() => { setOn(null); tip.hide(); }} />
        ))}</g>
      </svg>
      {tip.element}
      <p className="note">{note}</p>
    </div>
  );
}

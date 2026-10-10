"use client";

import { arc, pie, sum, type PieArcDatum } from "d3";
import { useRef } from "react";
import { fmt, fmt3 } from "@/lib/format";
import type { RecordPart } from "@/lib/record";
import { TipLines, useTooltip } from "./Tooltip";

const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;

/** A donut of wins, losses, ties and overtime losses, with the win share (a tie counts half) in the middle. */
export function Donut({ title, sub, parts: all }: { title: string; sub: string; parts: RecordPart[] }) {
  const box = useRef<HTMLDivElement | null>(null);
  const tip = useTooltip(box);
  const parts = all.filter((p) => p.n > 0);
  const total = sum(parts, (p) => p.n);
  const head = <><h3>{title}</h3><p className="note">{sub}</p></>;
  if (!total) return <div className="donutbox">{head}<p className="note">No results yet.</p></div>;
  const share = ((parts.find((p) => p.k === "w")?.n ?? 0) + (parts.find((p) => p.k === "t")?.n ?? 0) / 2) / total;
  const slice = arc<PieArcDatum<RecordPart>>().innerRadius(64).outerRadius(96).padAngle(parts.length > 1 ? 0.015 : 0).cornerRadius(2);
  const slices = pie<RecordPart>().sort(null).value((p) => p.n)(parts);
  return (
    <div className="donutbox">
      {head}
      <div className="chart donut" ref={box}>
        <svg viewBox="0 0 200 200" role="img" aria-label={`${title}: ${parts.map((p) => `${fmt(p.n)} ${p.label.toLowerCase()}`).join(", ")}`}>
          <g className="arcs">
            <g transform="translate(100,100)">
              {slices.map((d) => (
                <path key={d.data.k} className={`seg-${d.data.k}`} d={slice(d) ?? undefined}
                  onMouseMove={(ev) => tip.show(ev, <TipLines title={d.data.label} lines={[`${fmt(d.data.n)} of ${fmt(total)} games (${pct1(d.data.n / total)})`]} />)}
                  onMouseLeave={tip.hide} />
              ))}
            </g>
          </g>
          <text className="big" x={100} y={104}>{fmt3(share)}</text>
          <text className="sub" x={100} y={122}>Win share</text>
        </svg>
        {tip.element}
      </div>
      <div className="legend">
        {parts.map((p) => <span key={p.k}><i className={`seg-${p.k}`} />{`${p.label} ${fmt(p.n)}`}</span>)}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { arc, pie, type PieArcDatum } from "d3";
import { useRef } from "react";
import { fillHref } from "@/lib/countryRamp";
import { countryName, pctText } from "@/lib/people-format";
import { FlagIcon } from "./FlagIcon";
import { useSpeaker } from "./i18n/LocaleProvider";
import { TipLines, useTooltip } from "./Tooltip";
import "./country.css";

/** One slice: a country (`slot` picks its colour, 0 to 7), all the smaller ones together, or the players whose country is not known. */
export interface Slice { code: string; n: number; kind?: "country" | "other" | "unknown"; slot?: number }

export const slotColor = (s: Slice) => (s.kind === "other" ? "var(--kother)" : s.kind === "unknown" ? "var(--kunk)" : `var(--k${(s.slot ?? 0) % 8})`);

/** The colour square beside a name: a country's slot colour, grey for the rest, hatched for unknown. */
export function KDot({ s }: { s: Slice }) {
  if (s.kind === "other") return <i className="kdot k-other" />;
  if (s.kind === "unknown") return <i className="kdot k-unknown" />;
  return <i className="kdot" style={{ background: slotColor(s) }} />;
}

/** The name of a slice in the reader's language, with its flag. */
export function SliceName({ s, flags, hrefTpl }: { s: Slice; flags: Record<string, string>; hrefTpl?: string }) {
  const { say, locale } = useSpeaker();
  if (s.kind === "other") return <>{say("country.other")}</>;
  if (s.kind === "unknown") return <>{say("country.unknown")}</>;
  const name = countryName(s.code, locale);
  const inner = <>{flags[s.code] ? <FlagIcon svg={flags[s.code]} /> : null} {hrefTpl ? <Link href={fillHref(hrefTpl, s.code)} prefetch={false}>{name}</Link> : name}</>;
  return inner;
}

/**
 * A donut of players by country, with the total in the middle and a legend that holds every figure (the legend is the chart's table).
 * Hovering a slice names it; a legend name links where `hrefFor` says (the roster filtered to that country).
 */
export function CountryDonut({ title, sub, slices, flags, centre, centreSub, hrefTpl }: {
  title: string; sub?: string; slices: Slice[]; flags: Record<string, string>; centre: string; centreSub: string; hrefTpl?: string;
}) {
  const { say, fmt, locale } = useSpeaker();
  const box = useRef<HTMLDivElement | null>(null);
  const tip = useTooltip(box);
  const shown = slices.filter((s) => s.n > 0);
  const total = shown.reduce((a, s) => a + s.n, 0);
  const pc = (v: number) => pctText(v / Math.max(total, 1), locale, 1);
  const slice = arc<PieArcDatum<Slice>>().innerRadius(60).outerRadius(96).padAngle(shown.length > 1 ? 0.015 : 0).cornerRadius(2);
  const parts = pie<Slice>().sort(null).value((s) => s.n)(shown);
  const nameOf = (s: Slice) => (s.kind === "other" ? say("country.other") : s.kind === "unknown" ? say("country.unknown") : countryName(s.code, locale));
  return (
    <div className="donutbox" style={{ alignItems: "stretch" }}>
      <h3>{title}</h3>
      {sub ? <p className="note">{sub}</p> : null}
      <div className="cdonut">
        <div className="chart" ref={box}>
          <svg viewBox="0 0 200 200" role="img" aria-label={`${title}: ${shown.map((s) => `${nameOf(s)} ${fmt(s.n)}`).join(", ")}`}>
            <g transform="translate(100,100)">
              {parts.map((d) => (
                <path key={`${d.data.kind}-${d.data.code}`} d={slice(d) ?? undefined} fill={slotColor(d.data)}
                  onMouseMove={(ev) => tip.show(ev, <TipLines title={nameOf(d.data)} lines={[`${fmt(d.data.n)} · ${pc(d.data.n)}`]} />)} onMouseLeave={tip.hide} />
              ))}
            </g>
            <text className="big" x={100} y={104}>{centre}</text>
            <text className="sub" x={100} y={122}>{centreSub}</text>
          </svg>
          {tip.element}
        </div>
        <ul className="clegend" aria-label={title}>
          {shown.map((s) => (
            <li key={`${s.kind}-${s.code}`}>
              <KDot s={s} />
              <span className="nm"><SliceName s={s} flags={flags} hrefTpl={hrefTpl} /></span>
              <span className="n">{fmt(s.n)}</span>
              <span className="pc">{pc(s.n)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

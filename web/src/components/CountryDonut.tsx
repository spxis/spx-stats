"use client";

import Link from "@/components/Link";
import { arc, pie, type PieArcDatum } from "d3";
import { useRef } from "react";
import { focused, holds, sliceStates } from "@/lib/countryFocus";
import { fillHref } from "@/lib/countryRamp";
import { countryName, pctText } from "@/lib/people-format";
import { FlagIcon } from "./FlagIcon";
import { DonutCentre } from "./DonutCentre";
import { useCountryFocus } from "./CountryScope";
import { useDonutLive } from "./useDonutLive";
import { useSpeaker } from "./i18n/LocaleProvider";
import { TipLines, useTooltip } from "./Tooltip";
import "./country.css";

/** One slice: a country (`slot` picks its colour, 0 to 7), all the smaller ones together, or the players whose country is not known. */
export interface Slice {
  code: string; n: number; kind?: "country" | "other" | "unknown"; slot?: number;
  /** For the "other" slice: the codes of the countries in it, so choosing or pointing at one of them marks this slice. */
  members?: string[];
}

export const slotColor = (s: Slice) => (s.kind === "other" ? "var(--kother)" : s.kind === "unknown" ? "var(--kunk)" : `var(--k${(s.slot ?? 0) % 8})`);

/** The colour square beside a name: a country's slot colour, grey for the rest, hatched for unknown. */
export function KDot({ s }: { s: Slice }) {
  if (s.kind === "other") return <i className="kdot k-other" />;
  if (s.kind === "unknown") return <i className="kdot k-unknown" />;
  return <i className="kdot" style={{ background: slotColor(s) }} />;
}

/** The name of a slice in the reader's language, with its flag. */
export function SliceName({ s, flags, hrefTpl }: { s: Slice; flags: Record<string, true>; hrefTpl?: string }) {
  const { say, locale } = useSpeaker();
  if (s.kind === "other") return <>{say("country.other")}</>;
  if (s.kind === "unknown") return <>{say("country.unknown")}</>;
  const name = countryName(s.code, locale);
  const inner = <>{flags[s.code] ? <FlagIcon code={s.code} /> : null} {hrefTpl ? <Link href={fillHref(hrefTpl, s.code)} prefetch={false}>{name}</Link> : name}</>;
  return inner;
}

/**
 * A donut of players by country, with the total in the middle and a legend that holds every figure (the legend is the chart's table).
 * Hovering a slice names it; a slice and a legend name link where `hrefTpl` says (the list filtered to that country). Inside a CountryScope the chosen
 * country and the one under the pointer or focus are drawn out and the other slices dimmed, the legend row is marked, and "Other countries" opens the
 * scope's list of more countries. A slice is a link where `hrefTpl` says (so it works without script), and every slice is reached by keyboard; the middle
 * shows the figures of the slice (or the country, from a legend row, chip or map) under the pointer or the focus, and the total again when it leaves.
 */
export function CountryDonut({ title, sub, slices, flags, centre, centreSub, hrefTpl, compact = false }: {
  title: string; sub?: string; slices: Slice[]; flags: Record<string, true>; centre: string; centreSub: string; hrefTpl?: string;
  /** A small donut (about 170 px) with its legend beside it, and no heading drawn (the title still names the chart for a screen reader). */
  compact?: boolean;
}) {
  const { say, fmt, locale } = useSpeaker();
  const scope = useCountryFocus();
  const box = useRef<HTMLDivElement | null>(null);
  const tip = useTooltip(box);
  const shown = slices.filter((s) => s.n > 0);
  const total = shown.reduce((a, s) => a + s.n, 0);
  const pc = (v: number) => pctText(v / Math.max(total, 1), locale, 1);
  const slice = arc<PieArcDatum<Slice>>().innerRadius(60).outerRadius(96).padAngle(shown.length > 1 ? 0.015 : 0).cornerRadius(2);
  const parts = pie<Slice>().sort(null).value((s) => s.n)(shown);
  const nameOf = (s: Slice) => (s.kind === "other" ? say("country.other") : s.kind === "unknown" ? say("country.unknown") : countryName(s.code, locale));
  const live = useDonutLive();
  const idOf = (s: Slice) => `${s.kind ?? "country"}-${s.code}`;
  const codes = focused(scope.chosen, scope.hover);
  const under = shown.find((s) => idOf(s) === live.key) ?? (scope.hover ? shown.find((s) => holds(s, [scope.hover!])) : undefined);
  const states = sliceStates(shown, codes);
  const stateOf = new Map(shown.map((s, i) => [s, states[i]]));
  const openMore = () => {
    scope.setMoreOpen(true);
    box.current?.closest(".cscope")?.querySelector(".pchips")?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  const inOther = (s: Slice) => (s.kind === "other" && s.members ? codes.filter((c) => s.members!.includes(c)) : []);
  return (
    <div className="donutbox" style={{ alignItems: "stretch" }}>
      <h3 className={compact ? "cvh" : undefined}>{title}</h3>
      {sub ? <p className="note">{sub}</p> : null}
      <div className={compact ? "cdonut compact" : "cdonut"}>
        <div className="chart" ref={box}>
          <svg viewBox="0 0 200 200" role="group" aria-label={`${title}: ${shown.map((s) => `${nameOf(s)} ${fmt(s.n)}`).join(", ")}`}>
            <g transform="translate(100,100)">
              {parts.map((d) => {
                const s = d.data;
                const st = stateOf.get(s) ?? "";
                const [cx, cy] = slice.centroid(d);
                const len = Math.hypot(cx, cy) || 1;
                const style = st === "on" ? { transform: `translate(${(cx / len) * 6}px, ${(cy / len) * 6}px)` } : undefined;
                const attrs = {
                  className: "dslice", style, "data-on": st === "on" ? "" : undefined, "data-dim": st === "dim" ? "" : undefined,
                  "data-country": s.kind ? undefined : s.code, ...live.bind(idOf(s)),
                };
                const path = (
                  <path d={slice(d) ?? undefined} fill={slotColor(s)}
                    onMouseMove={(ev) => tip.show(ev, <TipLines title={nameOf(s)} lines={[`${fmt(s.n)} · ${pc(s.n)}`]} />)} onMouseLeave={tip.hide} />
                );
                if (!s.kind && hrefTpl) {
                  return <Link key={`${s.kind}-${s.code}`} href={fillHref(hrefTpl, s.code)} prefetch={false} aria-label={say("country.mapShow", { name: nameOf(s) })} {...attrs}>{path}</Link>;
                }
                if (s.kind === "other" && scope.hasMore) {
                  return (
                    <g key={`${s.kind}-${s.code}`} role="button" tabIndex={0} aria-label={say("country.otherOpen", { n: fmt(s.n) })} onClick={openMore}
                      onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openMore(); } }} {...attrs}>{path}</g>
                  );
                }
                return <g key={`${s.kind}-${s.code}`} role="img" tabIndex={0} aria-label={`${nameOf(s)}: ${fmt(s.n)} · ${pc(s.n)}`} {...attrs}>{path}</g>;
              })}
            </g>
            <DonutCentre rest={{ big: centre, sub: centreSub }} item={under ? { label: nameOf(under), n: under.n } : null} total={total} pct={(v) => pctText(v, locale, 1)} />
          </svg>
          {tip.element}
        </div>
        <ul className="clegend" aria-label={title}>
          {shown.map((s) => {
            const st = stateOf.get(s) ?? "";
            const holds = inOther(s);
            return (
              <li key={`${s.kind}-${s.code}`} data-country={s.kind ? undefined : s.code} data-on={st === "on" ? "" : undefined}>
                <KDot s={s} />
                <span className="nm">
                  {s.kind === "other" && scope.hasMore ? <button type="button" className="linklike" onClick={openMore}>{nameOf(s)}</button> : <SliceName s={s} flags={flags} hrefTpl={hrefTpl} />}
                  {holds.length ? <span className="note"> · {say("country.otherHas", { name: holds.map((c) => countryName(c, locale)).join(", ") })}</span> : null}
                </span>
                <span className="n">{fmt(s.n)}</span>
                <span className="pc">{pc(s.n)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

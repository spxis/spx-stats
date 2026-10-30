"use client";

import { KDot } from "./CountryDonut";
import { FlagIcon } from "./FlagIcon";
import { useSpeaker } from "./i18n/LocaleProvider";
import { LG } from "@/lib/leagues";
import type { MixBar } from "@/lib/countryLines";
import { countryName, pctText } from "@/lib/people-format";
import "./country.css";

/**
 * One bar a league: how its players split between the biggest countries, the rest, and the players whose country is not known. The page sends a
 * short line of numbers a league and the bars are drawn from them here, so the same figures do not travel a second time as drawn elements.
 */
export function CountryMixBars({ bars, codes, flags }: { bars: MixBar[]; codes: string[]; flags: Record<string, true> }) {
  const { say, plural, fmt, locale } = useSpeaker();
  return (
    <>
      <div className="cbars">
        {bars.map((c) => {
          const parts = codes.map((code, i) => ({ code, slot: i, n: c.ns[i] }));
          const rest = c.known - parts.reduce((a, p) => a + p.n, 0);
          const unknown = c.all - c.known;
          const w = (n: number) => `${(100 * n) / Math.max(c.all, 1)}%`;
          const name = LG[c.league as keyof typeof LG] ?? c.league.toUpperCase();
          return (
            <div className="cbar" key={c.league}>
              <b>{name}</b>
              <div className="track" role="img" aria-label={`${name}: ${parts.filter((p) => p.n).map((p) => `${countryName(p.code, locale)} ${pctText(p.n / Math.max(c.all, 1), locale, 0)}`).join(", ")}`}>
                {parts.filter((p) => p.n).map((p) => <i key={p.code} style={{ width: w(p.n), background: `var(--k${p.slot})` }} title={`${countryName(p.code, locale)}: ${fmt(p.n)}`} />)}
                {rest > 0 ? <i style={{ width: w(rest), background: "var(--kother)" }} title={`${say("country.other")}: ${fmt(rest)}`} /> : null}
                {unknown > 0 ? <i className="k-unknown" style={{ width: w(unknown), background: "repeating-linear-gradient(135deg, var(--kunk) 0 3px, transparent 3px 6px)" }} title={`${say("country.unknown")}: ${fmt(unknown)}`} /> : null}
              </div>
              <span className="cov">{say("country.barCoverage", { known: fmt(c.known), total: fmt(c.all), countries: plural("count.countries", c.countries) })}</span>
            </div>
          );
        })}
      </div>
      <div className="legend">
        {codes.map((code, i) => <span key={code}><KDot s={{ code, n: 0, slot: i }} />{flags[code] ? <FlagIcon code={code} /> : null}{countryName(code, locale)}</span>)}
        <span><KDot s={{ code: "other", n: 0, kind: "other" }} />{say("country.other")}</span>
        <span><KDot s={{ code: "ZZ", n: 0, kind: "unknown" }} />{say("country.unknown")}</span>
      </div>
    </>
  );
}

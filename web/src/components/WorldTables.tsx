"use client";

import { useMemo } from "react";
import { COUNTRIES_HEAD } from "@/lib/countryLines";
import type { Stack } from "@/lib/countryModel";
import { seasonLabel } from "@/lib/leagues";
import { countryName, pctText } from "@/lib/people-format";
import { tableOf } from "@/lib/sort";
import { readTeams, type TeamsWire } from "@/lib/worldLines";
import { FlagIcon } from "./FlagIcon";
import { useSpeaker } from "./i18n/LocaleProvider";
import { SortTable } from "./SortTable";
import { TeamLabel } from "./TeamLabel";
import { useReveal } from "./useReveal";
import "./country.css";

/**
 * The table under a league's stacked chart: a row a season, a column for each country the chart draws. Built here from the stack's numbers (the same ones
 * the chart is drawn from), the newest seasons first; the first rows are in the page and the others appear on "Show all", or on the league's tables page
 * (`full`) where script is off.
 */
export function WorldStackTable({ stack: s, league, label, full = false, hrefAll }: { stack: Stack; league: string; label: string; full?: boolean; hrefAll: string }) {
  const { say, fmt, locale } = useSpeaker();
  const rows = useMemo(() => s.years.map((year, i) => ({ year, i })).reverse(), [s]);
  const layers = useMemo(() => [
    ...s.keep.map((c) => ({ key: c, values: s.counts[c], kind: "country" as const })),
    { key: "other", values: s.other, kind: "other" as const },
    { key: "unknown", values: s.unknown, kind: "unknown" as const },
  ].filter((l) => l.values.some((v) => v > 0)), [s]);
  const more = useReveal(rows, COUNTRIES_HEAD, full);
  const table = useMemo(() => tableOf(more.shown, [
    { key: "season", label: say("col.season"), num: true, get: (d) => d.year, cell: (d) => seasonLabel(league, d.year) },
    ...layers.map((l) => ({
      key: `k_${l.key.toLowerCase()}`, label: l.kind === "other" ? say("country.other") : l.kind === "unknown" ? say("country.unknown") : countryName(l.key, locale),
      num: true as const, get: (d: { i: number }) => l.values[d.i], cell: (d: { i: number }) => fmt(l.values[d.i]),
    })),
  ], (d) => d.year), [more.shown, layers, league, say, fmt, locale]);
  return <div className={more.loaded ? "tablebox" : "tablebox cpart"}><SortTable {...table} param="sort_stack" def="season.desc" label={label} partial={full ? undefined : { total: rows.length, loaded: more.loaded, state: more.state, load: more.load, href: hrefAll }} /></div>;
}

/** The by-team table of a league's world page, built from one short line a club (lib/worldLines.ts), with the same "Show all" arrangement. */
export function WorldTeamsTable({ lg, wire, flags, full = false, hrefAll, label }: { lg: string; wire: TeamsWire; flags: Record<string, true>; full?: boolean; hrefAll: string; label: string }) {
  const { say, fmt, locale } = useSpeaker();
  const rows = useMemo(() => readTeams(wire), [wire]);
  const more = useReveal(rows, COUNTRIES_HEAD, full);
  const table = useMemo(() => tableOf(more.shown, [
    { key: "team", label: say("col.team"), cls: "team", get: (x) => x.name, cell: (x) => <TeamLabel lg={lg} f={x.f} name={x.name} logo={x.logo} /> },
    { key: "players", label: say("country.colPlayers"), num: true, get: (x) => x.total, cell: (x) => fmt(x.total) },
    { key: "countries", label: say("country.colCountries"), num: true, get: (x) => x.countries, cell: (x) => fmt(x.countries) },
    {
      key: "top", label: say("country.colTop"), get: (x) => (x.top ? countryName(x.top.code, locale) : null),
      cell: (x) => (x.top ? <span className="cflagname">{flags[x.top.code] ? <FlagIcon code={x.top.code} /> : null}{countryName(x.top.code, locale)}</span> : ""),
    },
    { key: "topshare", label: say("country.colTopShare"), num: true, get: (x) => (x.top ? x.top.n / x.known : null), cell: (x) => (x.top ? pctText(x.top.n / x.known, locale, 0) : "") },
    {
      key: "second", label: say("country.colSecond"), get: (x) => (x.second ? countryName(x.second.code, locale) : null),
      cell: (x) => (x.second ? <span className="cflagname">{countryName(x.second.code, locale)} <span className="note">{fmt(x.second.n)}</span></span> : ""),
    },
  ], (x) => x.f), [more.shown, lg, flags, say, fmt, locale]);
  return <div className={more.loaded ? "tablebox" : "tablebox cpart"}><SortTable {...table} param="sort_teams" def="players.desc" label={label} partial={full ? undefined : { total: rows.length, loaded: more.loaded, state: more.state, load: more.load, href: hrefAll }} /></div>;
}

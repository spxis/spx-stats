"use client";

import Link from "@/components/Link";
import { useMemo } from "react";
import { COUNTRIES_HEAD, readFirsts, readVersus, type FirstsWire, type VersusWire } from "@/lib/countryLines";
import { LG, seasonLabel } from "@/lib/leagues";
import { countryName, pctText } from "@/lib/people-format";
import { playerPath } from "@/lib/playerPath";
import { tableOf } from "@/lib/sort";
import { FlagIcon } from "./FlagIcon";
import { useSpeaker } from "./i18n/LocaleProvider";
import { SortTable } from "./SortTable";
import { useReveal } from "./useReveal";
import "./country.css";

const leagueName = (l: string) => LG[l as keyof typeof LG] ?? l.toUpperCase();

/** A country's name with its flag, linked to its page. */
function Lead({ code, flags }: { code: string; flags: Record<string, true> }) {
  const { locale } = useSpeaker();
  return <span className="cflagname">{flags[code] ? <FlagIcon code={code} /> : null}<Link href={`/country/${code}`} prefetch={false}>{countryName(code, locale)}</Link></span>;
}

/**
 * Players of each country in each league, all time. The table is built here from one short line a country (the page does not send a drawn cell for
 * each figure): the first rows are in the page and the others appear when "Show all" is pressed or the table is sorted another way; without script
 * "Show all" is a link to the page that has them all (`full`).
 */
export function CountriesVersus({ wire, flags, full = false, hrefAll, label }: { wire: VersusWire; flags: Record<string, true>; full?: boolean; hrefAll: string; label: string }) {
  const { say, fmt, locale } = useSpeaker();
  const rows = useMemo(() => readVersus(wire), [wire]);
  const more = useReveal(rows, COUNTRIES_HEAD, full);
  const table = useMemo(() => tableOf(more.shown, [
    { key: "country", label: say("col.country"), cls: "team", get: (r) => countryName(r.code, locale), cell: (r) => <Lead code={r.code} flags={flags} /> },
    { key: "total", label: say("country.colTotal"), num: true, get: (r) => r.total, cell: (r) => fmt(r.total) },
    ...wire.leagues.map((l) => ({
      key: l, label: leagueName(l), num: true, title: say("country.versusCellTitle", { league: leagueName(l) }),
      get: (r: (typeof rows)[number]) => r.byLeague[l]?.n ?? 0,
      cell: (r: (typeof rows)[number]) => { const c = r.byLeague[l]; return c ? <>{fmt(c.n)} <span className="note">{pctText(c.share, locale)}</span></> : "–"; },
    })),
  ], (r) => r.code), [more.shown, wire.leagues, flags, say, fmt, locale]);
  return <div className={more.loaded ? "tablebox" : "tablebox cpart"}><SortTable {...table} param="sort_countries" def="total.desc" label={label} partial={full ? undefined : { total: rows.length, loaded: more.loaded, state: more.state, load: more.load, href: hrefAll }} /></div>;
}

/** The first player of each country in each league, oldest first; built from short lines the same way. */
export function CountriesFirsts({ wire, flags, full = false, hrefAll, label }: { wire: FirstsWire; flags: Record<string, true>; full?: boolean; hrefAll: string; label: string }) {
  const { say, fmt, locale } = useSpeaker();
  const rows = useMemo(() => readFirsts(wire, (id, name, league) => playerPath(league, id, name)), [wire]);
  const more = useReveal(rows, COUNTRIES_HEAD, full);
  const table = useMemo(() => tableOf(more.shown, [
    { key: "country", label: say("col.country"), cls: "team", get: (r) => countryName(r.code, locale), cell: (r) => <Lead code={r.code} flags={flags} /> },
    { key: "league", label: say("col.league"), get: (r) => leagueName(r.league), cell: (r) => <Link href={`/${r.league}/world`} prefetch={false}>{leagueName(r.league)}</Link> },
    { key: "year", label: say("country.colFirst"), cls: "seasoncell", num: true, get: (r) => r.year, cell: (r) => seasonLabel(r.league, r.year) },
    { key: "player", label: say("country.colFirstPlayer"), cls: "team", get: (r) => r.name || null, cell: (r) => (r.href ? <Link href={r.href} prefetch={false}>{r.name}</Link> : r.name) },
    { key: "players", label: say("country.colPlayers"), num: true, get: (r) => r.players, cell: (r) => fmt(r.players) },
  ], (r) => `${r.league}-${r.code}`), [more.shown, flags, say, fmt, locale]);
  return <div className={more.loaded ? "tablebox" : "tablebox cpart"}><SortTable {...table} param="sort_firsts" def="year.asc" label={label} partial={full ? undefined : { total: rows.length, loaded: more.loaded, state: more.state, load: more.load, href: hrefAll }} /></div>;
}

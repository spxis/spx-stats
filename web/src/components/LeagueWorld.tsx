"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { UNKNOWN } from "@/lib/countryModel";
import { seasonLabel } from "@/lib/leagues";
import { countryName, pctText } from "@/lib/people-format";
import { seasonPath } from "@/lib/slug";
import { tableOf } from "@/lib/sort";
import { CountryMap } from "./CountryMap";
import { FlagIcon } from "./FlagIcon";
import { useSpeaker } from "./i18n/LocaleProvider";
import { SortTable } from "./SortTable";
import { YearRange } from "./YearRange";
import { Figures } from "./ui";
import "./country.css";

/** What the league world page sends the browser: the league's seasons as flat numbers, so any range of years can be added up again there. */
export interface LeagueWorldData {
  league: string;
  /** The country codes the rows point into. */
  countries: string[];
  /** Flat triples: year, index into countries, distinct players of that country that season. */
  rows: number[];
  /** Per season: year, all its players, those whose country is known. */
  seasons: [number, number, number][];
  /** All time, per country: players, first season, and the first player (name and address when he has a page). */
  allTime: { code: string; players: number; first: number; firstName: string | null; firstHref: string | null }[];
}

/**
 * The league's players on a world map and in a table, for any run of seasons: a slider narrows the seasons (the whole history to a single season),
 * and the map, the figures and the table follow. Counts are player-seasons: a player is counted once for each season he played, so for one season
 * they are players. Everything is added up in the browser from the one list the page was drawn with, so the page stays a kept, static copy.
 */
export function LeagueWorld({ data, flags, min, max }: { data: LeagueWorldData; flags: Record<string, true>; min: number; max: number }) {
  const { say, fmt, plural, locale } = useSpeaker();
  const [range, setRange] = useState({ from: min, to: max });
  const r = useDeferredValue(range);
  const lg = data.league;

  const view = useMemo(() => {
    const per = new Map<string, number>();
    for (let i = 0; i < data.rows.length; i += 3) {
      const y = data.rows[i];
      if (y < r.from || y > r.to) continue;
      const c = data.countries[data.rows[i + 1]];
      per.set(c, (per.get(c) ?? 0) + data.rows[i + 2]);
    }
    let all = 0, known = 0, seasons = 0;
    for (const [y, a, k] of data.seasons) if (y >= r.from && y <= r.to) { all += a; known += k; seasons += 1; }
    const counts: Record<string, number> = {};
    for (const [c, n] of per) if (c !== UNKNOWN && n > 0) counts[c] = n;
    return { counts, all, known, seasons };
  }, [data, r]);

  const full = r.from <= min && r.to >= max;
  const hrefFor = (code: string) => `/players?league=${lg}&nat=${code}${full ? "" : `&from=${r.from}&to=${r.to}`}`;
  const nameOf = (c: string) => countryName(c, locale);
  const allTime = new Map(data.allTime.map((a) => [a.code, a]));
  const rows = Object.entries(view.counts).map(([code, n]) => ({ code, n }));
  const table = tableOf(rows, [
    {
      key: "country", label: say("col.country"), cls: "team", get: (x) => nameOf(x.code),
      cell: (x) => <span className="cflagname">{flags[x.code] ? <FlagIcon code={x.code} /> : null}<Link href={hrefFor(x.code)} prefetch={false}>{nameOf(x.code)}</Link></span>,
    },
    { key: "n", label: say("country.colPlayerSeasons"), title: say("country.playerSeasonsTitle"), num: true, get: (x) => x.n, cell: (x) => fmt(x.n) },
    { key: "share", label: say("country.colShare"), title: say("country.shareTitle"), num: true, get: (x) => x.n / Math.max(view.known, 1), cell: (x) => pctText(x.n / Math.max(view.known, 1), locale) },
    { key: "players", label: say("country.colPlayersAll"), title: say("country.playersAllTitle"), num: true, get: (x) => allTime.get(x.code)?.players ?? null, cell: (x) => fmt(allTime.get(x.code)?.players ?? 0) },
    { key: "first", label: say("country.colFirst"), cls: "seasoncell", get: (x) => allTime.get(x.code)?.first ?? null, cell: (x) => { const a = allTime.get(x.code); return a ? seasonLabel(lg, a.first) : ""; } },
    {
      key: "firstp", label: say("country.colFirstPlayer"), cls: "team", get: (x) => allTime.get(x.code)?.firstName ?? null,
      cell: (x) => { const a = allTime.get(x.code); return a?.firstName ? (a.firstHref ? <Link href={a.firstHref} prefetch={false}>{a.firstName}</Link> : a.firstName) : ""; },
    },
  ], (x) => x.code);

  const single = r.from === r.to;
  return (
    <div className="section">
      <YearRange min={min} max={max} from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
      <p className="note" aria-live="polite">
        {single ? say("country.rangeOne", { season: seasonLabel(lg, r.from) }) : say("country.rangeMany", { from: seasonLabel(lg, r.from), to: seasonLabel(lg, r.to), seasons: plural("count.seasons", view.seasons) })}
        {single ? <> · <Link href={`${seasonPath(lg, r.from)}/world`} prefetch={false}>{say("country.seasonLink", { season: seasonLabel(lg, r.from) })}</Link></> : null}
      </p>
      <Figures items={[
        [say("country.figCountries"), rows.length],
        [say(single ? "country.figPlayers" : "country.figPlayerSeasons"), view.all],
        [say("country.figKnown"), view.all ? pctText(view.known / view.all, locale, 0) : "—"],
      ]} />
      <CountryMap counts={view.counts} flags={flags} hrefTpl={`/players?league=${lg}&nat={code}${full ? "" : `&from=${r.from}&to=${r.to}`}`} label={say("country.leagueMapLabel", { league: lg.toUpperCase() })} unit={single ? "players" : "playerSeasons"} empty={say("country.mapEmptyRange")} />
      {rows.length ? <div className="tablebox"><SortTable {...table} param="sort_countries" def="n.desc" label={say("country.tableLabel", { league: lg.toUpperCase() })} /></div> : null}
    </div>
  );
}

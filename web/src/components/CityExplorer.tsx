"use client";

import Link from "next/link";
import { useDeferredValue, useId, useMemo, useState } from "react";
import { fmt3 } from "@/lib/format";
import { fold } from "@/lib/fold";
import { winShare } from "@/lib/cityModel";
import { tableOf } from "@/lib/sort";
import { FlagIcon } from "./FlagIcon";
import { Credits } from "./Credits";
import { MapViewer } from "./MapViewer";
import { SortTable } from "./SortTable";
import { YearRange } from "./YearRange";
import { useSpeaker } from "./i18n/LocaleProvider";
import type { Pin } from "./mapDraw";
import "./team.css";
import "./city.css";

/** One city as the list page sends it to the browser: enough to add the numbers up again for any range of years. */
export interface CityListRow {
  slug: string; name: string; nameFr: string | null; region: string; cc: string; lat: number | null; lon: number | null;
  metroName: string | null; metroNameFr: string | null;
  /** The names of its clubs, for the search. */
  clubs: string[];
  /** For each club, its runs of seasons in the city, flattened: from, to, from, to... */
  runs: number[][];
  /** Per year with a season: year, club seasons, titles, wins, losses, ties, overtime losses (seven numbers each, flattened). */
  yr: number[];
}

interface Counted { clubs: number; seasons: number; titles: number; share: number | null; first: number | null; last: number | null }

function count(c: CityListRow, from: number, to: number): Counted {
  let seasons = 0, titles = 0, w = 0, l = 0, t = 0, o = 0, first: number | null = null, last: number | null = null;
  for (let i = 0; i < c.yr.length; i += 7) {
    const y = c.yr[i];
    if (y < from || y > to) continue;
    seasons += c.yr[i + 1]; titles += c.yr[i + 2]; w += c.yr[i + 3]; l += c.yr[i + 4]; t += c.yr[i + 5]; o += c.yr[i + 6];
    first ??= y; last = y;
  }
  const clubs = c.runs.filter((r) => r.some((v, j) => j % 2 === 0 && v <= to && r[j + 1] >= from)).length;
  return { clubs, seasons, titles, share: winShare(w, l, t, o), first, last };
}

/**
 * The cities list: search, a year-range slider, a sortable table and a map of the cities. Everything is filtered in the browser from the
 * one list the page was drawn with, so the page stays a kept, static copy. The range narrows the cities to those with a club season in it
 * and adds their clubs, seasons, titles and win share up for those years only.
 */
export function CityExplorer({ cities, min, max, flags }: { cities: CityListRow[]; min: number; max: number; flags: Record<string, string> }) {
  const { say, fmt, plural, locale } = useSpeaker();
  const uid = useId();
  const [q, setQ] = useState("");
  const [range, setRange] = useState({ from: min, to: max });
  const wanted = useDeferredValue({ q, ...range });

  const searchText = useMemo(() => new Map(cities.map((c) => [c.slug, fold([c.name, c.nameFr, c.region, c.metroName, ...c.clubs].filter(Boolean).join(" "))])), [cities]);
  const shown = useMemo(() => {
    const words = fold(wanted.q).split(" ").filter(Boolean);
    return cities.flatMap((c) => {
      const n = count(c, wanted.from, wanted.to);
      return n.seasons > 0 && words.every((w) => searchText.get(c.slug)?.includes(w)) ? [{ c, n }] : [];
    });
  }, [cities, wanted, searchText]);

  const nameOf = (c: CityListRow) => (locale === "fr" && c.nameFr ? c.nameFr : c.name);
  const table = useMemo(() => tableOf(shown, [
    {
      key: "name", label: say("cities.colCity"), cls: "team", get: ({ c }) => nameOf(c),
      cell: ({ c }) => (
        <>
          <Link href={`/city/${c.slug}`} prefetch={false}>{nameOf(c)}</Link>
          <span className="seasoncell"> {c.region}{flags[c.cc] ? <FlagIcon svg={flags[c.cc]} /> : null}</span>
        </>
      ),
    },
    { key: "clubs", label: say("cities.colClubs"), num: true, get: ({ n }) => n.clubs, cell: ({ n }) => fmt(n.clubs) },
    { key: "seasons", label: say("col.seasons"), num: true, title: say("cities.seasonsTitle"), get: ({ n }) => n.seasons, cell: ({ n }) => fmt(n.seasons) },
    { key: "titles", label: say("col.titles"), num: true, get: ({ n }) => n.titles, cell: ({ n }) => fmt(n.titles) },
    { key: "share", label: say("teams.colShare"), num: true, title: say("teams.shareTitle"), get: ({ n }) => n.share, cell: ({ n }) => (n.share == null ? "" : fmt3(n.share)) },
    { key: "first", label: say("col.from"), num: true, get: ({ n }) => n.first, cell: ({ n }) => (n.first == null ? "" : String(n.first)) },
    { key: "last", label: say("col.to"), num: true, get: ({ n }) => n.last, cell: ({ n }) => (n.last == null ? "" : String(n.last)) },
  ], ({ c }) => c.slug),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- nameOf and the phrases follow the language
  [shown, say, fmt, locale, flags]);

  const pins = useMemo<Pin[]>(() => shown.flatMap(({ c, n }, i) => c.lat == null || c.lon == null ? [] : [{
    f: i, name: nameOf(c), lat: c.lat, lon: c.lon, cc: c.cc, href: `/city/${c.slug}`,
    venue: `${plural("count.clubs", n.clubs)} · ${plural("count.championships", n.titles)}`, place: c.region,
  }]),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- nameOf follows the language
  [shown, plural, locale]);

  return (
    <>
      <div className="controls cityfind">
        <label htmlFor={`${uid}-q`} className="sr-only">{say("cities.search")}</label>
        <input id={`${uid}-q`} type="search" value={q} placeholder={say("cities.search")} maxLength={60} autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="search" onChange={(e) => setQ(e.target.value)} />
        <p className="note" role="status" aria-live="polite">{plural("count.cities", shown.length)}</p>
      </div>
      <YearRange min={min} max={max} from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
      {shown.length ? (
        <>
          <div className="scroll citytable"><SortTable {...table} def="titles.desc" label={say("cities.title")} /></div>
          <p className="note">{say("cities.rangeNote", { from: String(range.from), to: String(range.to) })} <Credits say={say} use={["flags"]} /></p>
          {pins.length ? <MapViewer pins={pins} title={say("cities.mapTitle")} total={pins.length} note={say("cities.mapNote", { n: fmt(pins.length) })} /> : null}
        </>
      ) : <p className="note">{say("cities.none")}</p>}
    </>
  );
}

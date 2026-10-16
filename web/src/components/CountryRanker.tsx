"use client";

import Link from "@/components/Link";
import { useMemo } from "react";
import { RANKER, type RankKind } from "@/lib/countryModel";
import { fillHref } from "@/lib/countryRamp";
import type { RankedRow, RankedView } from "@/lib/countryView";
import { showStat, STAT_GROUPS } from "@/lib/playerStats";
import { countryName } from "@/lib/people-format";
import { tableOf, type ColumnSpec } from "@/lib/sort";
import { FlagIcon } from "./FlagIcon";
import { useSpeaker } from "./i18n/LocaleProvider";
import { SortTable } from "./SortTable";

/**
 * The countries of a club's players, ranked by how their players did for the club: each country's counting stats added up, then the rates
 * worked out from the sums (so a player with few games weighs little), for countries with enough players and games to mean something.
 * The best figure of each column is bold. `hrefTpl` (with `{code}` in it) makes the country a link (the roster filtered to it); `flags` names the countries that have a flag.
 */
export function CountryRanker({ kind, result, hrefTpl, min, flags }: {
  kind: RankKind; result: RankedView; hrefTpl?: string; min: number; flags: Record<string, true>;
}) {
  const { say, plural, fmt, locale } = useSpeaker();
  const spec = RANKER[kind];
  const mainCol = spec.cols.find((c) => c.key === spec.main)!;
  const table = useMemo(() => {
    const cols: ColumnSpec<RankedRow>[] = [
      {
        key: "country", label: say("col.country"), cls: "team", get: (r) => countryName(r.code, locale),
        cell: (r) => <span className="cflagname">{flags[r.code] ? <FlagIcon code={r.code} name={countryName(r.code, locale)} label={say("flag.of", { name: countryName(r.code, locale) })} /> : null}{hrefTpl ? <Link href={fillHref(hrefTpl, r.code)} prefetch={false}>{countryName(r.code, locale)}</Link> : countryName(r.code, locale)}</span>,
      },
      { key: "players", label: say("country.colPlayers"), num: true, get: (r) => r.players, cell: (r) => fmt(r.players) },
      ...spec.cols.map((c): ColumnSpec<RankedRow> => ({
        key: c.key, label: say(c.label), title: say(c.title), num: true, get: (r) => r.values[c.key],
        cell: (r) => {
          const v = showStat(c.kind, r.values[c.key], fmt);
          return result.best[c.key] === r.code ? <b className="cbest">{v}</b> : v;
        },
      })),
    ];
    return tableOf(result.rows, cols, (r) => r.code);
  }, [result, spec, say, fmt, locale, flags, hrefTpl]);
  if (!result.rows.length) {
    return <p className="note">{say("country.rankNone", { n: fmt(min) })}</p>;
  }
  return (
    <div className="section">
      <h3>{say(STAT_GROUPS[kind].title as Parameters<typeof say>[0])}</h3>
      <div className="tablebox"><SortTable {...table} param="sort_rank" def={`${spec.main}.${mainCol.lower ? "asc" : "desc"}`} label={say("country.rankTitle")} /></div>
      {result.small.countries ? <p className="note">{say("country.rankSmall", { countries: plural("count.countries", result.small.countries), players: plural("count.players", result.small.players), n: fmt(min) })}</p> : null}
    </div>
  );
}

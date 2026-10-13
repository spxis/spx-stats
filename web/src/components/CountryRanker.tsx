import Link from "next/link";
import { Flag } from "@/components/Flag";
import { SortTable } from "@/components/SortTable";
import { RANKER, type RankKind, type rankCountries } from "@/lib/countryModel";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { showStat, STAT_GROUPS } from "@/lib/playerStats";
import { countryName } from "@/lib/people-format";
import { tableOf, type ColumnSpec } from "@/lib/sort";

type Ranked = ReturnType<typeof rankCountries>["rows"][number];

/**
 * The countries of a club's players, ranked by how their players did for the club: each country's counting stats added up, then the rates
 * worked out from the sums (so a player with few games weighs little), for countries with enough players and games to mean something.
 * The best figure of each column is bold. `hrefFor` makes the country a link (the roster filtered to it).
 */
export async function CountryRanker({ kind, result, hrefFor, min }: {
  kind: RankKind; result: ReturnType<typeof rankCountries>; hrefFor?: (code: string) => string; min: number;
}) {
  const { say, plural, fmt, locale } = await currentSpeaker();
  const spec = RANKER[kind];
  const mainCol = spec.cols.find((c) => c.key === spec.main)!;
  if (!result.rows.length) {
    return <p className="note">{say("country.rankNone", { n: fmt(min) })}</p>;
  }
  const cols: ColumnSpec<Ranked>[] = [
    {
      key: "country", label: say("col.country"), cls: "team", get: (r) => countryName(r.code, locale),
      cell: (r) => <span className="cflagname"><Flag code={r.code} />{hrefFor ? <Link href={hrefFor(r.code)} prefetch={false}>{countryName(r.code, locale)}</Link> : countryName(r.code, locale)}</span>,
    },
    { key: "players", label: say("country.colPlayers"), num: true, get: (r) => r.players, cell: (r) => fmt(r.players) },
    ...spec.cols.map((c): ColumnSpec<Ranked> => ({
      key: c.key, label: say(c.label), title: say(c.title), num: true, get: (r) => r.values[c.key],
      cell: (r) => {
        const v = showStat(c.kind, r.values[c.key], fmt);
        return result.best[c.key] === r.code ? <b className="cbest">{v}</b> : v;
      },
    })),
  ];
  const table = tableOf(result.rows, cols, (r) => r.code);
  return (
    <div className="section">
      <h3>{say(STAT_GROUPS[kind].title as Parameters<typeof say>[0])}</h3>
      <div className="tablebox"><SortTable {...table} param="sort_rank" def={`${spec.main}.${mainCol.lower ? "asc" : "desc"}`} label={say("country.rankTitle")} /></div>
      {result.small.countries ? <p className="note">{say("country.rankSmall", { countries: plural("count.countries", result.small.countries), players: plural("count.players", result.small.players), n: fmt(min) })}</p> : null}
    </div>
  );
}

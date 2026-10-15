import "server-only";
import type { Slice } from "@/components/CountryDonut";
import { getFranchiseCountries, getFranchiseSeasons } from "./countryData";
import { rankCountries, stackSeries, tally, UNKNOWN, withOther, type RankKind } from "./countryModel";
import type { FranchiseCountryView } from "./countryView";
import { flagCodes } from "./flagCodes";
import { STAT_GROUP_ORDER } from "./playerStats";

const KEEP = 6;

/**
 * What a franchise's "Where the players come from" section shows: the countries of everyone who played for the club, over the seasons, and ranked by
 * how their players did. null while the views behind it are missing or too few of the players have a country (the section is then left out).
 * Worked out from the franchise's two rows lists, which the data cache holds for a day, so the page and the route that serves the section's data share them.
 */
export async function franchiseCountryView(lg: string, f: number, name: string): Promise<FranchiseCountryView | null> {
  const [seasons, rows] = await Promise.all([getFranchiseSeasons(lg, f), getFranchiseCountries(lg, f)]);
  if (!seasons?.length || !rows?.length) return null;
  const everyone = rows.filter((r) => r.stat_group === "all");
  const t = tally(everyone.map((r) => [r.country, r.players] as [string, number]));
  if (t.known < 0.1 * t.total) return null;
  const limited = t.known < 0.5 * t.total;
  const { top, other } = withOther(t.list, KEEP);
  const slices: Slice[] = [
    ...top.map((c, i) => ({ code: c.code, n: c.n, slot: i })),
    ...(other ? [{ code: "other", n: other, kind: "other" as const, members: t.list.slice(KEEP).map((c) => c.code) }] : []),
    ...(t.unknown ? [{ code: UNKNOWN, n: t.unknown, kind: "unknown" as const }] : []),
  ];
  const ranked = (limited ? [] : STAT_GROUP_ORDER).filter((k) => rows.some((r) => r.stat_group === k)).map((k) => {
    const r = rankCountries(k as RankKind, rows.filter((x) => x.stat_group === k).map((x) => ({ code: x.country, players: x.players, stats: x.stats })));
    return { k: k as RankKind, result: { rows: r.rows.map(({ code, players, values }) => ({ code, players, values })), best: r.best, small: r.small } };
  }).filter((r) => r.result.rows.length);
  return {
    name, total: t.total, known: t.known, unknown: t.unknown, countries: t.list.length, limited, slices,
    flags: flagCodes(t.list.map((c) => c.code)),
    counts: Object.fromEntries(t.list.map((c) => [c.code, c.n])),
    stack: stackSeries(seasons, top.map((c) => c.code)),
    ranked,
  };
}

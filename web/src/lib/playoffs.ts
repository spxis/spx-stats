import "server-only";
import { getSeasonAlignment } from "./alignmentData";
import { buildBracket } from "./bracketLayout";
import { logoFor } from "./brand";
import { getBrands } from "./data";
import type { Say } from "./seriesCopy";
import { describeRounds, deriveSeries, nickname, roundTitle, seriesTies, type Series } from "./series";
import { getPastMeetingGames, getPlayoffGames } from "./seriesData";

/** A season's playoff series, their rounds and the shape of the bracket (halves by conference where the alignment gives them). */
export async function loadPlayoffs(lg: string, year: number, say: Say) {
  const [games, brands, align] = await Promise.all([getPlayoffGames(lg, year), getBrands(), getSeasonAlignment(lg, year)]);
  const series = deriveSeries(lg, year, games);
  const { round, names, final } = describeRounds(lg, year, series, say);
  const conf = new Map(align.filter((a) => a.conference).map((a) => [a.franchise_id, { name: a.conference!, short: a.conference_short }]));
  const ties = seriesTies(series);
  const name = new Map(series.flatMap((s) => s.sides.map((t) => [t.f, nickname(t.name)] as const)));
  const look = (f: number) => ({ name: name.get(f) ?? String(f), ...(logoFor(brands, f, year) ? { mark: logoFor(brands, f, year)! } : {}) });
  const bracket = buildBracket(ties, round, (f) => conf.get(f) ?? null, look);
  /** The bracket of some of the series only (one conference's half), its ties in the order of `keep`; `keep[k]` is the series the layout's tie k is. */
  const layoutOf = (keep: readonly number[]) => buildBracket(keep.map((i) => ties[i]), keep.map((i) => round[i]), (f) => conf.get(f) ?? null, look, "ltr");
  return { series, round, names, final, bracket, layoutOf, brands, align };
}

export interface PastMeeting { year: number; s: Series; round: string; n: number }

/** Every playoff series two franchises played in seasons before `before`, newest first, each with the name of its round. */
export async function loadPastMeetings(lg: string, a: number, b: number, before: number, say: Say, robin: string): Promise<PastMeeting[]> {
  const byYear = await getPastMeetingGames(lg, a, b, before);
  return [...byYear].flatMap(([year, games]) => {
    const all = deriveSeries(lg, year, games);
    const { round, names } = describeRounds(lg, year, all, say);
    return all
      .map((s, i) => ({ year, s, round: roundTitle(names, round[i], robin), n: round[i] }))
      .filter((x) => x.s.sides.some((t) => t.f === a) && x.s.sides.some((t) => t.f === b))
      .reverse();
  });
}

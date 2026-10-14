import "server-only";
import { getSeasonAlignment } from "./alignmentData";
import { buildBracket } from "./bracket";
import { getBrands } from "./data";
import type { Say } from "./seriesCopy";
import { describeRounds, deriveSeries, roundTitle, seriesTies, type Series } from "./series";
import { getPastMeetingGames, getPlayoffGames } from "./seriesData";

/** A season's playoff series, their rounds and the shape of the bracket (halves by conference where the alignment gives them). */
export async function loadPlayoffs(lg: string, year: number, say: Say) {
  const [games, brands, align] = await Promise.all([getPlayoffGames(lg, year), getBrands(), getSeasonAlignment(lg, year)]);
  const series = deriveSeries(lg, year, games);
  const { round, names, final } = describeRounds(lg, year, series, say);
  const conf = new Map(align.filter((a) => a.conference).map((a) => [a.franchise_id, { name: a.conference!, short: a.conference_short }]));
  const bracket = buildBracket(seriesTies(series), round, (f) => conf.get(f) ?? null);
  return { series, round, names, final, bracket, brands, align };
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

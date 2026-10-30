import "server-only";
import { getSeasonAlignment } from "./alignmentData";
import { buildBracket, halvesOf, type SideLook } from "./bracketLayout";
import { logoFor } from "./brand";
import { officialAbbr } from "./abbr";
import { getAbbrs, getBrands, getLogoFits } from "./data";
import { logoKey } from "./logoFit";
import { buildPlayIn, findPlayInGames, PLAY_IN_FROM, PLAY_IN_WINDOW_DAYS, type PlayIn } from "./nbaPlayIn";
import type { Say } from "./seriesCopy";
import { describeRounds, deriveSeries, nickname, roundTitle, seriesTies, type Series } from "./series";
import { getGamesBetween, getPastMeetingGames, getPlayoffGames } from "./seriesData";

/** A season's playoff series, their rounds and the shape of the bracket (halves by conference where the alignment gives them). */
export async function loadPlayoffs(lg: string, year: number, say: Say) {
  const [games, brands, align, abbrs, fits] = await Promise.all([getPlayoffGames(lg, year), getBrands(), getSeasonAlignment(lg, year), getAbbrs(lg), getLogoFits()]);
  const series = deriveSeries(lg, year, games);
  const { round, names, final } = describeRounds(lg, year, series, say);
  const conf = halvesOf(lg, align);
  const ties = seriesTies(series);
  const name = new Map(series.flatMap((s) => s.sides.map((t) => [t.f, nickname(t.name)] as const)));
  const look = (f: number): SideLook => ({ name: name.get(f) ?? String(f), ...(officialAbbr(abbrs, f, year) ? { abbr: officialAbbr(abbrs, f, year)! } : {}), ...(logoFor(brands, f, year) ? { mark: logoFor(brands, f, year)! } : {}) });
  const bracket = buildBracket(ties, round, (f) => conf.get(f) ?? null, look);
  // The postseason picture draws every club as a square tile, where a wordmark is unreadable: a logo with an approved fit (lib/logoFit.ts) is drawn there as its primary mark, as in the site's other squares.
  const primary = new Map(fits.filter((r) => r.status === "approved" && r.wordmark && r.mark_url).map((r) => [r.logo_file, r.mark_url!] as const));
  const pictureLook = (f: number): SideLook => {
    const l = look(f);
    const key = logoKey(l.mark);
    return key && primary.has(key) ? { ...l, mark: primary.get(key)! } : l;
  };
  const picture = buildBracket(ties, round, (f) => conf.get(f) ?? null, pictureLook);
  /** The bracket of some of the series only (one conference's half), its ties in the order of `keep`; `keep[k]` is the series the layout's tie k is. */
  const layoutOf = (keep: readonly number[]) => buildBracket(keep.map((i) => ties[i]), keep.map((i) => round[i]), (f) => conf.get(f) ?? null, look, "ltr");
  /** The NBA's play-in (from 2020-21), worked out from the games just before the playoffs (lib/nbaPlayIn.ts): one more small read, made only by the page that draws it. */
  const playIn = async (): Promise<PlayIn | null> => {
    const first = games.map((g) => g.game_date).sort()[0];
    if (lg !== "nba" || year < PLAY_IN_FROM || !series.length || !first) return null;
    const from = new Date(Date.parse(`${first}T00:00:00Z`) - PLAY_IN_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
    const found = findPlayInGames(await getGamesBetween(lg, year, from, first).catch(() => []), first);
    const named = new Map(name);
    for (const g of found) {
      if (g.home_f != null && !named.has(g.home_f) && g.home) named.set(g.home_f, nickname(g.home));
      if (g.away_f != null && !named.has(g.away_f) && g.away) named.set(g.away_f, nickname(g.away));
    }
    const lookIn = (f: number): SideLook => ({ name: named.get(f) ?? String(f), ...(officialAbbr(abbrs, f, year) ? { abbr: officialAbbr(abbrs, f, year)! } : {}), ...(logoFor(brands, f, year) ? { mark: logoFor(brands, f, year)! } : {}) });
    return buildPlayIn(found, series, round, (f) => conf.get(f) ?? null, lookIn);
  };
  return { series, round, names, final, bracket, picture, layoutOf, brands, align, playIn };
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

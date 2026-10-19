import "server-only";
import { cache } from "react";
import { getAbbrs, getGamesBetween } from "./data";
import { officialAbbr } from "./abbr";
import { todayUtc } from "./scores";
import { candidateWindow, gapGame, WIKI_LEAGUES, type GapGame } from "./wikiHelp";

/**
 * The scheduled games of the last 16 days in the leagues read from Wikipedia. The page is kept, so whether a game is past its start
 * (and within 14 days) is decided in the browser (lib/playedLate.ts); this is every game that could be, on any minute of the day it is kept.
 */
export const getGapCandidates = cache(async (): Promise<GapGame[]> => {
  const { first, last } = candidateWindow(todayUtc());
  const perLeague = await Promise.all(WIKI_LEAGUES.map(async (lg) => {
    const [games, abbrs] = await Promise.all([getGamesBetween(lg, first, last), getAbbrs(lg)]);
    return games.flatMap((g) => gapGame(g, (side) => officialAbbr(abbrs, side === "away" ? g.away_f : g.home_f, g.year)) ?? []);
  }));
  return perLeague.flat();
});

import "server-only";
import type { GameRow } from "./api/types";
import { labelBigGame, seriesBigGames, type BigGame } from "./bigGame";
import { getRounds } from "./gameRounds";
import type { Speaker } from "./i18n/i18n";
import { hasSeries } from "./leagues";
import { roundSay } from "./roundWords";
import { getPlayoffGames, getSeasonStandings } from "./seriesData";
import { hasConferenceTrophy, sideLookup } from "./trophyEra";

/**
 * The big games among the games of one scoreboard day (their ids with what a banner needs). A day with no postseason game, or in a league that names no
 * postseason game, reads nothing; otherwise one season's playoff games (a league of series) or its round labels (college football), both cached per season.
 */
export async function bigGamesOn(lg: string, games: readonly GameRow[], sp: Speaker): Promise<Map<number, BigGame>> {
  const out = new Map<number, BigGame>();
  const years = [...new Set(games.filter((g) => g.phase === "playoffs" || (!hasSeries(lg) && g.phase === "regular")).map((g) => g.year))];
  for (const y of years) {
    if (hasSeries(lg)) {
      const mine = await getPlayoffGames(lg, y);
      const say = roundSay(sp), robin = sp.say("playoffs.robin"), fallback = sp.say("post.title");
      let bigs = seriesBigGames(lg, y, mine, say, robin, fallback);
      // A conference final needs its conference for the trophy: the season's standings are read only for a day that has one, in a season that had a conference trophy.
      if (hasConferenceTrophy(lg, y) && [...bigs.values()].some((b) => b.conf)) {
        const standings = await getSeasonStandings(lg, y).catch(() => null);
        if (standings) bigs = seriesBigGames(lg, y, mine, say, robin, fallback, sideLookup(lg, standings));
      }
      for (const [id, big] of bigs) out.set(id, big);
    } else {
      const labels = await getRounds(lg, y);
      for (const g of games) {
        const big = g.year === y ? labelBigGame(g.phase, labels.get(g.game_id) ?? null, sp.say("post.unnamed")) : null;
        if (big && (g.phase === "playoffs" || labels.has(g.game_id))) out.set(g.game_id, big);
      }
    }
  }
  return out;
}

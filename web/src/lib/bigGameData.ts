import "server-only";
import type { GameRow } from "./api/types";
import { labelBigGame, seriesBigGames, type BigGame } from "./bigGame";
import { getRounds } from "./gameRounds";
import type { Speaker } from "./i18n/i18n";
import { hasSeries } from "./leagues";
import { roundSay } from "./roundWords";
import { getPlayoffGames } from "./seriesData";

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
      for (const [id, big] of seriesBigGames(lg, y, mine, roundSay(sp), sp.say("playoffs.robin"), sp.say("post.title"))) out.set(id, big);
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

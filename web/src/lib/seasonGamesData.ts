import "server-only";
import { logoFor } from "./brand";
import { getBrands, getSeason } from "./data";
import { packGames } from "./gamesCodec";
import type { SeasonGamesView } from "./seasonRows";

/**
 * Every game of a league's season, packed (lib/gamesCodec.ts), and its clubs with the logo each wore that year. The season page used to carry them in its
 * payload, over 70 KB of a season of games and 8 KB of club logos, for a week strip and a calendar the reader may never use; now the browser fetches them
 * once (the route `rows/games`, kept for a day like the page). null for a season the archive does not have.
 */
export async function seasonGamesView(lg: string, y: number): Promise<SeasonGamesView | null> {
  const [d, brands] = await Promise.all([getSeason(lg, y), getBrands()]);
  if (!d) return null;
  return { games: packGames(d.games), teams: d.teams.map((x) => ({ ...x, logo: logoFor(brands, x.f, y) })) };
}

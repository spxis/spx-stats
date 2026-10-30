import "server-only";
import { rowsCsv } from "./api/client";
import type { CsvKind } from "./api/csv";
import { gameSchema } from "./api/schemas";
import type { GameRow } from "./api/types";

/**
 * The columns of a season's games that the season page, the playoff pages and the game tuples use. The scheduled start, the NHL game id, the nflverse week and the
 * Retrosheet box belong to the pages of one game and of one club's season, which read whole rows; the league and the season are the ones asked for.
 */
const KINDS: Readonly<Record<string, CsvKind>> = {
  game_id: "n", game_date: "s", phase: "s", status: "s", away_id: "n", away: "s", away_score: "n", home_id: "n", home: "s", home_score: "n",
  overtime: "b", source: "s", checked: "n", away_f: "n", home_f: "n",
};
const SELECT = Object.keys(KINDS).join(",");
const schema = gameSchema.omit({ league: true, year: true, starts_at: true, nhl_id: true, nfl_week: true, retro_box: true });

/** Games of one league season in the order played, as CSV (api/csv.ts) with only the columns above. `filter` is more of the query (`&phase=eq.playoffs`), and keeps the `year=eq.` every read of `games` carries. */
export async function readSeasonGames(lg: string, y: number, filter = ""): Promise<GameRow[]> {
  const part = await rowsCsv("games", `league=eq.${lg}&year=eq.${y}${filter}&select=${SELECT}&order=game_date,game_id`, KINDS, schema);
  return part.map((g) => ({ ...g, league: lg, year: y }));
}

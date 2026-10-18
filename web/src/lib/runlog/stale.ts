import "server-only";
import { API_KEY, REST_URL } from "../api/config.ts";
import { staleCutoff, type Stale } from "./rules.ts";

/**
 * The one read of the archive that is deliberately live (no-store, no cache tags): the admin banner asks whether a league's scores have stopped,
 * and the answer must not be a day old. Admin pages only, two small reads a league, at most once a minute (the banner's own cache). The test
 * `every server fetch of the archive carries cache tags` names this file as the exception.
 */
/**
 * Leagues whose scores have stopped, from the data visitors see and not from any job: a regular season game of the league's latest season that
 * is dated more than two days ago and still has no result (the symptom of 2026-10-16: NHL "No result" for three days). Two reads a league on
 * production's read key (the season, then the oldest such game). A league that cannot be read is left out, never guessed.
 */
export async function staleLeagues(now: number = Date.now()): Promise<Stale[]> {
  const cutoff = staleCutoff(now);
  const get = async (view: string, query: string): Promise<Record<string, unknown>[]> => {
    const res = await fetch(`${REST_URL}${view}?${query}`, { headers: { apikey: API_KEY, "Accept-Profile": "api" }, cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`${view}: ${res.status}`);
    return (await res.json()) as Record<string, unknown>[];
  };
  const out: Stale[] = [];
  await Promise.all(["nhl", "nba", "mlb", "nfl", "cfl"].map(async (lg) => {
    try {
      const [season] = await get("season_summary", `league=eq.${lg}&select=year,games&games=gt.0&order=year.desc&limit=1`);
      if (!season) return;
      const [game] = await get("games", `league=eq.${lg}&year=eq.${season.year}&phase=eq.regular&status=eq.scheduled&game_date=lt.${cutoff}&select=game_date&order=game_date.asc&limit=1`);
      if (game && typeof game.game_date === "string") out.push({ league: lg, since: game.game_date });
    } catch {
      /* production did not answer for this league: say nothing about it */
    }
  }));
  return out.sort((a, b) => a.league.localeCompare(b.league));
}


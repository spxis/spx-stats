/**
 * The games played at a venue, as its page shows them: counts by league and season, from api.venue_game_season (one row per venue, league and season; the
 * table behind it is built by db/build/209_venue_game_summary.sql). Pure and import-free of Next, so a node script can test it.
 */

/** A row of api.venue_game_season. */
export interface GameSeasonRow {
  league: string;
  year: number;
  games: number;
  regular_games: number;
  playoff_games: number;
  final_games: number;
  first_date: string;
  last_date: string;
}

/** A row of api.venue_final_game: a game of a season's final, with its two clubs. */
export interface FinalGameRow {
  game_id: number;
  game_date: string;
  league: string;
  year: number;
  round_label: string | null;
  home_franchise_id: number;
  away_franchise_id: number;
  home_score: number | null;
  away_score: number | null;
}

/** One league's games at a venue. `seasons` has a year (the season's first) and its games, oldest first. */
export interface LeagueGames {
  league: string;
  games: number;
  regular: number;
  playoffs: number;
  finals: number;
  firstDate: string;
  lastDate: string;
  seasons: { year: number; games: number }[];
}

export interface VenueGames {
  games: number;
  finals: number;
  firstDate: string;
  lastDate: string;
  leagues: LeagueGames[];
}

/** The leagues in the order given (`order`), the rest by code; null when the venue has no games on record. */
export function summarizeGames(rows: readonly GameSeasonRow[], order: readonly string[] = []): VenueGames | null {
  if (!rows.length) return null;
  const by = new Map<string, LeagueGames>();
  for (const r of [...rows].sort((a, b) => a.year - b.year)) {
    let l = by.get(r.league);
    if (!l) {
      l = { league: r.league, games: 0, regular: 0, playoffs: 0, finals: 0, firstDate: r.first_date, lastDate: r.last_date, seasons: [] };
      by.set(r.league, l);
    }
    l.games += r.games; l.regular += r.regular_games; l.playoffs += r.playoff_games; l.finals += r.final_games;
    if (r.first_date < l.firstDate) l.firstDate = r.first_date;
    if (r.last_date > l.lastDate) l.lastDate = r.last_date;
    const last = l.seasons.at(-1);
    if (last && last.year === r.year) last.games += r.games; else l.seasons.push({ year: r.year, games: r.games });
  }
  const rank = (l: string) => { const i = order.indexOf(l); return i < 0 ? order.length : i; };
  const leagues = [...by.values()].sort((a, b) => rank(a.league) - rank(b.league) || a.league.localeCompare(b.league, "en"));
  return {
    games: leagues.reduce((n, l) => n + l.games, 0),
    finals: leagues.reduce((n, l) => n + l.finals, 0),
    firstDate: leagues.reduce((d, l) => (l.firstDate < d ? l.firstDate : d), leagues[0].firstDate),
    lastDate: leagues.reduce((d, l) => (l.lastDate > d ? l.lastDate : d), leagues[0].lastDate),
    leagues,
  };
}

/** The finals to list: the most recent first, at most `limit`. */
export function latestFinals(rows: readonly FinalGameRow[], limit: number): FinalGameRow[] {
  return [...rows].sort((a, b) => b.game_date.localeCompare(a.game_date) || b.game_id - a.game_id).slice(0, limit);
}

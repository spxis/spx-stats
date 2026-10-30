/**
 * A read of a view comes in pages (a Range header), and PostgREST sorts each page request by itself. When the `order=` of a query does not
 * decide the place of every row, rows that tie may come back in a different order on each request, so a row near a page boundary is read
 * twice or never. This holds, for each view the site reads, the columns that tell its rows apart; `withUniqueOrder` ends a query's order
 * with them, which leaves the order the caller asked for as it is and only settles the ties.
 *
 * A key here is the columns that tell the rows of the view apart: two rows with the same values in them are the same row in every column
 * (a view that repeats a whole row, as `franchise_names` does for a club that was in a league twice, lists the row's columns, so the repeats
 * are identical and their order cannot matter). No imports, so a test can run it as it is. scripts/pagedOrder.test.ts holds every call of
 * `rows`, `rowsSlice` and `rowsWindow` to this list; a new view is added here, with the columns that are its key in its migration.
 */
export const UNIQUE_KEYS: Readonly<Record<string, readonly string[]>> = {
  alignment: ["team_id"],
  alignment_changes: ["league", "year", "franchise_id"],
  all_star_event: ["league", "year", "event_no"],
  all_star_league: ["league"],
  all_star_game: ["league", "year", "event_no", "game_no"],
  all_star_mvp: ["league", "year", "event_no", "seq"],
  all_star_selection: ["league", "year", "event_no", "seq"],
  award_list: ["league", "code"],
  awards: ["league", "year", "award_code", "winner", "source", "franchise_id", "person_id", "note"],
  batted_ball_player_hand: ["person_id", "year", "role", "bat_hand"],
  city: ["slug"],
  city_stay: ["league", "franchise_id", "city_slug"],
  coach_playoff_record: ["person_id", "team_season_id"],
  country_franchise: ["league", "franchise_id", "stat_group", "country"],
  country_league: ["league", "country"],
  country_season: ["league", "year", "country"],
  country_team_season: ["team_season_id", "country"],
  cup_final: ["year"],
  cup_final_game: ["year", "game_no"],
  cup_finalist: ["year", "team"],
  cup_series: ["year", "seq"],
  cup_title: ["year", "team"],
  franchise_names: ["league", "franchise_id", "name_from", "name_to", "name"],
  franchise_season_games: ["league", "franchise_id", "year"],
  future_venue: ["venue_key"],
  game_field: ["game_id", "kind"],
  game_round: ["game_id"],
  game_venue: ["game_id"],
  game_venue_place: ["game_id"],
  games: ["game_id"],
  games_by_source: ["league", "source"],
  grey_only_rows: ["source", "entity_kind"],
  logo_fit: ["logo_file"],
  mls_alltime: ["team_id"],
  mls_alltime_index: ["team_id"],
  mls_club_names: ["team_id", "from_year", "name"],
  mls_clubs: ["team_id"],
  mls_leaders: ["tournament_id", "category", "label", "rank", "player_name"],
  mls_season_teams: ["tournament_id", "team_id"],
  mls_seasons: ["tournament_id"],
  people: ["person_id"],
  person_awards: ["person_id", "league", "year", "award_code", "franchise_id", "source", "note"],
  person_redirect: ["old_person_id"],
  person_resume: ["person_id", "kind", "name", "start_year", "end_year", "league", "level", "source", "detail", "club_qid"],
  person_season_teams: ["person_id", "team_season_id"],
  person_head_coach_season: ["person_id", "team_season_id", "first_on", "last_on", "source"],
  person_staff: ["person_id", "team_season_id", "role", "first_on", "last_on", "position", "source"],
  person_stats: ["person_id", "team_season_id", "phase", "stat_group", "games_played", "games_started", "stats"],
  person_teams: ["person_id", "league", "franchise_id", "from_year"],
  player_index: ["person_id"],
  player_multi_league: ["person_id"],
  player_search: ["person_id"],
  player_team_search: ["franchise_id", "person_id"],
  player_teams: ["person_id", "franchise_id"],
  position: ["league", "code"],
  provenance: ["kind", "league", "source", "checked_by", "outcome"],
  quality: ["kind", "source", "entity", "what", "resolution"],
  retired_number: ["retired_number_id"],
  season_note: ["league", "year", "franchise_id", "kind", "source", "source_url", "note_en"],
  season_outage: ["league", "year"],
  season_roster: ["team_season_id", "person_id"],
  season_summary: ["league", "year"],
  soccer_awards: ["tournament_id", "award", "person_id"],
  soccer_cards: ["booking_id"],
  soccer_club_moves: ["team_id", "from_year", "to_year", "system_key", "from_league", "to_league"],
  soccer_club_seasons: ["tournament_id", "team_id"],
  soccer_clubs: ["team_id"],
  soccer_league_seasons: ["tournament_id"],
  soccer_lineups: ["match_id", "team_id", "person_id"],
  soccer_match_staff: ["match_id", "team_id", "role", "person_id", "name"],
  soccer_matches: ["match_id"],
  soccer_people: ["person_id"],
  soccer_player_tournaments: ["person_id", "tournament_id", "team_id"],
  soccer_scorers: ["match_id", "team_id", "person_id", "scorer_name", "minute", "stoppage", "period", "own_goal", "penalty", "minute_label"],
  soccer_shootout: ["kick_id"],
  soccer_squads: ["tournament_id", "team_id", "person_id"],
  soccer_standings: ["tournament_id", "stage_number", "group_name", "team_id"],
  soccer_substitutions: ["substitution_id"],
  soccer_team_matches: ["match_id", "team_id"],
  soccer_team_record_index: ["team_id", "league"],
  soccer_team_records: ["team_id", "league"],
  soccer_teams: ["team_id"],
  soccer_top_scorers: ["tournament_id", "person_id", "team_id", "player"],
  soccer_tournament_teams: ["tournament_id", "team_id"],
  soccer_tournaments: ["tournament_id"],
  sources: ["code"],
  spring_training_venue: ["wikidata_id"],
  standing_index: ["team_id"],
  standings: ["team_id"],
  stat_reference: ["league", "year", "stat_group", "bucket", "phase", "metric"],
  team_abbr: ["league", "franchise_id", "valid_from", "valid_to", "abbreviation"],
  team_awards: ["league", "franchise_id", "year", "award_code", "person_id", "winner"],
  team_brand: ["league", "franchise_id", "brand_from", "brand_to", "logo_url", "source"],
  team_index: ["league", "franchise_id"],
  team_opponent_season: ["league", "year", "franchise_id", "opponent_franchise_id", "phase"],
  team_season_affiliation: ["league", "year", "franchise_id", "position"],
  team_season_city: ["league", "year", "franchise_id"],
  team_season_country: ["league", "year", "franchise_id"],
  team_season_identity: ["team_season_id"],
  team_season_index: ["league", "year", "franchise_id"],
  team_season_name_run: ["league", "franchise_id", "from_year"],
  team_season_player_stat: ["person_id", "team_season_id", "phase", "stat_group", "games_played", "games_started", "stats"],
  team_season_roster: ["team_season_id", "person_id"],
  team_season_staff: ["team_season_id", "ord"],
  team_season_stat: ["team_season_id", "phase", "source"],
  team_seasons: ["league", "year", "franchise_id"],
  title_not_awarded: ["league", "year", "award"],
  totals: ["refreshed_at"],
  venue_city: ["latitude", "longitude", "venue_city_slug"],
  venue_final_game: ["game_id"],
  venue_game_season: ["venue_id", "league", "year"],
  venue_game_total: ["venue_id"],
  venue_home_period: ["venue_id", "franchise_id", "valid_from"],
  venue_info: ["wikidata_id"],
  venue_name: ["wikidata_id", "name"],
  venue_period: ["wikidata_id", "kind", "seq"],
  venue_pitch: ["wikidata_id"],
  venue_place: ["league", "franchise_id", "home_venue", "wikidata_id"],
  venue_ref: ["venue_id"],
  venue_soccer: ["venue_id"],
  venue_soccer_span: ["venue_id", "league"],
};

/** The columns an `order=` term list names, in order (`name_from.nullsfirst,year.desc` gives name_from, year); null when the query has no order. */
export function orderColumns(query: string): string[] | null {
  const part = query.split("&").find((p) => p.startsWith("order="));
  if (part === undefined) return null;
  return part.slice("order=".length).split(",").filter(Boolean).map((t) => t.split(".")[0]);
}

/**
 * The query with its order ended by the columns of the view's key that the order does not name yet. A query with no order gets the key as
 * its order. A view that is not listed (a function under `rpc/`, say) and a query that already names the whole key come back as they are.
 */
export function withUniqueOrder(view: string, query: string): string {
  const key = UNIQUE_KEYS[view];
  if (!key) return query;
  const named = orderColumns(query);
  const missing = key.filter((c) => !named?.includes(c));
  if (named && !missing.length) return query;
  if (!named) return [...query.split("&").filter(Boolean), `order=${key.join(",")}`].join("&");
  return query.split("&").map((p) => (p.startsWith("order=") ? `${p},${missing.join(",")}` : p)).join("&");
}

/** Whether the query puts every row in one place: it names the whole key of its view in its order. */
export function hasUniqueOrder(view: string, query: string): boolean {
  const key = UNIQUE_KEYS[view];
  const named = orderColumns(query);
  return !!key && !!named && key.every((c) => named.includes(c));
}

/** Whether the query has an order of its own. */
export const hasOrder = (query: string): boolean => orderColumns(query) !== null;

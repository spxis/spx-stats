create schema if not exists legacy_spx;
comment on schema legacy_spx is 'The sports tables of the SPX (SportsInteractive.com) SQL Server database, 1997-2012, exactly as kept. Member data is not here.';
create table legacy_spx.lk_capitals (
  "country" text,
  "capital" text,
  _seen_in text[] not null,
  _row_hash text not null unique
);
comment on table legacy_spx.lk_capitals is 'SPX lkCapitals';
create table legacy_spx.lk_countries_new (
  "continent_code" text,
  "continent_name" text,
  "country_abb2" text,
  "country_abb3" text,
  "country_number" text,
  "country_name" text,
  "country_full_name" text,
  "country_capital_city" text,
  "country_region" text,
  _seen_in text[] not null,
  _row_hash text not null unique
);
comment on table legacy_spx.lk_countries_new is 'SPX lkCountriesNew';
create table legacy_spx.lk_future_types (
  "future_type_id" smallint,
  "future_type_name" text,
  _seen_in text[] not null,
  primary key ("future_type_id")
);
comment on table legacy_spx.lk_future_types is 'SPX lkFutureTypes';
create table legacy_spx.lk_game_score_types (
  "score_type_id" smallint,
  "score_type_name" text,
  _seen_in text[] not null,
  primary key ("score_type_id")
);
comment on table legacy_spx.lk_game_score_types is 'SPX lkGameScoreTypes';
create table legacy_spx.lk_iso3166 (
  "country_id" smallint,
  "country_name" text,
  "country_abb2" text,
  "country_abb3" text,
  "country_number" smallint,
  "country_display_order" smallint,
  _seen_in text[] not null,
  primary key ("country_id")
);
comment on table legacy_spx.lk_iso3166 is 'SPX lkISO3166';
create table legacy_spx.lk_iso3166b (
  "state_id" smallint,
  "country_id" smallint,
  "state_abb" text,
  "state_name" text,
  "state_display_order" smallint,
  _seen_in text[] not null,
  primary key ("state_id")
);
comment on table legacy_spx.lk_iso3166b is 'SPX lkISO3166b';
create table legacy_spx.lk_periods (
  "period_id" smallint,
  "period_date" timestamp,
  "period_name" text,
  _seen_in text[] not null,
  primary key ("period_id")
);
comment on table legacy_spx.lk_periods is 'SPX lkPeriods';
create table legacy_spx.lk_sport_conferences (
  "conference_id" smallint,
  "conference_name" text,
  "conference_full" text,
  "conference_abb" text,
  "conference_short" text,
  _seen_in text[] not null,
  primary key ("conference_id")
);
comment on table legacy_spx.lk_sport_conferences is 'SPX lkSportConferences';
create table legacy_spx.lk_sport_divisions (
  "division_id" smallint,
  "conference_id" smallint,
  "division_name" text,
  "division_abb" text,
  "division_short" text,
  _seen_in text[] not null,
  primary key ("division_id")
);
comment on table legacy_spx.lk_sport_divisions is 'SPX lkSportDivisions';
create table legacy_spx.lk_sport_leagues (
  "league_id" smallint,
  "sport_id" smallint,
  "league_name" text,
  "league_short_name" text,
  "league_title" text,
  "league_url" text,
  "league_logo_src" text,
  "league_logo_small_src" text,
  "league_logo_mini_src" text,
  "league_file_directory" text,
  "league_is_default" boolean,
  "league_is_major" boolean,
  "league_is_premium" boolean,
  "league_is_special" boolean,
  "league_is_gameable" boolean,
  "league_has_teams" boolean,
  "league_has_players" boolean,
  "league_has_standings" boolean,
  "league_has_double_headers" boolean,
  "gaming_spread_id" smallint,
  "gaming_total_id" smallint,
  "league_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("league_id")
);
comment on table legacy_spx.lk_sport_leagues is 'SPX lkSportLeagues';
create table legacy_spx.lk_sport_positions (
  "position_id" smallint,
  "sport_id" smallint,
  "position_abb_name" text,
  "position_name" text,
  _seen_in text[] not null,
  primary key ("position_id")
);
comment on table legacy_spx.lk_sport_positions is 'SPX lkSportPositions';
create table legacy_spx.lk_sports (
  "sport_id" smallint,
  "sport_name" text,
  "sport_full_name" text,
  "sport_short_name" text,
  "sport_title" text,
  "sport_url" text,
  "sport_logo_src" text,
  "sport_logo_small_src" text,
  "sport_logo_mini_src" text,
  "sport_file_directory" text,
  "sport_is_major" boolean,
  "sport_is_premium" boolean,
  "sport_is_special" boolean,
  "sport_is_gameable" boolean,
  "sport_has_teams" boolean,
  "sport_has_players" boolean,
  "sport_has_standings" boolean,
  "sport_has_double_headers" boolean,
  "gaming_spread_id" smallint,
  "gaming_total_id" smallint,
  "sport_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("sport_id")
);
comment on table legacy_spx.lk_sports is 'SPX lkSports';
create table legacy_spx.lk_sport_seasons (
  "season_id" smallint,
  "sport_id" smallint,
  "league_id" smallint,
  "season_type_id" smallint,
  "season_number" smallint,
  "season_name" text,
  "season_short_name" text,
  "season_start_date" timestamp,
  "season_start_year" smallint,
  "season_end_date" timestamp,
  "season_end_year" smallint,
  "season_is_gameable" boolean,
  "season_has_standings" boolean,
  "season_url" text,
  "season_note" text,
  "season_logo_src" text,
  "season_logo_small_src" text,
  "season_logo_mini_src" text,
  "season_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("season_id")
);
comment on table legacy_spx.lk_sport_seasons is 'SPX lkSportSeasons';
create table legacy_spx.lk_sport_season_types (
  "season_type_id" smallint,
  "season_type_name" text,
  _seen_in text[] not null,
  primary key ("season_type_id")
);
comment on table legacy_spx.lk_sport_season_types is 'SPX lkSportSeasonTypes';
create table legacy_spx.lk_sport_stat_types (
  "stat_type_id" smallint,
  "stat_type_abb_name" text,
  "stat_type_name" text,
  _seen_in text[] not null,
  primary key ("stat_type_id")
);
comment on table legacy_spx.lk_sport_stat_types is 'SPX lkSportStatTypes';
create table legacy_spx.lk_sport_url_types (
  "sport_url_type_id" smallint,
  "sport_url_type_name" text,
  _seen_in text[] not null,
  primary key ("sport_url_type_id")
);
comment on table legacy_spx.lk_sport_url_types is 'SPX lkSportURLTypes';
create table legacy_spx.lk_team_abb_types (
  "team_abb_type_id" smallint,
  "team_abb_type_name" text,
  _seen_in text[] not null,
  primary key ("team_abb_type_id")
);
comment on table legacy_spx.lk_team_abb_types is 'SPX lkTeamAbbTypes';
create table legacy_spx.lk_timezones (
  "timezone_name" text,
  "timezone_gmt_offset" double precision,
  "timezone_dst_abbrv" text,
  "timezone_ds_tbit" boolean,
  _seen_in text[] not null,
  primary key ("timezone_name")
);
comment on table legacy_spx.lk_timezones is 'SPX lkTimezones';
create table legacy_spx.tbl_alternate_names (
  "alternate_name_id" integer,
  "alternate_name" text,
  "standard_name" text,
  _seen_in text[] not null,
  primary key ("alternate_name_id")
);
comment on table legacy_spx.tbl_alternate_names is 'SPX tblAlternateNames';
create table legacy_spx.tbl_cbl_team_games (
  "season_id" smallint,
  "season_type_id" smallint,
  "team_id" smallint,
  "team_abb_name" text,
  "team_name" text,
  "gp" smallint,
  "w" smallint,
  "l" smallint,
  "pct" numeric(5,3),
  "gb" numeric(5,1),
  "home" text,
  "road" text,
  "rs" smallint,
  "ra" smallint,
  "strk" text,
  "l10" text,
  "team_game_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("season_id", "team_id", "gp")
);
comment on table legacy_spx.tbl_cbl_team_games is 'SPX tblCBLTeamGames';
create table legacy_spx.tbl_cfl_team_games (
  "season_id" smallint,
  "season_type_id" smallint,
  "team_id" smallint,
  "team_abb_name" text,
  "team_name" text,
  "gp" smallint,
  "w" smallint,
  "l" smallint,
  "t" smallint,
  "pct" numeric(5,3),
  "pf" smallint,
  "pa" smallint,
  "home" text,
  "road" text,
  "div" text,
  "strk" text,
  "l10" text,
  "team_game_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("season_id", "team_id", "gp")
);
comment on table legacy_spx.tbl_cfl_team_games is 'SPX tblCFLTeamGames';
create table legacy_spx.tbl_espnnba_players (
  "espn_player_id" integer,
  "player_id" integer,
  "espn_player_name" text,
  _seen_in text[] not null,
  primary key ("espn_player_id")
);
comment on table legacy_spx.tbl_espnnba_players is 'SPX tblESPNNBAPlayers';
create table legacy_spx.tbl_espnnfl_players (
  "espn_player_id" integer,
  "player_id" integer,
  "espn_player_name" text,
  _seen_in text[] not null,
  primary key ("espn_player_id")
);
comment on table legacy_spx.tbl_espnnfl_players is 'SPX tblESPNNFLPlayers';
create table legacy_spx.tbl_espnnhl_players (
  "espn_player_id" integer,
  "player_id" integer,
  "espn_player_name" text,
  _seen_in text[] not null,
  _row_hash text not null unique
);
comment on table legacy_spx.tbl_espnnhl_players is 'SPX tblESPNNHLPlayers';
create table legacy_spx.tbl_fifa_team_games (
  "team_id" integer,
  "gp" smallint,
  "w" smallint,
  "t" smallint,
  "l" smallint,
  "gf" smallint,
  "ga" smallint,
  "team_game_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("team_id")
);
comment on table legacy_spx.tbl_fifa_team_games is 'SPX tblFIFATeamGames';
create table legacy_spx.tbl_game_odds (
  "game_odd_id" integer,
  "game_id" integer,
  "game_odd_spread" numeric(18,2),
  "game_odd_money" integer,
  "game_odd_total" numeric(18,2),
  "game_odd_total_type" text,
  "game_odd_total_lay" integer,
  "game_odd_home_is_favourite" boolean,
  "game_odd_start_date" timestamp,
  "game_odd_end_date" timestamp,
  "game_odd_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("game_odd_id")
);
comment on table legacy_spx.tbl_game_odds is 'SPX tblGameOdds';
create table legacy_spx.tbl_games (
  "game_id" integer,
  "season_id" smallint,
  "league_id" smallint,
  "sport_id" smallint,
  "away_team_id" integer,
  "away_game_number" smallint,
  "home_team_id" integer,
  "home_game_number" smallint,
  "game_date" timestamp,
  "game_note" text,
  "game_station" text,
  "game_lock_wagers" boolean,
  "game_lock_updates" boolean,
  "game_cancelled" boolean,
  "game_tabulated" boolean,
  "game_is_rescheduled" boolean,
  "game_original_date" timestamp,
  "game_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("game_id")
);
comment on table legacy_spx.tbl_games is 'SPX tblGames';
create table legacy_spx.tbl_game_scores (
  "score_id" integer,
  "game_id" integer,
  "score_type_id" smallint,
  "score_away" smallint,
  "score_home" smallint,
  "score_status" text,
  "score_is_final" boolean,
  "score_is_overtime" boolean,
  "score_is_tiebreaker" boolean,
  "score_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("score_id")
);
comment on table legacy_spx.tbl_game_scores is 'SPX tblGameScores';
create table legacy_spx.tbl_gaming_future_odds (
  "future_odd_id" integer,
  "future_id" integer,
  "team_id" smallint,
  "future_odd_name" text,
  "future_odd_money" integer,
  "future_odd_decimal" numeric(20,4),
  "future_odd_closed" boolean,
  "future_odd_timestamp" timestamp,
  _seen_in text[] not null,
  _row_hash text not null unique
);
comment on table legacy_spx.tbl_gaming_future_odds is 'SPX tblGamingFutureOdds';
create table legacy_spx.tbl_gaming_futures (
  "future_id" integer,
  "sport_id" smallint,
  "season_id" smallint,
  "future_type_id" smallint,
  "future_name" text,
  "future_description" text,
  "future_start_date" timestamp,
  "future_end_date" timestamp,
  "future_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("future_id")
);
comment on table legacy_spx.tbl_gaming_futures is 'SPX tblGamingFutures';
create table legacy_spx.tbl_mlb_batting_games (
  "season_id" smallint,
  "season_type_id" smallint,
  "player_id" integer,
  "player_name" text,
  "team_id" smallint,
  "team_abb_name" text,
  "gp" smallint,
  "ab" smallint,
  "r" smallint,
  "h" smallint,
  "b2" smallint,
  "b3" smallint,
  "hr" smallint,
  "tb" smallint,
  "rbi" smallint,
  "bb" smallint,
  "so" smallint,
  "sb" smallint,
  "cs" smallint,
  "sf" smallint,
  "sh" smallint,
  "ba" numeric(5,3),
  "obp" numeric(5,3),
  "slg" numeric(5,3),
  "ops" numeric(5,3),
  "tpa" smallint,
  "pit" smallint,
  "ppa" numeric(5,3),
  "hbp" smallint,
  "ibb" smallint,
  "gidp" smallint,
  "gb" smallint,
  "fb" smallint,
  "gbfb" numeric(5,3),
  "player_team_count" smallint,
  "player_game_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("season_id", "player_id", "team_id", "gp")
);
comment on table legacy_spx.tbl_mlb_batting_games is 'SPX tblMLBBattingGames';
create table legacy_spx.tbl_mlb_batting_game_splits (
  "season_id" smallint,
  "season_type_id" smallint,
  "player_id" integer,
  "player_name" text,
  "team_id" smallint,
  "team_abb_name" text,
  "gp" smallint,
  "ab" smallint,
  "r" smallint,
  "h" smallint,
  "b2" smallint,
  "b3" smallint,
  "hr" smallint,
  "tb" smallint,
  "rbi" smallint,
  "bb" smallint,
  "so" smallint,
  "sb" smallint,
  "cs" smallint,
  "sf" smallint,
  "sh" smallint,
  "ba" numeric(5,3),
  "obp" numeric(5,3),
  "slg" numeric(5,3),
  "ops" numeric(5,3),
  "tpa" smallint,
  "pit" smallint,
  "ppa" numeric(5,3),
  "hbp" smallint,
  "ibb" smallint,
  "gidp" smallint,
  "gb" smallint,
  "fb" smallint,
  "gbfb" numeric(5,3),
  "player_team_count" smallint,
  "player_game_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("season_id", "player_id", "team_id", "gp")
);
comment on table legacy_spx.tbl_mlb_batting_game_splits is 'SPX tblMLBBattingGameSplits';
create table legacy_spx.tbl_mlb_batting_games_raw (
  "player_name" text,
  "team_id" smallint,
  "team_abb_name" text,
  "gp" smallint,
  "ab" smallint,
  "r" smallint,
  "h" smallint,
  "b2" smallint,
  "b3" smallint,
  "hr" smallint,
  "tb" smallint,
  "rbi" smallint,
  "bb" smallint,
  "so" smallint,
  "sb" smallint,
  "cs" smallint,
  "sf" smallint,
  "sh" smallint,
  "ba" numeric(5,3),
  "obp" numeric(5,3),
  "slg" numeric(5,3),
  "ops" numeric(5,3),
  "tpa" smallint,
  "pit" smallint,
  "ppa" numeric(5,3),
  "hbp" smallint,
  "ibb" smallint,
  "gidp" smallint,
  "gb" smallint,
  "fb" smallint,
  "gbfb" numeric(5,3),
  _seen_in text[] not null,
  primary key ("player_name", "team_id", "gp")
);
comment on table legacy_spx.tbl_mlb_batting_games_raw is 'SPX tblMLBBattingGamesRaw';
create table legacy_spx.tbl_mlb_pitching_games (
  "season_id" smallint,
  "season_type_id" smallint,
  "player_id" integer,
  "player_name" text,
  "team_id" smallint,
  "team_abb_name" text,
  "gp" smallint,
  "gs" smallint,
  "w" smallint,
  "l" smallint,
  "sv" smallint,
  "hld" smallint,
  "svo" smallint,
  "bs" smallint,
  "cg" smallint,
  "sho" smallint,
  "ip" numeric(5,1),
  "h" smallint,
  "r" smallint,
  "er" smallint,
  "hr" smallint,
  "bb" smallint,
  "so" smallint,
  "k9" numeric(5,2),
  "pgs" numeric(7,1),
  "whip" numeric(5,2),
  "era" numeric(5,2),
  "player_team_count" smallint,
  "player_game_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("season_id", "player_id", "team_id", "gp")
);
comment on table legacy_spx.tbl_mlb_pitching_games is 'SPX tblMLBPitchingGames';
create table legacy_spx.tbl_mlb_pitching_game_splits (
  "season_id" smallint,
  "season_type_id" smallint,
  "player_id" integer,
  "player_name" text,
  "team_id" smallint,
  "team_abb_name" text,
  "gp" smallint,
  "gs" smallint,
  "w" smallint,
  "l" smallint,
  "sv" smallint,
  "hld" smallint,
  "svo" smallint,
  "bs" smallint,
  "cg" smallint,
  "sho" smallint,
  "ip" numeric(5,1),
  "h" smallint,
  "r" smallint,
  "er" smallint,
  "hr" smallint,
  "bb" smallint,
  "so" smallint,
  "k9" numeric(5,2),
  "pgs" numeric(5,1),
  "whip" numeric(5,2),
  "era" numeric(5,2),
  "player_team_count" smallint,
  "player_game_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("season_id", "player_id", "team_id", "gp")
);
comment on table legacy_spx.tbl_mlb_pitching_game_splits is 'SPX tblMLBPitchingGameSplits';
create table legacy_spx.tbl_mlb_pitching_games_raw (
  "player_name" text,
  "team_id" smallint,
  "team_abb_name" text,
  "gp" smallint,
  "gs" smallint,
  "w" smallint,
  "l" smallint,
  "sv" smallint,
  "hld" smallint,
  "svo" smallint,
  "bs" smallint,
  "cg" smallint,
  "sho" smallint,
  "ip" numeric(5,1),
  "h" smallint,
  "r" smallint,
  "er" smallint,
  "hr" smallint,
  "bb" smallint,
  "so" smallint,
  "k9" numeric(5,2),
  "pgs" numeric(7,1),
  "whip" numeric(5,2),
  "era" numeric(5,2),
  _seen_in text[] not null,
  primary key ("player_name", "team_id", "gp")
);
comment on table legacy_spx.tbl_mlb_pitching_games_raw is 'SPX tblMLBPitchingGamesRaw';
create table legacy_spx.tbl_mlb_player_injuries (
  "player_injury_id" integer,
  "player_id" integer,
  "player_name" text,
  "team_id" smallint,
  "team_abb_name" text,
  "team_name" text,
  "player_position" text,
  "injury_status" text,
  "injury_type" text,
  "injury_description" text,
  "injury_date" timestamp,
  "injury_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("player_injury_id")
);
comment on table legacy_spx.tbl_mlb_player_injuries is 'SPX tblMLBPlayerInjuries';
create table legacy_spx.tbl_mlb_player_injuries_raw (
  "player_name" text,
  "yahoo_player_id" integer,
  "team_id" smallint,
  "team_abb_name" text,
  "team_name" text,
  "player_position" text,
  "injury_date" timestamp,
  "injury_type" text,
  "injury_status" text,
  "injury_description" text,
  _seen_in text[] not null,
  primary key ("player_name", "yahoo_player_id", "team_id")
);
comment on table legacy_spx.tbl_mlb_player_injuries_raw is 'SPX tblMLBPlayerInjuriesRaw';
create table legacy_spx.tbl_mlb_players (
  "player_id" integer,
  "player_mlbid" integer,
  "player_name" text,
  "player_first_name" text,
  "player_last_name" text,
  "player_start_date" timestamp,
  "player_end_date" timestamp,
  "player_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("player_id")
);
comment on table legacy_spx.tbl_mlb_players is 'SPX tblMLBPlayers';
create table legacy_spx.tbl_mlb_player_teams (
  "player_team_id" integer,
  "player_id" integer,
  "player_name" text,
  "team_id" smallint,
  "team_city" text,
  "player_team_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("player_team_id")
);
comment on table legacy_spx.tbl_mlb_player_teams is 'SPX tblMLBPlayerTeams';
create table legacy_spx.tbl_mlb_rosters (
  "roster_id" integer,
  "player_id" integer,
  "player_name" text,
  "player_position" text,
  "player_jersey_number" smallint,
  "player_height" smallint,
  "player_weight" smallint,
  "player_experience" smallint,
  "player_birth_date" timestamp,
  "player_age" numeric(12,6),
  "player_birth_place" text,
  "player_bat_arm" text,
  "player_throw_arm" text,
  "player_college" text,
  "roster_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("roster_id")
);
comment on table legacy_spx.tbl_mlb_rosters is 'SPX tblMLBRosters';
create table legacy_spx.tbl_mlb_rosters_raw_mlb (
  "team_id" text,
  "team_abb_name" text,
  "player_name" text,
  "player_mlbid" text,
  "player_jersey_number" text,
  "player_position" text,
  "player_bat_arm" text,
  "player_hit_arm" text,
  "player_height" text,
  "player_weight" text,
  "player_birthdate" text,
  _seen_in text[] not null,
  _row_hash text not null unique
);
comment on table legacy_spx.tbl_mlb_rosters_raw_mlb is 'SPX tblMLBRostersRawMLB';
create table legacy_spx.tbl_mlb_rosters_raw_yahoo (
  "team_id" integer,
  "team_abb_name" text,
  "player_name" text,
  "player_mlbid" integer,
  "player_jersey_number" text,
  "player_position" text,
  "player_bat_arm" text,
  "player_throw_arm" text,
  "player_height" integer,
  "player_weight" integer,
  "player_birthdate" timestamp,
  "player_birthplace" text,
  _seen_in text[] not null,
  _row_hash text not null unique
);
comment on table legacy_spx.tbl_mlb_rosters_raw_yahoo is 'SPX tblMLBRostersRawYahoo';
create table legacy_spx.tbl_mlb_team_game_history (
  "season_id" smallint,
  "week_id" smallint,
  "month_id" smallint,
  "team_id" smallint,
  "gp" smallint,
  "w" smallint,
  "l" smallint,
  "pct" numeric(5,3),
  "gb" numeric(5,1),
  "home" text,
  "road" text,
  "rs" smallint,
  "ra" smallint,
  "strk" text,
  "l10" text,
  "team_game_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("season_id", "team_id", "gp")
);
comment on table legacy_spx.tbl_mlb_team_game_history is 'SPX tblMLBTeamGameHistory';
create table legacy_spx.tbl_mlb_team_games (
  "season_id" smallint,
  "season_type_id" smallint,
  "team_id" smallint,
  "team_abb_name" text,
  "team_name" text,
  "gp" smallint,
  "w" smallint,
  "l" smallint,
  "pct" numeric(5,3),
  "gb" numeric(5,1),
  "home" text,
  "road" text,
  "rs" smallint,
  "ra" smallint,
  "strk" text,
  "l10" text,
  "team_game_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("season_id", "team_id", "gp")
);
comment on table legacy_spx.tbl_mlb_team_games is 'SPX tblMLBTeamGames';
create table legacy_spx.tbl_mlb_team_games_raw (
  "team_id" smallint,
  "team_abb_name" text,
  "team_name" text,
  "gp" smallint,
  "w" smallint,
  "l" smallint,
  "pct" numeric(5,3),
  "gb" numeric(5,1),
  "home" text,
  "road" text,
  "rs" smallint,
  "ra" smallint,
  "strk" text,
  "l10" text,
  "team_game_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("team_id", "gp")
);
comment on table legacy_spx.tbl_mlb_team_games_raw is 'SPX tblMLBTeamGamesRaw';
create table legacy_spx.tbl_nba_player_games (
  "season_id" smallint,
  "player_id" integer,
  "player_name" text,
  "team_id" smallint,
  "team_abb_name" text,
  "team_city" text,
  "gp" smallint,
  "min" smallint,
  "fgm" smallint,
  "fga" smallint,
  "tpm" smallint,
  "tpa" smallint,
  "ftm" smallint,
  "fta" smallint,
  "stl" smallint,
  "to" smallint,
  "orb" smallint,
  "drb" smallint,
  "ass" smallint,
  "blk" smallint,
  "pts" smallint,
  "pfl" smallint,
  "ffl" smallint,
  "tfl" smallint,
  "eje" smallint,
  "dis" smallint,
  "ptshi" smallint,
  "player_game_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("season_id", "player_id", "team_id", "gp")
);
comment on table legacy_spx.tbl_nba_player_games is 'SPX tblNBAPlayerGames';
create table legacy_spx.tbl_nba_player_games_raw (
  "player_name" text,
  "team_abb_name" text,
  "player_position" text,
  "gp" integer,
  "min" integer,
  "fgm" integer,
  "fga" integer,
  "tpm" integer,
  "tpa" integer,
  "ftm" integer,
  "fta" integer,
  "stl" integer,
  "tov" integer,
  "orb" integer,
  "drb" integer,
  "ass" integer,
  "blk" integer,
  "pts" integer,
  "pfl" integer,
  "ffl" integer,
  "tfl" integer,
  "eje" integer,
  "dis" integer,
  "ptshi" integer,
  _seen_in text[] not null,
  _row_hash text not null unique
);
comment on table legacy_spx.tbl_nba_player_games_raw is 'SPX tblNBAPlayerGamesRaw';
create table legacy_spx.tbl_nba_players (
  "player_id" integer,
  "player_nbaid" integer,
  "player_name" text,
  "player_first_name" text,
  "player_last_name" text,
  "player_start_date" timestamp,
  "player_end_date" timestamp,
  "player_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("player_id")
);
comment on table legacy_spx.tbl_nba_players is 'SPX tblNBAPlayers';
create table legacy_spx.tbl_nba_player_teams (
  "player_team_id" integer,
  "player_id" integer,
  "player_name" text,
  "team_id" smallint,
  "team_city" text,
  "player_team_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("player_team_id")
);
comment on table legacy_spx.tbl_nba_player_teams is 'SPX tblNBAPlayerTeams';
create table legacy_spx.tbl_nba_rosters (
  "roster_id" integer,
  "player_name" text,
  "player_id" integer,
  "player_position" text,
  "player_jersey_number" smallint,
  "player_height" smallint,
  "player_weight" smallint,
  "player_experience" smallint,
  "player_birth_date" timestamp,
  "player_age" numeric(12,6),
  "player_birth_place" text,
  "player_college" text,
  "roster_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("roster_id")
);
comment on table legacy_spx.tbl_nba_rosters is 'SPX tblNBARosters';
create table legacy_spx.tbl_nba_team_game_history (
  "season_id" smallint,
  "team_id" smallint,
  "week_id" smallint,
  "month_id" smallint,
  "gp" smallint,
  "w" smallint,
  "l" smallint,
  "pct" numeric(9,3),
  "gb" numeric(9,1),
  "pf" smallint,
  "pa" smallint,
  "home" text,
  "road" text,
  "div" text,
  "conf" text,
  "streak" text,
  "last" text,
  "clinch" text,
  "team_game_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("season_id", "team_id", "gp")
);
comment on table legacy_spx.tbl_nba_team_game_history is 'SPX tblNBATeamGameHistory';
create table legacy_spx.tbl_nba_team_games (
  "season_id" smallint,
  "season_type_id" smallint,
  "team_id" smallint,
  "team_abb_name" text,
  "team_name" text,
  "gp" smallint,
  "w" smallint,
  "l" smallint,
  "pct" numeric(9,3),
  "gb" numeric(9,1),
  "pf" smallint,
  "pa" smallint,
  "home" text,
  "road" text,
  "div" text,
  "conf" text,
  "streak" text,
  "last" text,
  "clinch" text,
  "team_game_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("season_id", "team_id", "gp")
);
comment on table legacy_spx.tbl_nba_team_games is 'SPX tblNBATeamGames';
create table legacy_spx.tbl_nba_team_games_raw (
  "team_abb_name" text,
  "gp" integer,
  "w" smallint,
  "l" smallint,
  "pct" numeric(9,3),
  "gb" numeric(9,1),
  "pf" smallint,
  "pa" smallint,
  "home" text,
  "road" text,
  "div" text,
  "conf" text,
  "streak" text,
  "last" text,
  "clinch" text,
  _seen_in text[] not null,
  _row_hash text not null unique
);
comment on table legacy_spx.tbl_nba_team_games_raw is 'SPX tblNBATeamGamesRaw';
create table legacy_spx.tbl_nfl_player_games (
  "season_id" smallint,
  "player_id" integer,
  "player_name" text,
  "player_nflid" integer,
  "team_id" smallint,
  "team_abb_name" text,
  "gp" smallint,
  "qb_rat" numeric(9,1),
  "p_att" smallint,
  "p_comp" smallint,
  "p_pct" numeric(9,1),
  "p_yds" smallint,
  "p_yp_a" numeric(9,1),
  "p_yp_g" numeric(9,1),
  "ptd" smallint,
  "p_int" smallint,
  "p_long" smallint,
  "p_sack" smallint,
  "p_yds_l" smallint,
  "p_fum" smallint,
  "p_fum_l" smallint,
  "s_rush" smallint,
  "s_yds" smallint,
  "s_yp_g" numeric(9,1),
  "s_avg" numeric(9,1),
  "s_lng" smallint,
  "std" smallint,
  "s_fum" smallint,
  "s_fum_l" smallint,
  "c_rec" smallint,
  "c_yds" smallint,
  "c_yp_g" numeric(9,1),
  "c_avg" numeric(9,1),
  "c_lng" smallint,
  "cyac" numeric(9,1),
  "c1st_d" smallint,
  "ctd" smallint,
  "c_fum" smallint,
  "c_fum_l" smallint,
  "k00" smallint,
  "k20" smallint,
  "k30" smallint,
  "k40" smallint,
  "k50" smallint,
  "kfga" smallint,
  "kfgm" smallint,
  "k_pct" smallint,
  "k_lng" smallint,
  "xpm" smallint,
  "xpa" smallint,
  "kr" smallint,
  "kr_yds" smallint,
  "krfc" smallint,
  "kr_avg" numeric(9,1),
  "kr_long" smallint,
  "krtd" smallint,
  "pr" smallint,
  "pr_yds" smallint,
  "prfc" smallint,
  "pr_avg" numeric(9,1),
  "pr_long" smallint,
  "prtd" smallint,
  "punt" smallint,
  "t_yds" smallint,
  "t_avg" numeric(9,1),
  "t_in20" smallint,
  "t_in10" smallint,
  "ttb" smallint,
  "t_long" smallint,
  "tk_solo" smallint,
  "tk_ast" smallint,
  "tk_total" smallint,
  "tk_sack" numeric(9,1),
  "tk_yds_l" smallint,
  "int" smallint,
  "int_yds" smallint,
  "int_td" smallint,
  "pd" smallint,
  "sfty" smallint,
  "player_game_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("season_id", "player_id", "team_id", "gp")
);
comment on table legacy_spx.tbl_nfl_player_games is 'SPX tblNFLPlayerGames';
create table legacy_spx.tbl_nfl_player_games_raw (
  "player_name" text,
  "espn_player_id" integer,
  "team_abb_name" text,
  "team_id" integer,
  "gp" smallint,
  "qb_rat" numeric(9,1),
  "p_att" smallint,
  "p_comp" smallint,
  "p_pct" numeric(9,1),
  "p_yds" smallint,
  "p_yp_a" numeric(9,1),
  "p_yp_g" numeric(9,1),
  "ptd" smallint,
  "p_int" smallint,
  "p_long" smallint,
  "p_sack" smallint,
  "p_yds_l" smallint,
  "p_fum" smallint,
  "p_fum_l" smallint,
  "s_rush" smallint,
  "s_yds" smallint,
  "s_yp_g" numeric(9,1),
  "s_avg" numeric(9,1),
  "s_lng" smallint,
  "std" smallint,
  "s_fum" smallint,
  "s_fum_l" smallint,
  "c_rec" smallint,
  "c_yds" smallint,
  "c_yp_g" numeric(9,1),
  "c_avg" numeric(9,1),
  "c_lng" smallint,
  "cyac" numeric(9,1),
  "c1st_d" smallint,
  "ctd" smallint,
  "c_fum" smallint,
  "c_fum_l" smallint,
  "k00" smallint,
  "k20" smallint,
  "k30" smallint,
  "k40" smallint,
  "k50" smallint,
  "kfga" smallint,
  "kfgm" smallint,
  "k_pct" smallint,
  "k_lng" smallint,
  "xpm" smallint,
  "xpa" smallint,
  "kr" smallint,
  "kr_yds" smallint,
  "krfc" smallint,
  "kr_avg" numeric(9,1),
  "kr_long" smallint,
  "krtd" smallint,
  "pr" smallint,
  "pr_yds" smallint,
  "prfc" smallint,
  "pr_avg" numeric(9,1),
  "pr_long" smallint,
  "prtd" smallint,
  "punt" smallint,
  "t_yds" smallint,
  "t_avg" numeric(9,1),
  "t_in20" smallint,
  "t_in10" smallint,
  "ttb" smallint,
  "t_long" smallint,
  "tk_solo" smallint,
  "tk_ast" smallint,
  "tk_total" smallint,
  "tk_sack" numeric(9,1),
  "tk_yds_l" smallint,
  "int" smallint,
  "int_yds" smallint,
  "int_td" smallint,
  "pd" smallint,
  "sfty" smallint,
  _seen_in text[] not null,
  _row_hash text not null unique
);
comment on table legacy_spx.tbl_nfl_player_games_raw is 'SPX tblNFLPlayerGamesRaw';
create table legacy_spx.tbl_nfl_players (
  "player_id" integer,
  "player_nflid" integer,
  "player_name" text,
  "player_first_name" text,
  "player_last_name" text,
  "player_start_date" timestamp,
  "player_end_date" timestamp,
  "player_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("player_id")
);
comment on table legacy_spx.tbl_nfl_players is 'SPX tblNFLPlayers';
create table legacy_spx.tbl_nfl_rosters (
  "roster_id" integer,
  "player_id" integer,
  "player_nflid" integer,
  "player_name" text,
  "player_position_id" smallint,
  "player_position" text,
  "player_jersey_number" smallint,
  "player_height" smallint,
  "player_weight" smallint,
  "player_experience" smallint,
  "player_college" text,
  "player_birth_date" timestamp,
  "player_birth_place" text,
  "player_age" numeric(12,6),
  "roster_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("roster_id")
);
comment on table legacy_spx.tbl_nfl_rosters is 'SPX tblNFLRosters';
create table legacy_spx.tbl_nfl_rosters_raw_yahoo (
  "player_name" text,
  "player_nflid" integer,
  "team_id" integer,
  "team_abb_name" text,
  "player_jersey_number" integer,
  "player_position" text,
  "player_height" integer,
  "player_weight" integer,
  "player_birthdate" timestamp,
  "player_experience" integer,
  "player_college" text,
  _seen_in text[] not null,
  _row_hash text not null unique
);
comment on table legacy_spx.tbl_nfl_rosters_raw_yahoo is 'SPX tblNFLRostersRawYahoo';
create table legacy_spx.tbl_nfl_team_games (
  "season_id" smallint,
  "season_type_id" smallint,
  "team_id" smallint,
  "team_abb_name" text,
  "team_name" text,
  "gp" smallint,
  "w" smallint,
  "l" smallint,
  "t" smallint,
  "pct" numeric(5,3),
  "pf" smallint,
  "pa" smallint,
  "home" text,
  "road" text,
  "div" text,
  "nfc" text,
  "afc" text,
  "strk" text,
  "l10" text,
  "team_game_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("season_id", "team_id", "gp")
);
comment on table legacy_spx.tbl_nfl_team_games is 'SPX tblNFLTeamGames';
create table legacy_spx.tbl_nhl_goalie_game_changes (
  "goalie_id" integer,
  "goalie_name" text,
  "team_id" integer,
  "team_abb_name" text,
  "team_name" text,
  "team_city" text,
  "gp" integer,
  "min" smallint,
  "avg" numeric(8,3),
  "w" smallint,
  "l" smallint,
  "t" smallint,
  "en" text,
  "so" smallint,
  "ga" smallint,
  "sa" smallint,
  "pct" numeric(8,1),
  "g" smallint,
  "a" smallint,
  "pim" smallint,
  _seen_in text[] not null,
  _row_hash text not null unique
);
comment on table legacy_spx.tbl_nhl_goalie_game_changes is 'SPX tblNHLGoalieGameChanges';
create table legacy_spx.tbl_nhl_goalie_games (
  "season_id" smallint,
  "goalie_id" integer,
  "goalie_name" text,
  "team_id" smallint,
  "team_abb_name" text,
  "team_city" text,
  "gp" integer,
  "min" smallint,
  "avg" double precision,
  "w" smallint,
  "l" smallint,
  "t" smallint,
  "en" smallint,
  "so" smallint,
  "ga" smallint,
  "sa" smallint,
  "pct" double precision,
  "g" smallint,
  "a" smallint,
  "pim" smallint,
  "goalie_game_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("season_id", "goalie_id", "team_id", "gp")
);
comment on table legacy_spx.tbl_nhl_goalie_games is 'SPX tblNHLGoalieGames';
create table legacy_spx.tbl_nhl_goalie_games_raw (
  "goalie_name" text,
  "team_abb_name" text,
  "gp" integer,
  "min" smallint,
  "avg" double precision,
  "w" smallint,
  "l" smallint,
  "t" smallint,
  "en" smallint,
  "so" smallint,
  "ga" smallint,
  "sa" smallint,
  "pct" double precision,
  "g" smallint,
  "a" smallint,
  "pim" smallint,
  "team_id" integer,
  _seen_in text[] not null,
  primary key ("goalie_name")
);
comment on table legacy_spx.tbl_nhl_goalie_games_raw is 'SPX tblNHLGoalieGamesRaw';
create table legacy_spx.tbl_nhl_goalie_injuries (
  "goalie_id" integer,
  "goalie_name" text,
  "team_id" integer,
  "team_abb_name" text,
  "team_name" text,
  "team_city" text,
  "position_name" text,
  "injury_type" text,
  "injury_description" text,
  "injury_date" timestamp,
  "injury_timestamp" timestamp,
  _seen_in text[] not null,
  _row_hash text not null unique
);
comment on table legacy_spx.tbl_nhl_goalie_injuries is 'SPX tblNHLGoalieInjuries';
create table legacy_spx.tbl_nhl_goalies (
  "goalie_id" integer,
  "goalie_name" text,
  "goalie_timestamp" timestamp,
  "goalie_start_date" timestamp,
  "goalie_end_date" timestamp,
  _seen_in text[] not null,
  _row_hash text not null unique
);
comment on table legacy_spx.tbl_nhl_goalies is 'SPX tblNHLGoalies';
create table legacy_spx.tbl_nhl_goalie_teams (
  "goalie_team_id" integer,
  "goalie_id" integer,
  "goalie_name" text,
  "team_id" smallint,
  "team_city" text,
  "goalie_team_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("goalie_team_id")
);
comment on table legacy_spx.tbl_nhl_goalie_teams is 'SPX tblNHLGoalieTeams';
create table legacy_spx.tbl_nhl_injuries_raw (
  "player_name" text,
  "team_id" integer,
  "team_abb_name" text,
  "position_name" text,
  "injury_type" text,
  "injury_description" text,
  "injury_date" timestamp,
  "injury_timestamp" timestamp,
  _seen_in text[] not null,
  _row_hash text not null unique
);
comment on table legacy_spx.tbl_nhl_injuries_raw is 'SPX tblNHLInjuriesRaw';
create table legacy_spx.tbl_nhl_player_game_changes (
  "player_id" integer,
  "player_name" text,
  "team_id" integer,
  "team_abb_name" text,
  "team_name" text,
  "team_city" text,
  "gp" integer,
  "g" smallint,
  "a" smallint,
  "pts" smallint,
  "pm" smallint,
  "pim" smallint,
  "pp" smallint,
  "sh" smallint,
  "gw" smallint,
  "gt" smallint,
  "s" smallint,
  "pct" double precision,
  _seen_in text[] not null,
  _row_hash text not null unique
);
comment on table legacy_spx.tbl_nhl_player_game_changes is 'SPX tblNHLPlayerGameChanges';
create table legacy_spx.tbl_nhl_player_games (
  "season_id" smallint,
  "player_id" integer,
  "player_name" text,
  "team_id" smallint,
  "team_abb_name" text,
  "team_city" text,
  "gp" integer,
  "g" smallint,
  "a" smallint,
  "pts" smallint,
  "pm" smallint,
  "pim" smallint,
  "pp" smallint,
  "ppa" smallint,
  "sh" smallint,
  "sha" smallint,
  "gw" smallint,
  "gt" smallint,
  "s" smallint,
  "pct" double precision,
  "player_game_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("season_id", "player_id", "team_id", "gp")
);
comment on table legacy_spx.tbl_nhl_player_games is 'SPX tblNHLPlayerGames';
create table legacy_spx.tbl_nhl_player_games_raw (
  "player_id" integer,
  "player_name" text,
  "player_nhlid" integer,
  "team_id" integer,
  "team_abb_name" text,
  "player_position" text,
  "gp" smallint,
  "g" smallint,
  "a" smallint,
  "pts" smallint,
  "pm" smallint,
  "pim" smallint,
  "pp" smallint,
  "ppa" smallint,
  "sh" smallint,
  "sha" smallint,
  "gw" smallint,
  "gt" smallint,
  "s" smallint,
  "pct" numeric(9,3),
  "gs" smallint,
  "min" smallint,
  "w" smallint,
  "l" smallint,
  "t" smallint,
  "ega" smallint,
  "ga" smallint,
  "avg" numeric(9,2),
  "sa" smallint,
  "sv" smallint,
  "svp" numeric(9,3),
  "so" smallint,
  "player_jersey_number" smallint,
  _seen_in text[] not null,
  _row_hash text not null unique
);
comment on table legacy_spx.tbl_nhl_player_games_raw is 'SPX tblNHLPlayerGamesRaw';
create table legacy_spx.tbl_nhl_player_injuries (
  "player_id" integer,
  "player_name" text,
  "team_id" integer,
  "team_abb_name" text,
  "team_name" text,
  "team_city" text,
  "position_name" text,
  "injury_type" text,
  "injury_description" text,
  "injury_date" timestamp,
  "injury_timestamp" timestamp,
  _seen_in text[] not null,
  _row_hash text not null unique
);
comment on table legacy_spx.tbl_nhl_player_injuries is 'SPX tblNHLPlayerInjuries';
create table legacy_spx.tbl_nhl_players (
  "player_id" integer,
  "player_nhlid" integer,
  "player_name" text,
  "player_first_name" text,
  "player_last_name" text,
  "player_start_date" timestamp,
  "player_end_date" timestamp,
  "player_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("player_id")
);
comment on table legacy_spx.tbl_nhl_players is 'SPX tblNHLPlayers';
create table legacy_spx.tbl_nhl_player_teams (
  "player_team_id" integer,
  "player_id" integer,
  "player_name" text,
  "team_id" smallint,
  "team_city" text,
  "player_team_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("player_team_id")
);
comment on table legacy_spx.tbl_nhl_player_teams is 'SPX tblNHLPlayerTeams';
create table legacy_spx.tbl_nhl_playoff_schedule (
  "sport_id" integer,
  "game_date" timestamp,
  "away_team" text,
  "away_team_id" smallint,
  "home_team" text,
  "home_team_id" smallint,
  "station" text,
  _seen_in text[] not null,
  _row_hash text not null unique
);
comment on table legacy_spx.tbl_nhl_playoff_schedule is 'SPX tblNHLPlayoffSchedule';
create table legacy_spx.tbl_nhl_rosters (
  "roster_id" integer,
  "player_id" integer,
  "player_name" text,
  "player_position" text,
  "player_jersey_number" smallint,
  "player_height" smallint,
  "player_weight" smallint,
  "player_experience" smallint,
  "player_birth_date" timestamp,
  "player_age" numeric(12,6),
  "player_birth_place" text,
  "player_shoot_arm" text,
  "player_college" text,
  "roster_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("roster_id")
);
comment on table legacy_spx.tbl_nhl_rosters is 'SPX tblNHLRosters';
create table legacy_spx.tbl_nhl_rosters_raw_yahoo (
  "team_id" text,
  "team_abb_name" text,
  "player_name" text,
  "player_site_id" text,
  "player_jersey_number" text,
  "player_position" text,
  "player_height" text,
  "player_weight" text,
  "player_birthdate" text,
  "player_birthplace" text,
  _seen_in text[] not null,
  _row_hash text not null unique
);
comment on table legacy_spx.tbl_nhl_rosters_raw_yahoo is 'SPX tblNHLRostersRawYahoo';
create table legacy_spx.tbl_nhl_schedules (
  "game_date" timestamp,
  "away_team_id" integer,
  "home_team_id" integer,
  _seen_in text[] not null,
  _row_hash text not null unique
);
comment on table legacy_spx.tbl_nhl_schedules is 'SPX tblNHLSchedules';
create table legacy_spx.tbl_nhl_team_game_history (
  "season_id" smallint,
  "team_id" smallint,
  "week_id" smallint,
  "month_id" smallint,
  "gp" smallint,
  "w" smallint,
  "l" smallint,
  "t" smallint,
  "rt" smallint,
  "pts" smallint,
  "gf" smallint,
  "ga" smallint,
  "home" text,
  "road" text,
  "vsdiv" text,
  "vsconf" text,
  "streak" text,
  "last" text,
  "clinch" text,
  "team_game_history_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("season_id", "team_id", "gp")
);
comment on table legacy_spx.tbl_nhl_team_game_history is 'SPX tblNHLTeamGameHistory';
create table legacy_spx.tbl_nhl_team_games (
  "season_id" smallint,
  "season_type_id" smallint,
  "team_id" smallint,
  "team_abb_name" text,
  "team_name" text,
  "gp" smallint,
  "w" smallint,
  "l" smallint,
  "t" smallint,
  "rt" smallint,
  "pts" smallint,
  "gf" smallint,
  "ga" smallint,
  "home" text,
  "road" text,
  "vsdiv" text,
  "vsconf" text,
  "streak" text,
  "last" text,
  "clinch" text,
  "team_game_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("season_id", "team_id", "gp")
);
comment on table legacy_spx.tbl_nhl_team_games is 'SPX tblNHLTeamGames';
create table legacy_spx.tbl_sport_framework (
  "sport_framework_id" smallint,
  "sport_id" smallint,
  "sport_framework_allow_wagers" boolean,
  "sport_framework_has_standings" boolean,
  "sport_framework_has_player_stats" boolean,
  "sport_framework_has_downloads" boolean,
  "sport_framework_display_latest_topic" boolean,
  "sport_framework_display_postit" boolean,
  "sport_framework_gaming_up_message" text,
  "sport_framework_gaming_down_message" text,
  "sport_framework_stats_up_message" text,
  "sport_framework_stats_down_message" text,
  "sport_framework_allow_stats" boolean,
  _seen_in text[] not null,
  primary key ("sport_framework_id")
);
comment on table legacy_spx.tbl_sport_framework is 'SPX tblSportFramework';
create table legacy_spx.tbl_sport_future_odds (
  "future_odd_id" integer,
  "future_id" integer,
  "team_id" smallint,
  "future_odd_name" text,
  "future_odd_numerator" smallint,
  "future_odd_denominator" smallint,
  "future_odd_money" smallint,
  "future_odd_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("future_odd_id")
);
comment on table legacy_spx.tbl_sport_future_odds is 'SPX tblSportFutureOdds';
create table legacy_spx.tbl_sport_futures (
  "future_id" integer,
  "season_id" smallint,
  "future_type_id" smallint,
  "future_name" text,
  "future_description" text,
  "future_start_date" timestamp,
  "future_end_date" timestamp,
  "future_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("future_id")
);
comment on table legacy_spx.tbl_sport_futures is 'SPX tblSportFutures';
create table legacy_spx.tbl_sport_ur_ls (
  "sport_urlid" smallint,
  "sport_id" smallint,
  "sport_url_type_id" smallint,
  "sport_url_name" text,
  "sport_url_value" text,
  "sport_url_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("sport_urlid")
);
comment on table legacy_spx.tbl_sport_ur_ls is 'SPX tblSportURLs';
create table legacy_spx.tbl_stadiums (
  "stadium_id" smallint,
  "stadium_name" text,
  "stadium_address" text,
  "stadium_phone" text,
  "stadium_site" text,
  "stadium_seating_plan" text,
  _seen_in text[] not null,
  primary key ("stadium_id")
);
comment on table legacy_spx.tbl_stadiums is 'SPX tblStadiums';
create table legacy_spx.tbl_team_abbs (
  "team_abb_id" smallint,
  "team_abb_type_id" smallint,
  "team_abb_name" text,
  "team_abb_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("team_abb_id")
);
comment on table legacy_spx.tbl_team_abbs is 'SPX tblTeamAbbs';
create table legacy_spx.tbl_team_eliminations (
  "team_elimination_id" smallint,
  "season_id" integer,
  "team_id" smallint,
  "team_elimination_round" smallint,
  "team_elimination_date" timestamp,
  "team_elimination_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("team_elimination_id")
);
comment on table legacy_spx.tbl_team_eliminations is 'SPX tblTeamEliminations';
create table legacy_spx.tbl_teams (
  "team_id" smallint,
  "stadium_id" smallint,
  "farm_team_id" smallint,
  "team_name" text,
  "team_city" text,
  "team_short" text,
  "team_stadium" text,
  "team_nickname" text,
  "team_url" text,
  "team_logo_src" text,
  "team_logo_small_src" text,
  "team_logo_mini_src" text,
  "team_rank" smallint,
  "team_special" text,
  "team_is_special" boolean,
  "team_is_defunct" boolean,
  "team_first_year" timestamp,
  "team_last_year" timestamp,
  "team_timestamp" timestamp,
  _seen_in text[] not null,
  primary key ("team_id")
);
comment on table legacy_spx.tbl_teams is 'SPX tblTeams';
create table legacy_spx.xref_mlb_player_i_ds (
  "mlb_player_id" integer,
  "espn_player_id" integer,
  "player_id" integer,
  _seen_in text[] not null,
  primary key ("mlb_player_id")
);
comment on table legacy_spx.xref_mlb_player_i_ds is 'SPX xrefMLBPlayerIDs';
create table legacy_spx.xref_mlb_streaks (
  "streak_player_id" integer,
  "streak_id" integer,
  "player_id" integer,
  "player_name" text,
  "player_gp" smallint,
  "player_stat_value" smallint,
  _seen_in text[] not null,
  primary key ("streak_player_id")
);
comment on table legacy_spx.xref_mlb_streaks is 'SPX xrefMLBStreaks';
create table legacy_spx.xref_mlb_streak_stats (
  "period_id" smallint,
  "stat_type_id" smallint,
  "player_id" integer,
  "player_gp" smallint,
  "player_stat_value" smallint,
  "player_new_gp" smallint,
  "player_new_stat_value" smallint,
  "player_streak_success" boolean,
  "player_streak_length" smallint,
  _seen_in text[] not null,
  primary key ("period_id", "stat_type_id", "player_id")
);
comment on table legacy_spx.xref_mlb_streak_stats is 'SPX xrefMLBStreakStats';
create table legacy_spx.xref_season_conference_divisions (
  "season_conference_divisions" smallint,
  "season_id" smallint,
  "conference_id" smallint,
  "division_id" smallint,
  _seen_in text[] not null,
  primary key ("season_conference_divisions")
);
comment on table legacy_spx.xref_season_conference_divisions is 'SPX xrefSeasonConferenceDivisions';
create table legacy_spx.xref_sport_actors (
  "sport_actor_id" integer,
  "sport_id" smallint,
  "actor_id" smallint,
  _seen_in text[] not null,
  primary key ("sport_actor_id")
);
comment on table legacy_spx.xref_sport_actors is 'SPX xrefSportActors';
create table legacy_spx.xref_sport_score_types (
  "sport_score_type_id" smallint,
  "sport_id" smallint,
  "score_type_id" integer,
  _seen_in text[] not null,
  primary key ("sport_score_type_id")
);
comment on table legacy_spx.xref_sport_score_types is 'SPX xrefSportScoreTypes';
create table legacy_spx.xref_sport_stat_types (
  "sport_stat_type_id" integer,
  "sport_id" smallint,
  "stat_type_id" smallint,
  "actor_id" smallint,
  "stat_type_enabled" boolean,
  _seen_in text[] not null,
  primary key ("sport_stat_type_id")
);
comment on table legacy_spx.xref_sport_stat_types is 'SPX xrefSportStatTypes';
create table legacy_spx.xref_sport_team_abb_teams (
  "team_abb_team_id" smallint,
  "team_abb_id" smallint,
  "team_id" smallint,
  _seen_in text[] not null,
  primary key ("team_abb_team_id")
);
comment on table legacy_spx.xref_sport_team_abb_teams is 'SPX xrefSportTeamAbbTeams';
create table legacy_spx.xref_sport_team_divisions (
  "team_division_id" smallint,
  "team_id" smallint,
  "division_id" smallint,
  _seen_in text[] not null,
  primary key ("team_division_id")
);
comment on table legacy_spx.xref_sport_team_divisions is 'SPX xrefSportTeamDivisions';
create table legacy_spx.xref_sport_team_leagues (
  "sport_team_league_id" smallint,
  "sport_id" smallint,
  "league_id" smallint,
  "team_id" smallint,
  _seen_in text[] not null,
  primary key ("sport_team_league_id")
);
comment on table legacy_spx.xref_sport_team_leagues is 'SPX xrefSportTeamLeagues';
create table legacy_spx.xref_sport_teams (
  "sport_team_id" smallint,
  "sport_id" smallint,
  "team_id" smallint,
  _seen_in text[] not null,
  primary key ("sport_team_id")
);
comment on table legacy_spx.xref_sport_teams is 'SPX xrefSportTeams';
create table legacy_spx.xref_team_conference_division_seasons (
  "team_id" integer,
  "conference_id" integer,
  "division_id" integer,
  "season_id" integer,
  "season_start_year" smallint,
  "season_end_year" smallint,
  _seen_in text[] not null,
  _row_hash text not null unique
);
comment on table legacy_spx.xref_team_conference_division_seasons is 'SPX xrefTeamConferenceDivisionSeasons';

-- nflverse passes and runs with where they went (DS1 and the working copy only: production has no legacy_* schemas). Add-only.
-- Source: the "pbp" release of github.com/nflverse/nflverse-data, play_by_play_<year>.csv.gz, 1999-2025, parsed by scripts/nflverse/pbp_location.py.
-- nflverse data is licensed CC BY 4.0; credit "nflverse (CC BY 4.0), data from NFL.com". Only the pbp release is used.
--
--   legacy_nflverse.pbp_location           one row per pass or run (play_type 'pass' or 'run'), about 0.9 million rows, 1999-2025. Ids are nflverse's
--                                          (game_id 1999_01_ARI_PHI, gsis player ids 00-0033873); db/build/208_pass_run_location.sql maps them to core.
--   legacy_nflverse.pbp_location_coverage  per season and season type: plays, pass attempts, passes with a location and air yards, runs, runs with
--                                          a location. Run locations are dense from 1999. Pass location with air yards starts in 2006: 1999-2005
--                                          have no air_yards at all, so those seasons have no pass grid (a hole, not a zero).
-- Load order and commands: the comment at the top of db/build/208_pass_run_location.sql.
create schema if not exists legacy_nflverse;

create table if not exists legacy_nflverse.pbp_location (
  game_id            text not null,            -- nflverse game id (season_week_away_home), the key of legacy_nflverse.game
  play_id            integer not null,
  season             smallint not null,
  week               smallint,
  season_type        text not null check (season_type in ('REG', 'POST')),
  posteam            text,                     -- the club with the ball (nflverse's current codes: LA, LV, LAC in every season)
  defteam            text,
  posteam_type       text check (posteam_type in ('home', 'away')),   -- which of the game's two sides has the ball
  play_type          text not null check (play_type in ('pass', 'run')),
  pass_attempt       boolean,                  -- a pass attempt (a sack is a pass play but not an attempt)
  rush_attempt       boolean,
  sack               boolean,
  qb_scramble        boolean,
  two_point          boolean not null,         -- a two-point try; the build leaves these out of the grids
  pass_location      text check (pass_location in ('left', 'middle', 'right')),
  air_yards          smallint,                 -- yards the ball travelled past the line of scrimmage; negative behind it; null before 2006
  yards_after_catch  smallint,
  complete_pass      boolean,
  interception       boolean,
  pass_touchdown     boolean,
  run_location       text check (run_location in ('left', 'middle', 'right')),
  run_gap            text check (run_gap in ('end', 'tackle', 'guard')),   -- empty for a run up the middle (and a few left or right runs)
  yards_gained       smallint,
  rush_touchdown     boolean,
  yardline_100       smallint,                 -- yards from the opponent's end line
  passer_id          text,                     -- gsis ids
  passer_name        text,
  receiver_id        text,
  receiver_name      text,
  rusher_id          text,
  rusher_name        text,
  primary key (game_id, play_id)
);
comment on table legacy_nflverse.pbp_location is 'NFL passes and runs from nflverse play-by-play (pbp release), 1999-2025, with pass and run locations. CC BY 4.0, data from NFL.com. Ids are nflverse''s.';
comment on column legacy_nflverse.pbp_location.air_yards is 'nflverse air_yards; empty in 1999-2005, so the pass grid starts in 2006.';

create table if not exists legacy_nflverse.pbp_location_coverage (
  season         smallint not null,
  season_type    text not null,
  plays          integer not null,       -- passes and runs of the season's file (kicks, punts, kneel-downs, spikes and no-plays excluded)
  pass_attempts  integer not null,       -- pass attempts, two-point tries excluded
  pass_located   integer not null,       -- ... with pass_location and air_yards
  runs           integer not null,       -- rushing attempts, two-point tries excluded
  run_located    integer not null,       -- ... up the middle, or left or right with a gap (end, tackle, guard)
  primary key (season, season_type)
);
comment on table legacy_nflverse.pbp_location_coverage is 'How much of each season''s passes and runs carry a location; the rest are holes.';

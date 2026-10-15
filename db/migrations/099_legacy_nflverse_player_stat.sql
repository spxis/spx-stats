-- nflverse player statistics by season (nflverse-data, release "stats_player", CC BY 4.0; 1999 on), one row per player, club, season and kind, built
-- from the weekly files by scripts/player_stats/nflverse_stats_load.py (the file's header says how: weeks added per club, only counting numbers, a
-- column kept in a season only where nflverse really has it). The raw weekly and season files are in legacy_files.raw_archive
-- (nflverse_player_stats/<day>/). core is filled by db/build/181_stats_nfl_nflverse.sql. DS1 only (legacy schema, never in production).
-- Add-only; rerunnable.
create schema if not exists legacy_nflverse;

create table if not exists legacy_nflverse.player_stat (
  season         smallint not null,
  season_type    text     not null check (season_type in ('REG', 'POST')),
  team           text     not null,                   -- nflverse's franchise code (current code for every year: LV, LAC and LA also for the Oakland, San Diego and St. Louis years)
  gsis_id        text     not null,                   -- the NFL's player id as nflverse publishes it (00-0033873)
  player_name    text,
  position       text,
  position_group text,
  games          smallint not null,                   -- weeks the club has a line for this player
  stats          jsonb    not null check (jsonb_typeof(stats) = 'object'),   -- nflverse column name -> value, kept columns only, zero and absent = left out
  primary key (season, season_type, team, gsis_id)
);
create index if not exists nflverse_player_stat_gsis_idx on legacy_nflverse.player_stat (gsis_id);
comment on table legacy_nflverse.player_stat is 'nflverse player statistics per player, club, season and kind, CC BY 4.0, summed from the weekly files. Loaded by scripts/player_stats/nflverse_stats_load.py.';

-- The columns nflverse really has in a season (a column not listed here was not recorded that year: absent, never zero).
create table if not exists legacy_nflverse.player_stat_column (
  season smallint not null,
  col    text     not null,
  primary key (season, col)
);

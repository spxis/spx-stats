-- nflverse's NFL season rosters (github.com/nflverse/nflverse-data, release "rosters": roster_<season>.csv, 1920 on), as published except for the
-- columns that carry other sites' player ids (ESPN, Pro Football Reference, PFF, Yahoo and more) and NFL.com image links, which are not stored
-- anywhere (scripts/rosters/nflverse_fetch.py drops them as it saves each file). nflverse data is CC BY 4.0. One row per line of the file.
-- Loaded by scripts/rosters/nflverse_load.py; core is filled by db/build/181_players_nflverse.sql. Add-only; rerunnable.
create table if not exists legacy_nflverse.roster (
  season          smallint not null,
  row_no          integer  not null,             -- the line of the season's file, from 1
  team            text     not null,             -- nflverse team code of that season (ARZ, BLT, SL, RAI ... see db/seed/nflverse_roster_team.csv)
  position        text,
  depth_position  text,                          -- depth_chart_position: the finer position (OT, OLB, FS ...)
  jersey_number   smallint,
  status          text,                          -- ACT, RES, CUT, DEV (practice squad) ...
  full_name       text not null,
  first_name      text,
  last_name       text,
  birth_date      date,
  height_in       smallint,
  weight_lb       smallint,
  college         text,
  gsis_id         text,                          -- the NFL's own player id as nflverse publishes it (00-0000047)
  years_exp       smallint,
  entry_year      smallint,
  rookie_year     smallint,
  draft_club      text,
  draft_number    smallint,
  week            smallint,
  game_type       text,
  primary key (season, row_no)
);
create index if not exists nflverse_roster_gsis_idx on legacy_nflverse.roster (gsis_id);
comment on table legacy_nflverse.roster is 'nflverse season rosters, CC BY 4.0, without other sites'' ids. Loaded by scripts/rosters/nflverse_load.py.';

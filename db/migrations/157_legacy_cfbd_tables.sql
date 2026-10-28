-- CollegeFootballData.com raw loads, as parsed (scripts/grey/cfbd_load.py): the rest of what scripts/grey/cfbd_fetch.py downloads, beside legacy_cfbd.game (migration 154).
-- Green source (a free key; credit "College football data from CollegeFootballData.com"). One row per API item, replaced by its own key on a rerun; provenance in source_key
-- ('cfbd:<kind>:<ids>'). The raw answers are archived first (scripts/archive_raw.py cfbd ...). Nothing here is built into core yet and none of it is published
-- to production (legacy schemas never are). DS1 only. Add-only, rerunnable. Needs migration 154.

alter table legacy_cfbd.game
  add column if not exists start_time_tbd          boolean,
  add column if not exists home_classification     text,
  add column if not exists away_classification     text,
  add column if not exists home_line_scores        jsonb,
  add column if not exists away_line_scores        jsonb,
  add column if not exists home_pregame_elo        integer,
  add column if not exists home_postgame_elo       integer,
  add column if not exists away_pregame_elo        integer,
  add column if not exists away_postgame_elo       integer,
  add column if not exists home_postgame_win_prob  real,
  add column if not exists away_postgame_win_prob  real,
  add column if not exists excitement_index        real,
  add column if not exists notes                   text,
  add column if not exists highlights              text,
  add column if not exists playoff                 jsonb;
create index if not exists game_season_idx on legacy_cfbd.game (season);

create table if not exists legacy_cfbd.conference (
  conference_id  integer primary key,
  name           text not null,
  short_name     text,
  abbreviation   text,
  classification text,
  member_count   integer,
  fetched_on     date not null,
  source_key     text not null unique
);

create table if not exists legacy_cfbd.team (
  team_id        integer primary key,
  school         text not null,
  mascot         text,
  abbreviation   text,
  alternate_names jsonb,
  conference     text,
  division       text,
  classification text,
  color          text,
  alternate_color text,
  twitter        text,
  logos          jsonb,
  venue_id       integer,
  venue_name     text,
  city           text,
  state          text,
  zip            text,
  country_code   text,
  timezone       text,
  latitude       double precision,
  longitude      double precision,
  elevation      text,
  capacity       integer,
  construction_year integer,
  grass          boolean,
  dome           boolean,
  fetched_on     date not null,
  source_key     text not null unique
);

create table if not exists legacy_cfbd.venue (
  venue_id       integer primary key,
  name           text not null,
  city           text,
  state          text,
  zip            text,
  country_code   text,
  timezone       text,
  latitude       double precision,
  longitude      double precision,
  elevation      text,
  capacity       integer,
  construction_year integer,
  grass          boolean,
  dome           boolean,
  fetched_on     date not null,
  source_key     text not null unique
);

create table if not exists legacy_cfbd.conference_affiliation (
  team_id        integer not null,
  team           text not null,
  conference_id  integer not null,
  conference     text not null,
  conference_abbreviation text,
  classification text,
  division       text,
  start_year     smallint not null,
  end_year       smallint,
  fetched_on     date not null,
  source_key     text primary key
);

create table if not exists legacy_cfbd.coach (
  coach_id       integer primary key,
  first_name     text,
  last_name      text,
  hire_date      timestamptz,
  fetched_on     date not null,
  source_key     text not null unique
);

create table if not exists legacy_cfbd.coach_season (
  coach_id       integer not null,
  season         smallint not null,
  team_id        integer not null,
  school         text,
  conference     text,
  games          smallint,
  wins           smallint,
  losses         smallint,
  ties           smallint,
  win_percentage real,
  preseason_rank smallint,
  postseason_rank smallint,
  srs            real,
  sp_overall     real,
  sp_offense     real,
  sp_defense     real,
  fetched_on     date not null,
  source_key     text not null unique,
  primary key (coach_id, season, team_id)
);

create table if not exists legacy_cfbd.team_record (
  season         smallint not null,
  team_id        integer not null,
  team           text not null,
  classification text,
  conference     text,
  division       text,
  expected_wins  real,
  total_games smallint, total_wins smallint, total_losses smallint, total_ties smallint,
  conf_games smallint, conf_wins smallint, conf_losses smallint, conf_ties smallint,
  home_games smallint, home_wins smallint, home_losses smallint, home_ties smallint,
  away_games smallint, away_wins smallint, away_losses smallint, away_ties smallint,
  neutral_games smallint, neutral_wins smallint, neutral_losses smallint, neutral_ties smallint,
  regular_games smallint, regular_wins smallint, regular_losses smallint, regular_ties smallint,
  post_games smallint, post_wins smallint, post_losses smallint, post_ties smallint,
  fetched_on     date not null,
  source_key     text not null unique,
  primary key (season, team_id)
);

create table if not exists legacy_cfbd.poll_rank (
  season         smallint not null,
  season_type    text not null,
  week           smallint not null,
  poll           text not null,
  is_final       boolean,
  rank           smallint not null,
  team_id        integer,
  school         text not null,
  conference     text,
  first_place_votes integer,
  points         integer,
  fetched_on     date not null,
  source_key     text not null unique,
  primary key (season, season_type, week, poll, school)
);

create table if not exists legacy_cfbd.draft_pick (
  draft_year     smallint not null,
  overall        smallint not null,
  round          smallint,
  pick           smallint,
  name           text,
  position       text,
  height         real,
  weight         integer,
  college_athlete_id integer,
  nfl_athlete_id integer,
  college_id     integer,
  college_team   text,
  college_conference text,
  nfl_team_id    integer,
  nfl_team       text,
  pre_draft_ranking integer,
  pre_draft_position_ranking integer,
  pre_draft_grade integer,
  hometown       jsonb,
  fetched_on     date not null,
  source_key     text not null unique,
  primary key (draft_year, overall)
);

create table if not exists legacy_cfbd.team_season_stat (
  season         smallint not null,
  team           text not null,
  conference     text,
  stat_name      text not null,
  stat_value     double precision,
  fetched_on     date not null,
  source_key     text not null unique,
  primary key (season, team, stat_name)
);

create table if not exists legacy_cfbd.roster_player (
  season         smallint not null,
  player_id      text not null,
  team           text not null,
  first_name     text,
  last_name      text,
  weight         smallint,
  height         smallint,
  jersey         smallint,
  class_year     smallint,
  position       text,
  home_city      text,
  home_state     text,
  home_country   text,
  home_latitude  double precision,
  home_longitude double precision,
  home_county_fips text,
  recruit_ids    jsonb,
  fetched_on     date not null,
  source_key     text not null unique,
  primary key (season, player_id, team)
);

create table if not exists legacy_cfbd.player_season_stat (
  season         smallint not null,
  player_id      text not null,
  team           text not null,
  player         text,
  position       text,
  conference     text,
  category       text not null,
  stat_type      text not null,
  stat           text,
  fetched_on     date not null,
  source_key     text not null unique,
  primary key (season, player_id, team, category, stat_type)
);

create table if not exists legacy_cfbd.team_game_stat (
  season         smallint not null,
  game_id        bigint not null,
  team_id        integer not null,
  team           text not null,
  conference     text,
  home_away      text,
  points         smallint,
  category       text not null,
  stat           text,
  fetched_on     date not null,
  source_key     text not null unique,
  primary key (game_id, team_id, category)
);
create index if not exists team_game_stat_season_idx on legacy_cfbd.team_game_stat (season);

comment on schema legacy_cfbd is 'CollegeFootballData.com raw loads (green: free key, credit "College football data from CollegeFootballData.com"). DS1 only; not published.';

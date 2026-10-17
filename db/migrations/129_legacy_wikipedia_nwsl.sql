-- The National Women's Soccer League (2013 on) from English Wikipedia (CC BY-SA 4.0), parsed by
-- scripts/nwsl/season.py into legacy_wikipedia_nwsl. The NWSL is its own league in core ('nwsl', db/build/219),
-- never counted as MLS: core.season is one row per league and year, and an NWSL season is one calendar year.
--   * game: paired from the clubs' season-article football boxes (regular season and playoffs).
--   * standing: the published final standings (one table; the NWSL has no conferences).
-- Add-only, rerunnable. DS1 only: legacy schemas are not published to production.
create schema if not exists legacy_wikipedia_nwsl;
comment on schema legacy_wikipedia_nwsl is 'NWSL results and standings from English Wikipedia, as parsed. CC BY-SA 4.0.';

create table if not exists legacy_wikipedia_nwsl.season (
  season      integer primary key,          -- calendar year: 2013, 2025
  page_title  text not null,                -- e.g. 2013 National Women's Soccer League season
  teams       smallint not null,
  fetched_on  date not null,
  champion    text                          -- the champions the season article's infobox names, as written
);
create table if not exists legacy_wikipedia_nwsl.team_season (
  season      integer not null,
  team_name   text not null,                -- the club's name that season, from the article title
  page_title  text not null,                -- e.g. 2013 Portland Thorns FC season
  log_games   smallint not null,
  primary key (season, team_name)
);
create table if not exists legacy_wikipedia_nwsl.game (
  season       integer not null,
  phase        text not null check (phase in ('regular', 'playoffs')),
  game_date    date not null,
  round_name   text,
  home_team    text not null,
  away_team    text not null,
  home_pts     smallint not null,
  away_pts     smallint not null,
  overtime     boolean not null default false,   -- extra time (a.e.t.)
  shootout     boolean not null default false,   -- decided on penalties; the stored score may add one to the winner
  neutral_site boolean not null default false,
  views        smallint not null,
  conflict     text,
  src          text not null,
  game_seq     smallint not null,
  primary key (season, phase, game_date, home_team, away_team, game_seq)
);
create index if not exists wikipedia_nwsl_game_season_idx on legacy_wikipedia_nwsl.game (season, game_date);
create table if not exists legacy_wikipedia_nwsl.standing (
  season    integer not null,
  team      text not null,
  division  text not null,                   -- the standings template or page it came from
  gp smallint, w smallint, d smallint, l smallint, pts smallint,
  gf smallint, ga smallint,
  src       text not null,
  primary key (season, team, division)
);
create table if not exists legacy_wikipedia_nwsl.unparsed (
  season   integer not null,
  page     text not null,
  row_text text not null
);
create index if not exists wikipedia_nwsl_unparsed_idx on legacy_wikipedia_nwsl.unparsed (season);

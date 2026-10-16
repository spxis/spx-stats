-- The Women's National Basketball Association (1997 on) from English Wikipedia (CC BY-SA 4.0), parsed by
-- scripts/wnba/season.py into legacy_wikipedia_wnba. The WNBA is its own league in core ('wnba', db/build/216),
-- never counted as the NBA: core.season is one row per league and year, and a WNBA season is one calendar year.
--   * game: paired from the two clubs' season-article game logs (regular season and playoffs).
--   * standing: the published final standings (overall, or Eastern/Western conference tables).
-- Add-only, rerunnable. DS1 only: legacy schemas are not published to production.
create schema if not exists legacy_wikipedia_wnba;
comment on schema legacy_wikipedia_wnba is 'WNBA results and standings from English Wikipedia, as parsed. CC BY-SA 4.0.';

create table if not exists legacy_wikipedia_wnba.season (
  season      integer primary key,          -- calendar year: 1997, 2024
  page_title  text not null,                -- e.g. 2024 WNBA season
  teams       smallint not null,
  fetched_on  date not null,
  champion    text                          -- the finals_champ the season article's infobox names, as written
);
create table if not exists legacy_wikipedia_wnba.team_season (
  season      integer not null,
  team_name   text not null,                -- the club's name that season, from the article title
  page_title  text not null,                -- e.g. 2024 Las Vegas Aces season
  log_games   smallint not null,
  primary key (season, team_name)
);
create table if not exists legacy_wikipedia_wnba.game (
  season       integer not null,
  phase        text not null check (phase in ('regular', 'playoffs')),
  game_date    date not null,
  round_name   text,
  home_team    text not null,
  away_team    text not null,
  home_pts     smallint not null,
  away_pts     smallint not null,
  overtime     boolean not null default false,
  neutral_site boolean not null default false,
  views        smallint not null,
  conflict     text,
  src          text not null,
  game_seq     smallint not null,
  primary key (season, phase, game_date, home_team, away_team, game_seq)
);
create index if not exists wikipedia_wnba_game_season_idx on legacy_wikipedia_wnba.game (season, game_date);
create table if not exists legacy_wikipedia_wnba.standing (
  season    integer not null,
  team      text not null,
  division  text not null,                   -- the standings template it came from
  gp smallint, w smallint, l smallint,
  pct       text, gb text, home text, road text,
  src       text not null,
  primary key (season, team, division)
);
create table if not exists legacy_wikipedia_wnba.unparsed (
  season   integer not null,
  page     text not null,
  row_text text not null
);
create index if not exists wikipedia_wnba_unparsed_idx on legacy_wikipedia_wnba.unparsed (season);

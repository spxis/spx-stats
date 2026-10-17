-- The Professional Women's Hockey League (2023-24 on) from English Wikipedia (CC BY-SA 4.0), parsed by
-- scripts/pwhl/season.py into legacy_wikipedia_pwhl. The PWHL is its own league in core ('pwhl', db/build/218),
-- never counted as the NHL: core.season is one row per league and year, and a PWHL season is named by the
-- year it starts (2023 = the 2023-24 season).
--   * game: paired from the two clubs' season-article game logs (regular season and playoffs).
--   * standing: the published final standings (one table; the PWHL has no conferences).
-- Add-only, rerunnable. DS1 only: legacy schemas are not published to production.
create schema if not exists legacy_wikipedia_pwhl;
comment on schema legacy_wikipedia_pwhl is 'PWHL results and standings from English Wikipedia, as parsed. CC BY-SA 4.0.';

create table if not exists legacy_wikipedia_pwhl.season (
  season      integer primary key,          -- the year the season starts: 2023 = 2023-24
  page_title  text not null,                -- e.g. 2023–24 PWHL season
  teams       smallint not null,
  fetched_on  date not null,
  champion    text                          -- the playoffs_champ the season article's infobox names, as written
);
create table if not exists legacy_wikipedia_pwhl.team_season (
  season      integer not null,
  team_name   text not null,                -- the club's name that season, from the article title
  page_title  text not null,                -- e.g. 2023–24 PWHL Minnesota season
  log_games   smallint not null,
  primary key (season, team_name)
);
create table if not exists legacy_wikipedia_pwhl.game (
  season       integer not null,
  phase        text not null check (phase in ('regular', 'playoffs')),
  game_date    date not null,
  round_name   text,
  home_team    text not null,
  away_team    text not null,
  home_pts     smallint not null,
  away_pts     smallint not null,
  overtime     boolean not null default false,
  shootout     boolean not null default false,
  neutral_site boolean not null default false,
  views        smallint not null,
  conflict     text,
  src          text not null,
  game_seq     smallint not null,
  primary key (season, phase, game_date, home_team, away_team, game_seq)
);
create index if not exists wikipedia_pwhl_game_season_idx on legacy_wikipedia_pwhl.game (season, game_date);
create table if not exists legacy_wikipedia_pwhl.standing (
  season    integer not null,
  team      text not null,
  division  text not null,                   -- the standings template it came from
  gp smallint, w smallint, l smallint, otl smallint, pts smallint,
  gf smallint, ga smallint,
  pct       text, gb text, home text, road text,
  src       text not null,
  primary key (season, team, division)
);
create table if not exists legacy_wikipedia_pwhl.unparsed (
  season   integer not null,
  page     text not null,
  row_text text not null
);
create index if not exists wikipedia_pwhl_unparsed_idx on legacy_wikipedia_pwhl.unparsed (season);

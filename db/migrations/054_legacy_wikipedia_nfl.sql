-- NFL games, playoffs and final standings from English Wikipedia (CC BY-SA 4.0), the seasons
-- nflverse does not cover (before 1999): each club's season article (its game log: regular season
-- and playoffs) and the season's standings templates. Parsed from the wikitext saved under
-- ~/spx-raw/wikipedia_nfl/<date>/ by scripts/nfl/; each row keeps the cleaned table row(s) it came
-- from. Neither the NFL's own site nor Pro-Football-Reference was used (see the 151 build step).
-- DS1 only: legacy schemas are not published to production.
create schema if not exists legacy_wikipedia_nfl;
comment on schema legacy_wikipedia_nfl is 'NFL results and standings from English Wikipedia, as parsed. CC BY-SA 4.0.';

create table if not exists legacy_wikipedia_nfl.season (
  season      integer primary key,          -- the year the season starts: 1987 = the 1987 NFL season
  page_title  text not null,                -- e.g. 1987 NFL season
  teams       smallint not null,
  fetched_on  date not null
);

create table if not exists legacy_wikipedia_nfl.team_season (
  season      integer not null,
  team_name   text not null,                -- the club's name that season, from the article title
  page_title  text not null,                -- e.g. 1987 Chicago Bears season
  log_games   smallint not null,            -- games of its log that were read (regular season + playoffs)
  primary key (season, team_name)
);

-- One row per game: paired from the two clubs' game logs (views = 2) or read from one (views = 1).
create table if not exists legacy_wikipedia_nfl.game (
  season       integer not null,
  phase        text not null check (phase in ('regular', 'playoffs')),
  game_date    date not null,
  week         smallint,                     -- the week a log numbers it (null for playoff rounds)
  round_name   text,                         -- playoff round, as the log names it
  home_team    text not null,
  away_team    text not null,
  home_pts     smallint not null,
  away_pts     smallint not null,
  overtime     boolean not null default false,
  neutral_site boolean not null default false,
  views        smallint not null,
  conflict     text,                         -- how the two logs disagree, if they do
  src          text not null,                -- the cleaned table row(s)
  game_seq     smallint not null,            -- tells apart a repeat meeting on one date
  primary key (season, phase, game_date, home_team, away_team, game_seq)
);
create index if not exists wikipedia_nfl_game_season_idx on legacy_wikipedia_nfl.game (season, game_date);

create table if not exists legacy_wikipedia_nfl.standing (
  season    integer not null,
  team      text not null,
  division  text not null,                   -- the standings template it came from
  rank_in_template smallint not null,        -- the order the template lists the clubs (the template's own ranking)
  seed      smallint,                        -- playoff seed where the template shows one
  w smallint, l smallint, t smallint,
  pct       text, div_record text, conf_record text,
  pf integer, pa integer,
  streak    text,
  src       text not null,
  primary key (season, team, division)
);

-- Rows a parser could not read, kept so nothing drops silently.
create table if not exists legacy_wikipedia_nfl.unparsed (
  season   integer not null,
  page     text not null,
  row_text text not null
);
create index if not exists wikipedia_nfl_unparsed_idx on legacy_wikipedia_nfl.unparsed (season);

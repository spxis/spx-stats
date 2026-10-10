-- CFL games, final standings and Grey Cup results from English Wikipedia (CC BY-SA 4.0):
-- the season articles (standings, playoff brackets, the Grey Cup infobox) and each club's
-- season article (its regular-season schedule table). Parsed from the wikitext saved under
-- raw/wikipedia/<date>/ by scripts/wikipedia/; each row keeps the cleaned table row it came from.
create schema if not exists legacy_wikipedia_cfl;
comment on schema legacy_wikipedia_cfl is 'CFL results and standings from English Wikipedia, as parsed. CC BY-SA 4.0.';

create table legacy_wikipedia_cfl.season (
  season          integer primary key,
  page_title      text not null,            -- e.g. 2002 CFL season
  grey_cup        text,                     -- infobox: 90th Grey Cup
  grey_cup_date   text,                     -- as the infobox gives it
  grey_cup_venue  text,
  champion        text,
  east_champion   text,
  west_champion   text,
  duration        text,
  fetched_on      date not null
);

create table legacy_wikipedia_cfl.team_season (
  season      integer not null,
  page_title  text not null,                -- e.g. 2002 BC Lions season
  team_name   text not null,                -- the club's name that season, from the title
  primary key (season, team_name)
);

-- One row per game. A regular-season game is paired from the two clubs' own schedule tables
-- (views = 2) or has only one (views = 1); a playoff game comes from the season's bracket.
create table legacy_wikipedia_cfl.game (
  season       integer not null,
  phase        text not null check (phase in ('regular', 'playoffs')),
  game_date    date,                         -- null when the bracket gives no date
  week         text,
  round_name   text,                         -- playoff round, as the bracket names it
  home_team    text,                         -- null when neither page says who was at home
  away_team    text,
  teams        text[] not null,              -- the two clubs, in page order
  home_pts     smallint,
  away_pts     smallint,
  overtime     boolean,
  neutral_site boolean not null default false,
  views        smallint not null,
  conflict     text,                         -- how the two pages disagree, if they do
  src          text not null,                -- the cleaned table row(s)
  game_seq     smallint not null             -- tells apart a repeat meeting on one date
);
create unique index wikipedia_cfl_game_key on legacy_wikipedia_cfl.game (season, phase, coalesce(game_date, date '1900-01-01'), teams, game_seq);
create index wikipedia_cfl_game_season_idx on legacy_wikipedia_cfl.game (season, game_date);

create table legacy_wikipedia_cfl.standing (
  season    integer not null,
  division  text not null,
  rank      smallint not null,
  team      text not null,
  gp        smallint, w smallint, l smallint, t smallint, otl smallint, pts smallint,
  pf        integer, pa integer,
  src       text not null,
  primary key (season, division, team)
);

-- Rows a parser could not read, kept so nothing drops silently.
create table legacy_wikipedia_cfl.unparsed (
  season   integer not null,
  page     text not null,
  section  text,
  row_text text not null
);
create index wikipedia_cfl_unparsed_idx on legacy_wikipedia_cfl.unparsed (season);

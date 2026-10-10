-- NBA (and BAA) games, playoffs and final standings from English Wikipedia (CC BY-SA 4.0):
-- each club's season article (its game log: regular season and playoffs) and the season's
-- standings templates. Parsed from the wikitext saved under raw/wikipedia/<date>/ by scripts/nba/;
-- each row keeps the cleaned table row(s) it came from. The official NBA feeds were not used: their
-- terms forbid automated access (see the 147 build step).
create schema if not exists legacy_wikipedia_nba;
comment on schema legacy_wikipedia_nba is 'NBA/BAA results and standings from English Wikipedia, as parsed. CC BY-SA 4.0.';

create table legacy_wikipedia_nba.season (
  season      integer primary key,          -- start year: 2017 = 2017-18
  page_title  text not null,                -- e.g. 2017–18 NBA season
  teams       smallint not null,
  fetched_on  date not null
);

create table legacy_wikipedia_nba.team_season (
  season      integer not null,
  team_name   text not null,                -- the club's name that season, from the article title
  page_title  text not null,                -- e.g. 2017–18 Boston Celtics season
  log_games   smallint not null,            -- games of its log that were read (regular season + playoffs)
  primary key (season, team_name)
);

-- One row per game: paired from the two clubs' game logs (views = 2) or read from one (views = 1).
create table legacy_wikipedia_nba.game (
  season       integer not null,
  phase        text not null check (phase in ('regular', 'playoffs')),
  game_date    date not null,
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
create index wikipedia_nba_game_season_idx on legacy_wikipedia_nba.game (season, game_date);

create table legacy_wikipedia_nba.standing (
  season    integer not null,
  team      text not null,
  division  text not null,                   -- the standings template it came from
  gp smallint, w smallint, l smallint,
  pct       text, gb text, home text, road text, div_record text,
  src       text not null,
  primary key (season, team, division)
);

-- Rows a parser could not read, kept so nothing drops silently.
create table legacy_wikipedia_nba.unparsed (
  season   integer not null,
  page     text not null,
  row_text text not null
);
create index wikipedia_nba_unparsed_idx on legacy_wikipedia_nba.unparsed (season);

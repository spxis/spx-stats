-- The All-America Football Conference (1946-1949) from English Wikipedia (CC BY-SA 4.0), parsed by scripts/nfl/season.py --league aafc
-- into legacy_wikipedia_aafc: the same five tables as legacy_wikipedia_nfl (migration 054) and legacy_wikipedia_afl (109), because the loader
-- and the parser are the same code (an AAFC club-season article is laid out like an NFL one). The AAFC is its own league in core ('aafc',
-- db/build/151), so its seasons never collide with the NFL seasons of the same years; a club that played on in the NFL (the Browns, the
-- 49ers, the Colts) is one franchise with a league membership for each.
-- Add-only, rerunnable. DS1 only: legacy schemas are not published to production.
create schema if not exists legacy_wikipedia_aafc;
comment on schema legacy_wikipedia_aafc is 'AAFC results and standings from English Wikipedia, as parsed. CC BY-SA 4.0.';

create table if not exists legacy_wikipedia_aafc.season (
  season      integer primary key,
  page_title  text not null,
  teams       smallint not null,
  fetched_on  date not null,
  champion    text
);
create table if not exists legacy_wikipedia_aafc.team_season (
  season      integer not null,
  team_name   text not null,
  page_title  text not null,
  log_games   smallint not null,
  primary key (season, team_name)
);
create table if not exists legacy_wikipedia_aafc.game (
  season       integer not null,
  phase        text not null check (phase in ('regular', 'playoffs')),
  game_date    date not null,
  week         smallint,
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
create index if not exists wikipedia_aafc_game_season_idx on legacy_wikipedia_aafc.game (season, game_date);
create table if not exists legacy_wikipedia_aafc.standing (
  season    integer not null,
  team      text not null,
  division  text not null,
  rank_in_template smallint not null,
  seed      smallint,
  w smallint, l smallint, t smallint,
  pct       text, div_record text, conf_record text,
  pf integer, pa integer,
  streak    text,
  src       text not null,
  primary key (season, team, division)
);
create table if not exists legacy_wikipedia_aafc.unparsed (
  season   integer not null,
  page     text not null,
  row_text text not null
);
create index if not exists wikipedia_aafc_unparsed_idx on legacy_wikipedia_aafc.unparsed (season);

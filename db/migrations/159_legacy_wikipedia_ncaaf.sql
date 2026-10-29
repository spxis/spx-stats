-- NCAA Division I-A / FBS college football from English Wikipedia (CC BY-SA 4.0), parsed by scripts/ncaaf/season.py, seasons 2000 on
-- (the 2000-2005 seasons were played as Division I-A). A season is the year it starts in (2005 = the 2005 season, ending in January 2006), as core.season.start_year.
--   * season: the season article, the national champion (the winner of the national championship game; the infobox's own wording is kept beside it).
--   * team_season: the teams of the division (classification 'fbs': they appear in a conference standings template) and the teams outside it that
--     a team of the division played (classification 'other': FCS and lower), with the conference and division the standings template gives.
--   * standing: each team's line in the standings templates: conference record and overall record (the overall record counts the bowl games
--     and the conference championship game, as the NCAA does) and the champion flags.
--   * game: every game a team of the division's article logs, both teams' logs merged (`views` is 2 when both told it, 1 when one did, as every
--     game against a team outside the division); `conflict` says where two logs disagreed and which was kept.
-- Add-only, rerunnable. DS1 only: legacy schemas are not published to production.
create schema if not exists legacy_wikipedia_ncaaf;
comment on schema legacy_wikipedia_ncaaf is 'NCAA Division I-A / FBS football seasons from English Wikipedia, as parsed. CC BY-SA 4.0.';

create table if not exists legacy_wikipedia_ncaaf.season (
  season            integer primary key,
  page_title        text not null,
  revid             bigint,
  fetched_on        date not null,
  teams             smallint not null,
  champion          text,
  champion_basis    text,
  infobox_champions text,
  system            text,
  bowl_start        text
);
create table if not exists legacy_wikipedia_ncaaf.team_season (
  season          integer not null,
  team_name       text not null,
  school          text,
  page_title      text,
  revid           bigint,
  classification  text not null check (classification in ('fbs', 'other')),
  conference      text,
  division        text,
  infobox_conference text,
  infobox_division   text,
  log_games       smallint not null,
  primary key (season, team_name)
);
create table if not exists legacy_wikipedia_ncaaf.standing (
  season      integer not null,
  team_name   text not null,
  conference  text not null,
  division    text,
  rank_in_template smallint not null,
  conf_w      smallint,
  conf_l      smallint,
  conf_t      smallint,
  w           smallint not null,
  l           smallint not null,
  t           smallint,
  div_champ   boolean not null default false,
  conf_champ  boolean not null default false,
  natl_champ  boolean not null default false,
  co_champ    boolean not null default false,
  primary key (season, team_name)
);
create table if not exists legacy_wikipedia_ncaaf.game (
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
  venue        text,
  attendance   integer,
  views        smallint not null,
  conflict     text,
  src          text not null,
  game_seq     smallint not null,
  nonconf      boolean not null default false,
  primary key (season, phase, game_date, home_team, away_team, game_seq)
);
create table if not exists legacy_wikipedia_ncaaf.unparsed (
  season  integer not null,
  page    text not null,
  txt     text not null
);
create index if not exists ncaaf_game_season_idx on legacy_wikipedia_ncaaf.game (season, game_date);

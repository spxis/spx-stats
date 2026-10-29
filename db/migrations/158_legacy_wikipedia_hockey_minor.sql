-- North American minor-league hockey from English Wikipedia (CC BY-SA 4.0), parsed by scripts/hockey_minor/season.py into one schema with a league column:
-- the American Hockey League (ahl, 1936-37 to 2025-26, as the International-American Hockey League until 1939-40) is the first; the ECHL, the IHL, the
-- Canadian Hockey League's leagues, the USHL and the defunct minor leagues load into the same tables. `season` is the year a season starts in
-- (1936 = 1936-37), as core.season.start_year. A schema of its own, not legacy_wikipedia_hockey (migration 113): db/build/154 reads every row of that one.
--   * standing: the published final standings, one row per club and division table, with the NHL club(s) it was affiliated with that season
--     (`affiliation`: "DET", "BOS/CGY", "independent") and the conference heading above the table when the article has one;
--   * series: a playoff series told as a result (a bracket template, or a sentence "A defeated B 3 games to 1"): games won, or goals in a round the article
--     says was played as a total-goals series;
--   * game: the games an article tabulates ({{NHLPlayoffs}} blocks); no article tabulates a regular season;
--   * team_season: the clubs of a season; unparsed: what nothing here could read.
-- Add-only, rerunnable. DS1 only: legacy schemas are not published to production.
create schema if not exists legacy_wikipedia_hockey_minor;
comment on schema legacy_wikipedia_hockey_minor is 'AHL (and later other minor-league hockey) seasons from English Wikipedia, as parsed. CC BY-SA 4.0.';

create table if not exists legacy_wikipedia_hockey_minor.season (
  league         text not null,
  season         integer not null,
  page_title     text not null,
  playoffs_title text,
  teams          smallint not null,
  fetched_on     date not null,
  champion       text,
  champion_link  text,
  champion_basis text,
  primary key (league, season)
);
create table if not exists legacy_wikipedia_hockey_minor.team_season (
  league      text not null,
  season      integer not null,
  team_name   text not null,
  link_title  text,
  affiliation text,
  primary key (league, season, team_name)
);
create table if not exists legacy_wikipedia_hockey_minor.standing (
  league    text not null,
  season    integer not null,
  team      text not null,
  division  text not null,
  conference text,
  rank_in_table smallint not null,
  gp smallint, w smallint, l smallint, t smallint, otl smallint, sol smallint, pts smallint,
  gf integer, ga integer,
  link_title text,
  affiliation text,
  src       text not null,
  primary key (league, season, team, division)
);
create table if not exists legacy_wikipedia_hockey_minor.series (
  league      text not null,
  season      integer not null,
  round_name  text not null,
  round_no    smallint,
  winner      text not null,
  loser       text not null,
  winner_wins smallint,
  loser_wins  smallint,
  winner_goals smallint,
  loser_goals  smallint,
  format      text,
  src         text not null,
  primary key (league, season, round_name, winner, loser)
);
create table if not exists legacy_wikipedia_hockey_minor.game (
  league       text not null,
  season       integer not null,
  phase        text not null check (phase in ('regular', 'playoffs')),
  game_date    date not null,
  round_name   text,
  home_team    text not null,
  away_team    text not null,
  home_pts     smallint not null,
  away_pts     smallint not null,
  overtime     boolean not null default false,
  src          text not null,
  game_seq     smallint not null,
  primary key (league, season, phase, game_date, home_team, away_team, game_seq)
);
create index if not exists wikipedia_hockey_minor_game_idx on legacy_wikipedia_hockey_minor.game (league, season, game_date);
create table if not exists legacy_wikipedia_hockey_minor.unparsed (
  league   text not null,
  season   integer not null,
  page     text not null,
  row_text text not null
);
create index if not exists wikipedia_hockey_minor_unparsed_idx on legacy_wikipedia_hockey_minor.unparsed (league, season);

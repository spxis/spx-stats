-- The rival and predecessor hockey leagues from English Wikipedia (CC BY-SA 4.0), parsed by scripts/hockey/season.py into one schema, one league
-- column: the National Hockey Association (nha, 1909-10 to 1916-17), the Pacific Coast Hockey Association (pcha, 1911-12 to 1923-24), the Western
-- Canada Hockey League and its last season as the Western Hockey League (wchl, 1921-22 to 1925-26) and the World Hockey Association (wha, 1972-73 to
-- 1978-79). `season` is the year a season starts in (1909 = 1909-10), as core.season.start_year.
--   * game: the games a season article tabulates (the NHA's and PCHA's regular seasons, the leagues' own playoff games); `counts` is false for a game
--     the article says the league did not count (protested and replayed, played before a club joined); a game against a club of another league is not
--     here (db/build/154 and the loader keep to the league's own games).
--   * standing: the published final standings; `agrees` says whether they equal the games as tabulated (true, false, or null where the article has
--     no results to check against), `note` what the games add up to when they do not.
--   * series: a playoff series told as a result only (WHA brackets, a prose "won the two-game total-goals series 5-3").
-- Add-only, rerunnable. DS1 only: legacy schemas are not published to production.
create schema if not exists legacy_wikipedia_hockey;
comment on schema legacy_wikipedia_hockey is 'NHA, PCHA, WCHL/WHL and WHA seasons from English Wikipedia, as parsed. CC BY-SA 4.0.';

create table if not exists legacy_wikipedia_hockey.season (
  league      text not null check (league in ('nha', 'pcha', 'wchl', 'wha')),
  season      integer not null,
  page_title  text not null,
  teams       smallint not null,
  fetched_on  date not null,
  champion    text,
  champion_basis text,
  primary key (league, season)
);
create table if not exists legacy_wikipedia_hockey.team_season (
  league      text not null,
  season      integer not null,
  team_name   text not null,
  link_title  text,
  primary key (league, season, team_name)
);
create table if not exists legacy_wikipedia_hockey.game (
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
  neutral_site boolean not null default false,
  counts       boolean not null default true,
  note         text,
  src          text not null,
  game_seq     smallint not null,
  primary key (league, season, phase, game_date, home_team, away_team, game_seq)
);
create index if not exists wikipedia_hockey_game_season_idx on legacy_wikipedia_hockey.game (league, season, game_date);
create table if not exists legacy_wikipedia_hockey.standing (
  league    text not null,
  season    integer not null,
  team      text not null,
  division  text not null,
  rank_in_table smallint not null,
  gp smallint, w smallint, l smallint, t smallint, pts smallint,
  gf integer, ga integer,
  agrees    boolean,
  note      text,
  src       text not null,
  primary key (league, season, team, division)
);
create table if not exists legacy_wikipedia_hockey.series (
  league     text not null,
  season     integer not null,
  round_name text not null,
  winner     text not null,
  loser      text not null,
  winner_wins smallint,
  loser_wins  smallint,
  winner_goals smallint,
  loser_goals  smallint,
  format     text,
  src        text not null,
  primary key (league, season, round_name, winner, loser)
);
create table if not exists legacy_wikipedia_hockey.unparsed (
  league   text not null,
  season   integer not null,
  page     text not null,
  row_text text not null
);
create index if not exists wikipedia_hockey_unparsed_idx on legacy_wikipedia_hockey.unparsed (league, season);

-- Stat tables SPX saved as files (CSV/XML), by league. One row per player per
-- table; the table's own column names are kept in stats. No pages are kept.
create schema if not exists legacy_files;
comment on schema legacy_files is 'Statistics SPX saved as files, exactly as saved.';

create table legacy_files.player_season_table (
  league        text not null,          -- nhl, nba, mlb, nfl, cfl
  season        text not null,          -- '2006-07', or '2006' for a calendar-year league
  season_type   text not null,          -- 'regular' or 'playoff'
  table_name    text not null,          -- the saved table, e.g. Forwards, ForwardTOI, Goalies
  player_key    text not null,          -- the league's own player id
  player_name   text,
  team          text not null default '',
  position      text,
  stats         jsonb not null,
  title         text,                   -- the table's own title line
  source_file   text not null,
  _seen_in      text[] not null,
  primary key (league, season, season_type, table_name, player_key, team)
);
comment on table legacy_files.player_season_table is 'A player''s line in one saved season stat table; stats is keyed by the column codes the table printed.';

create table legacy_files.schedule_game (
  league        text not null,
  season        text not null,
  game_date     timestamp not null,
  away_team     text not null,          -- as the file names it (an SPX team id or abbreviation)
  home_team     text not null,
  network       text,
  source_file   text not null,
  _seen_in      text[] not null,
  primary key (league, game_date, away_team, home_team)
);
comment on table legacy_files.schedule_game is 'A game as an SPX schedule file listed it; no result.';

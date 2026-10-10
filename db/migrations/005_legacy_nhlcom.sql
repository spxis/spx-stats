-- NHL.com season stat tables as saved by SPX's NHL.com reader (2000-01 to
-- 2006-07, and the 2007 scrape back to 1900). One row per player per table;
-- the table's own column names are kept in stats. No pages are kept.
create schema if not exists legacy_nhlcom;
comment on schema legacy_nhlcom is 'NHL.com statistics as collected by SPX, exactly as saved.';

create table legacy_nhlcom.player_season_table (
  season        text not null,          -- '2006-07'
  season_type   text not null,          -- 'regular' or 'playoff'
  table_name    text not null,          -- the NHL.com table, e.g. Forwards, ForwardTOI, Goalies
  nhl_player_id bigint not null,
  player_name   text,
  team          text not null default '',
  position      text,
  stats         jsonb not null,
  title         text,                   -- the table's own title line
  source_file   text not null,
  _seen_in      text[] not null,
  primary key (season, season_type, table_name, nhl_player_id, team)
);
comment on table legacy_nhlcom.player_season_table is 'A player''s line in one NHL.com season table; stats is keyed by the column codes NHL.com printed.';

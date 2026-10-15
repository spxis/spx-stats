-- Player statistics tables of NBA club-season articles on English Wikipedia (CC BY-SA 4.0): one row per table row, exactly as the article shows it
-- (the header text and the cell text), read from the rendered "Player statistics" section by scripts/player_stats/nba_wp_parse.py. page_title and
-- revid cite the article revision each row was read from (the same revision legacy_rosters.wp_article holds). core is filled by
-- db/build/181_stats_nba_wikipedia.sql, which reads the cells through db/seed/nba_stat_column.csv. DS1 only (legacy schema, never in production).
-- Add-only; rerunnable.
create schema if not exists legacy_wikipedia_stats;

create table if not exists legacy_wikipedia_stats.nba_article (
  season     smallint not null,               -- first year of the season
  club       text     not null,               -- the club's name that season (core.franchise_identity.full_name), as legacy_rosters.wp_article
  page_title text     not null,
  revid      bigint   not null,
  heading    text,                            -- the statistics heading found (null: the article has none)
  tables     smallint not null default 0,     -- statistics tables read
  primary key (season, club)
);

create table if not exists legacy_wikipedia_stats.nba_line (
  season     smallint not null,
  club       text     not null,
  phase      text     not null check (phase in ('regular', 'playoffs')),
  tbl        smallint not null,               -- which table of that phase in the article (1 first)
  ord        smallint not null,               -- row in the table (1 first)
  name       text     not null,               -- the name as shown
  link_title text,                            -- the article the name links to (null for a name with no article: a red link or plain text)
  cells      jsonb    not null check (jsonb_typeof(cells) = 'object'),   -- header text -> cell text as shown, "" for an empty cell
  primary key (season, club, phase, tbl, ord)
);
create index if not exists wp_nba_line_title_idx on legacy_wikipedia_stats.nba_line (link_title);
comment on table legacy_wikipedia_stats.nba_line is 'NBA player statistics table rows of club-season articles, English Wikipedia, CC BY-SA 4.0. Loaded by scripts/player_stats/nba_wp_load.py.';

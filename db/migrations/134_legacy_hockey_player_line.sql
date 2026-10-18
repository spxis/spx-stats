-- Player statistics lines of the NHA, PCHA, WCHL/WHL and WHA club-season articles on English Wikipedia (CC BY-SA 4.0), as scripts/hockey/roster_articles.py
-- reads them from the articles' player-statistics wikitables (skaters: GP G A Pts PIM +/- PPG SHG GWG; goaltenders: GP MIN W L T GA SO GAA, shots and
-- saves where given). One row per player, club season, phase (regular, playoffs) and table row, with the numbers as the article gives them (text, "gp" ... ).
-- page_title and revid cite the article revision a line was read from. A name's link_title is the article it links to (null: plain text or a name with no
-- article, which is never matched on the name). core.player_season_stat is filled by db/build/181_stats_hockey_wikipedia.sql.
-- Names checked free: legacy_wikipedia_hockey.player_line, legacy_wikipedia_hockey.player_article (db/migrations, DS1, production: none).
-- DS1 only (legacy schema, never in production). Add-only; rerunnable.
create schema if not exists legacy_wikipedia_hockey;

create table if not exists legacy_wikipedia_hockey.player_article (
  league      text not null check (league in ('nha', 'pcha', 'wchl', 'wha')),
  season      integer not null,               -- the year a season starts in (1909 = 1909-10)
  club        text not null,                  -- the club's name that season, as core.franchise_identity.full_name carries it
  page_title  text not null,
  revid       bigint,
  revised_at  timestamptz,
  missing     boolean not null default false, -- no such article on English Wikipedia
  tables      smallint not null default 0,    -- player-statistics tables read
  primary key (league, season, club)
);

create table if not exists legacy_wikipedia_hockey.player_line (
  league      text not null check (league in ('nha', 'pcha', 'wchl', 'wha')),
  season      integer not null,
  club        text not null,
  phase       text not null check (phase in ('regular', 'playoffs')),
  grp         text not null check (grp in ('skater', 'goalie')),
  tbl         smallint not null,              -- which statistics table of the article (0 first)
  ord         smallint not null,              -- row in the table (0 first)
  name        text not null,
  link_title  text,
  pos         text,
  stats       jsonb not null check (jsonb_typeof(stats) = 'object'),   -- key -> the number as published ("3.14"); keys gp g a pts pim pm ppg shg gwg min w l t ga gaa so svp sv sa
  primary key (league, season, club, phase, tbl, ord)
);
create index if not exists wp_hockey_player_line_title_idx on legacy_wikipedia_hockey.player_line (link_title);
comment on table legacy_wikipedia_hockey.player_line is 'NHA, PCHA, WCHL and WHA player statistics lines of club-season articles, English Wikipedia, CC BY-SA 4.0. Loaded by scripts/hockey/roster_articles.py.';

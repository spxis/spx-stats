-- The club leaders (passing, rushing, receiving) that CFL club-season articles on English Wikipedia (CC BY-SA 4.0) carry, as the articles write them
-- (scripts/cfl_leaders/). DS1 only, never on production (the other legacy_* schemas are not there either). Add-only; rerunnable.
create schema if not exists legacy_wikipedia_cfl_leaders;
comment on schema legacy_wikipedia_cfl_leaders is 'Club leaders read from en.wikipedia.org CFL club-season articles (Passing, Rushing, Receiving, Offensive leaders tables). CC BY-SA 4.0.';

-- One row per article read: the revision it was read at (the source key of every line is enwiki:<page_title>@<revid>).
create table if not exists legacy_wikipedia_cfl_leaders.article (
  season      smallint not null,           -- the season's year (a CFL season is one calendar year)
  club        text not null,               -- the club's name as the article's title has it
  page_title  text not null,
  revid       bigint not null,
  revised_at  timestamptz not null,
  fetched_on  date not null,
  tables_read smallint not null,
  lines_read  integer not null,
  primary key (season, club)
);

-- One row per player line of a table, in the article's order. category: passing, rushing, receiving or offence (the BC Lions' "Offensive leaders" table,
-- one row a player with his passing, rushing and receiving yards and touchdowns). stats: the table's figures by key (gp att comp pct yds td int rating avg
-- long rec fum, pass_yds rush_yds rec_yds), as text; null where the article leaves the cell empty or writes N/A. link_title: the article the name links to.
create table if not exists legacy_wikipedia_cfl_leaders.line (
  season     smallint not null,
  club       text not null,
  category   text not null check (category in ('passing', 'rushing', 'receiving', 'offence')),
  ord        smallint not null,
  name       text not null,
  link_title text,
  stats      jsonb not null,
  primary key (season, club, category, ord),
  foreign key (season, club) references legacy_wikipedia_cfl_leaders.article
);

-- The Wikidata item of each linked article (pageprops wikibase_item, redirects followed); looked_up is false for a title the lookup did not reach.
create table if not exists legacy_wikipedia_cfl_leaders.link_title (
  title          text primary key,
  resolved_title text,
  qid            text,
  disambiguation boolean not null default false,
  missing        boolean not null default false,
  looked_up      boolean not null default true
);

-- Whatever the parser left out or could not fit, with the section it came from.
create table if not exists legacy_wikipedia_cfl_leaders.unparsed (
  season  smallint,
  club    text,
  section text not null,
  note    text not null
);

-- The Olympic event articles of English Wikipedia (CC BY-SA 4.0) as the articles write them: one row per article, per race (a heat, a semifinal, the final),
-- per athlete line (scripts/olympics/). DS1 only, never on production (the other legacy_* schemas are not there either). Add-only; rerunnable.
-- Every line is keyed by article (event_key + games_year), round, race number in the round and row order in the table; the lane is a column, because the older
-- articles print none. The source key of every row is enwiki:<page_title>@<revid> (article.page_title, article.revid).
create schema if not exists legacy_wikipedia_olympics;
comment on schema legacy_wikipedia_olympics is 'Olympic event articles read from en.wikipedia.org (results tables and the infobox). CC BY-SA 4.0.';

-- One row per article read. event_key names the event in scripts/olympics/events.py (100m-m, 100m-w ...); qid is the article's Wikidata item (the event);
-- infobox holds the infobox parameters as written (venue, dates, competitors, nations, win_value, gold, silver, bronze and their NOCs).
create table if not exists legacy_wikipedia_olympics.article (
  event_key   text not null,
  games_year  smallint not null,
  page_title  text not null,
  revid       bigint not null,
  revised_at  timestamptz not null,
  fetched_on  date not null,
  qid         text,
  infobox     jsonb not null default '{}',
  primary key (event_key, games_year)
);

-- One row per table the article has under Results. round_code: prelim, heats, round2, repechage, quarterfinals, round3, semifinals, final (round_ord is its order);
-- round_label is the heading as written. place_scope: race (the rank is within this heat) or round (one table for the whole round with a Heat column: the rank is
-- over the round). wind_text is the wind as written (+2.8), wind_ms its number; both null where the article prints none for this race.
create table if not exists legacy_wikipedia_olympics.race (
  event_key   text not null,
  games_year  smallint not null,
  round_ord   smallint not null,
  race_no     smallint not null,
  round_code  text not null check (round_code in ('prelim', 'heats', 'round2', 'repechage', 'quarterfinals', 'round3', 'semifinals', 'final')),
  round_label text not null,
  heat_label  text not null,
  wind_text   text,
  wind_ms     numeric(4, 1),
  section     text not null,
  place_scope text not null check (place_scope in ('race', 'round')),
  primary key (event_key, games_year, round_ord, race_no),
  foreign key (event_key, games_year) references legacy_wikipedia_olympics.article on delete cascade
);

-- One row per athlete line, in the table's order. Numbers are null where the cell is empty, "Unknown", struck or not a plain number; the text is kept beside them.
-- time_s is the electronic (automatic) time where the article gives both, else the only time; time_hand_text/_s the hand time column of 1956-72. marks are the
-- abbreviations of the Notes cell as printed (Q q WR OR NR AR PB SB ...); status is DNS, DNF or DQ where the row says so. cells holds every cell of the row as
-- wikitext, by column number. link_title is the athlete's article (the Wikidata item is in link_title).
create table if not exists legacy_wikipedia_olympics.line (
  event_key      text not null,
  games_year     smallint not null,
  round_ord      smallint not null,
  race_no        smallint not null,
  row_ord        smallint not null,
  lane           smallint,
  place          smallint,
  place_text     text,
  name           text not null,
  link_title     text,
  nation         text,
  nation_text    text,
  reaction_s     numeric(5, 3),
  time_text      text,
  time_s         numeric(7, 3),
  time_hand_text text,
  time_hand_s    numeric(7, 3),
  notes          text,
  marks          text[] not null default '{}',
  status         text check (status in ('DNS', 'DNF', 'DQ', 'NM', 'DNQ', 'ND')),
  cells          jsonb not null,
  primary key (event_key, games_year, round_ord, race_no, row_ord),
  foreign key (event_key, games_year, round_ord, race_no) references legacy_wikipedia_olympics.race on delete cascade
);
create index if not exists line_link_title_idx on legacy_wikipedia_olympics.line (link_title);

-- The Wikidata item of each linked article (pageprops wikibase_item, redirects followed); looked_up is false for a title the lookup did not reach.
create table if not exists legacy_wikipedia_olympics.link_title (
  title          text primary key,
  resolved_title text,
  qid            text,
  disambiguation boolean not null default false,
  missing        boolean not null default false,
  looked_up      boolean not null default true
);

-- Whatever the parser left out or could not fit, with the section it came from.
create table if not exists legacy_wikipedia_olympics.unparsed (
  event_key  text,
  games_year smallint,
  section    text,
  note       text not null
);

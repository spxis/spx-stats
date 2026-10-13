-- A venue for every game (core.game.venue_id), built by db/build/198_home_venue.sql and db/build/199_game_venue.sql.
-- The legacy tables are for the working copy and DS1 only (production has no legacy_* schemas); core.game.venue_id already exists, and
-- core.franchise_home_venue at the end is the one new production table.
--   legacy_retrosheet.park      Retrosheet's park list (parkcode.txt), as published: park id, name, city, state, first and last game.
--                               Retrosheet's notice: "The information used here was obtained free of charge from and is copyrighted by
--                               Retrosheet. Interested parties may contact Retrosheet at www.retrosheet.org."
--                               Loaded by scripts/retrosheet/parks.py.
--   legacy_game_venue.venue     Wikidata (CC0) facts of venues that are not yet in core.venue (neutral sites, grounds abroad, small
--                               old arenas): name, coordinates, capacity, opened, closed, city, ISO 3166-2 region, country. Loaded by
--                               scripts/game_venue/load.py from the files scripts/game_venue/fetch.py saved.
--   legacy_game_venue.filled    The games step 199 gave a venue to, so a rerun can replace its own work (and only its own) without
--                               touching a venue another step set.
create schema if not exists legacy_game_venue;
comment on schema legacy_game_venue is 'Wikidata venue items for games played away from a club''s usual home, and the games db/build/199_game_venue.sql filled.';

create table if not exists legacy_game_venue.venue (
  qid             text primary key,         -- Wikidata item id
  label           text,                     -- English label
  instance_of     text[],                   -- English labels of P31
  wikipedia_title text,                     -- English Wikipedia article
  latitude        numeric(9, 6),            -- P625
  longitude       numeric(9, 6),
  capacity        integer,                  -- P1083, the latest
  opened_on       date,                     -- P1619, else P571; a month or year is its first day
  closed_on       date,                     -- P3999, else P576; a month or year is its last day
  city            text,                     -- the nearest city, town or municipality up the P131 chain
  region          text,                     -- ISO 3166-2 (P300) of the nearest state or province up the chain
  country_code    text,                     -- ISO alpha-2 (P297 of the country)
  chain           jsonb,                    -- [{qid, label, types[]}] up the P131 chain, nearest first, as read
  fetched_on      date not null
);

create table if not exists legacy_game_venue.filled (
  game_id   bigint primary key,
  venue_id  integer not null,               -- the venue step 199 gave it
  basis     text not null,                  -- event, retrosheet, nflverse, nhlapi or home
  was_neutral boolean,                      -- core.game.is_neutral_site, is_international and neutral_site_reason before this step set them
  was_international boolean,
  was_reason text
);

create table if not exists legacy_retrosheet.park (
  park_id   text primary key,               -- e.g. NYC16
  name      text,                           -- a few minor-league parks have none
  aka       text,
  city      text,
  state     text,
  start_on  date,
  end_on    date,
  league    text,
  notes     text
);

-- core.franchise_home_venue: where each club played its home games, one chain of periods with no overlap (db/build/198_home_venue.sql).
-- It reads three sources, best first: db/seed/home_venue.csv (Wikipedia / dated Wikidata, hand-checked), core.franchise_brand and
-- core.franchise_venue, and sets aside venue items that are cities. basis says which one gave the period. About 1,500 rows. The game
-- step 199 uses it to give each home game its venue; the site can use it for a club's venue history.
-- On production: apply this file (the create statements below are add-only), then a data release of core.franchise_home_venue.
create table if not exists core.franchise_home_venue (
  franchise_id  integer not null references core.franchise on delete cascade,
  venue_id      integer not null references core.venue,
  valid_during  daterange not null,
  basis         text not null check (basis in ('seed', 'brand', 'wikidata')),
  source_id     smallint not null references meta.source,
  primary key (franchise_id, valid_during),
  exclude using gist (franchise_id with =, valid_during with &&)
);
comment on table core.franchise_home_venue is 'The venue a club played its home games in, by period: seed (Wikipedia or dated Wikidata, checked), else franchise_brand, else franchise_venue; a city item is never a venue.';

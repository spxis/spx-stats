-- Applied to DS1 on 2026-10-12 as 049_legacy_wikidata_venues, before renumbering to 051 (two agents had both used 049 and 050).
-- Raw venue names and facts as published:Wikidata (CC0) venue items and the "Former names" of each venue's English Wikipedia
-- infobox (CC BY-SA 4.0). For the working copy and DS1 only (production has no legacy_* schemas). Loaded by
-- scripts/wikidata_venues/load.py from the raw files scripts/wikidata_venues/fetch.py saved; read by db/build/193_venue_names.sql.
create schema if not exists legacy_wikidata_venues;
comment on schema legacy_wikidata_venues is 'Home venues of the clubs: Wikidata venue items (names with dates, capacity, opened, owner, surface, roof, address) and Wikipedia infobox former names.';

create table if not exists legacy_wikidata_venues.venue (
  qid              text primary key,         -- Wikidata item id
  label            text,                     -- English label: the name now
  wikipedia_title  text,                     -- English Wikipedia article
  wikipedia_revid  bigint,                   -- the revision the former names were read from
  wikipedia_on     date,                     -- its timestamp
  capacity         integer,
  opened_on        date,
  opened_prec      smallint,                 -- Wikidata time precision: 9 year, 10 month, 11 day
  closed_on        date,
  owner            text,
  surface          text,
  roof             text check (roof in ('open', 'dome', 'retractable')),
  address          text,
  wp_surface       text,                     -- surface and roof from the Wikipedia infobox, used where Wikidata has none
  wp_roof          text check (wp_roof in ('open', 'dome', 'retractable')),
  fetched_on       date not null
);

create table if not exists legacy_wikidata_venues.name (
  qid         text not null references legacy_wikidata_venues.venue,
  name        text not null,
  source      text not null check (source in ('wikidata', 'wikipedia')),
  kind        text not null check (kind in ('official', 'name', 'former')),   -- P1448, P2561, infobox former names
  from_year   smallint,
  until_year  smallint,
  starts_on   date,                      -- Wikidata only, with its precision
  starts_prec smallint,
  ends_on     date,
  ends_prec   smallint,
  raw         text,                      -- the infobox text the Wikipedia row was read from
  primary key (qid, source, kind, name)
);

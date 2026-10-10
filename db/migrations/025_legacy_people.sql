-- The people behind the award winners, as Wikidata (CC0) answers: one row per item, and one row per statement
-- about it. Only the statements we use are kept (name, English article, birth and death with place, citizenship,
-- height, position, playing hand, teams with dates, honours; places also coordinates and country; countries
-- their ISO codes). Nothing about ethnicity, religion, health, sex or gender, family or politics is fetched or
-- stored. The answers as received (minus those statements) are archived in legacy_files.raw_archive under
-- 'people/2026-10-10/'; the fetch and load scripts are scripts/people/. core is filled by db/build/pending/177_people.sql.
create schema if not exists legacy_people;
comment on schema legacy_people is 'Wikidata items of award winners and the places, countries, teams and honours they name. CC0.';

create table legacy_people.item (
  qid          text primary key,          -- 'Q1382032'
  label        text,                      -- English label
  enwiki_title text,                      -- English Wikipedia article, if any
  fetched_on   date not null
);

create table legacy_people.redirect (       -- an item merged into another
  from_qid text primary key,
  to_qid   text not null
);

create table legacy_people.claim (
  qid        text not null,               -- the item the statement is about
  prop       text not null,               -- 'P569'
  n          smallint not null,           -- order among that property's statements
  rank       text,                        -- preferred | normal | deprecated
  value_qid  text,                        -- an item value
  value_on   date,                        -- a time value; value_prec 11 = day, 10 = month, 9 = year
  value_prec smallint,
  value_num  numeric,                     -- a quantity value, with its unit's item in unit_qid
  unit_qid   text,
  value_lat  double precision,            -- a coordinate value
  value_lon  double precision,
  value_text text,                        -- a string value (a country's ISO 3166 code)
  start_on   date, start_prec smallint,   -- qualifier P580 (start time)
  end_on     date, end_prec   smallint,   -- qualifier P582 (end time)
  point_on   date, point_prec smallint,   -- qualifier P585 (point in time)
  primary key (qid, prop, n)
);
create index on legacy_people.claim (prop, value_qid);

create table legacy_people.wikipedia_link (  -- the Wikipedia article an award winner's name links to in the award's article
  award_code  text not null,
  winner_name text not null,
  title       text not null,
  qid         text,                        -- its Wikidata item, once fetched
  primary key (award_code, winner_name)
);

-- Where a person was born, for the map on their page (the place's own coordinates, not an address).
alter table core.person add column if not exists birth_lat double precision;
alter table core.person add column if not exists birth_lon double precision;

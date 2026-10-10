-- Franchise facts as Wikidata (CC0) answered: team items, their dated home
-- venues, headquarters and owners, and the places and venues those point at.
-- core.franchise* and core.venue* are built from these by
-- db/build/176_franchise_info.sql, because core is rebuilt with new franchise ids.
-- Dates keep the precision Wikidata gave (Wikidata codes: 9 year, 10 month, 11 day).
create schema if not exists legacy_franchise_info;
comment on schema legacy_franchise_info is 'Team, venue, place and owner facts from Wikidata (CC0), with the street addresses normalised by @johnmorrisdotca/address-plus.';

create table if not exists legacy_franchise_info.team (
  league_code    text not null,
  qid            text not null,
  label          text,
  inception      date,
  inception_prec smallint,
  dissolved      date,
  dissolved_prec smallint,
  enwiki         text,                 -- English Wikipedia article title
  description    text,
  fetched_on     date not null,
  primary key (league_code, qid)
);

-- Names a team item carries besides its label (P1448 official name with dates, aliases).
create table if not exists legacy_franchise_info.team_name (
  qid       text not null,
  name      text not null,
  kind      text not null check (kind in ('official', 'alias')),
  starts_on date,
  ends_on   date
);
create unique index if not exists team_name_key on legacy_franchise_info.team_name
  (qid, name, kind, coalesce(starts_on, '0001-01-01'), coalesce(ends_on, '9999-12-31'));

-- Home venue (P115), headquarters (P159) and located-in place (P131) of a team, dated.
create table if not exists legacy_franchise_info.team_place (
  qid            text not null,
  kind           text not null check (kind in ('home_venue', 'headquarters', 'located_in')),
  place_qid      text not null,
  starts_on      date,
  starts_prec    smallint,
  ends_on        date,
  ends_prec      smallint,
  rank           text
);
create unique index if not exists team_place_key on legacy_franchise_info.team_place
  (qid, kind, place_qid, coalesce(starts_on, '0001-01-01'), coalesce(ends_on, '9999-12-31'));

-- Owned by (P127): a person or an organisation, dated, with the share (P1107) if given.
create table if not exists legacy_franchise_info.team_owner (
  qid         text not null,
  owner_qid   text not null,
  owner_name  text,
  starts_on   date,
  starts_prec smallint,
  ends_on     date,
  ends_prec   smallint,
  share       numeric,                 -- fraction 0..1
  rank        text
);
create unique index if not exists team_owner_key on legacy_franchise_info.team_owner
  (qid, owner_qid, coalesce(starts_on, '0001-01-01'), coalesce(ends_on, '9999-12-31'));

-- A venue, city, region or country item. Raw address text is kept as Wikidata
-- gave it; the address_* columns are what address-plus made of it.
create table if not exists legacy_franchise_info.place (
  qid             text primary key,
  label           text,
  description     text,
  instance_of     text[],              -- labels of P31
  latitude        numeric(9,6),
  longitude       numeric(9,6),
  address_raw     text,                -- P6375
  postal_raw      text,                -- P281
  capacity        integer,             -- P1083, the latest
  opened_on       date,                -- P1619, else P571
  opened_prec     smallint,
  closed_on       date,                -- P3999, else P576
  closed_prec     smallint,
  time_zone       text,                -- IANA name when the time-zone item carries one
  time_zone_label text,                -- P421 item's label
  surface         text,                -- P765 label(s)
  roof            text check (roof in ('open', 'dome', 'retractable')),
  architect       text,
  cost            numeric,
  cost_unit       text,
  located_in      text,                -- P131 qid, the first
  country_qid     text,                -- P17
  iso_3166_2      text,                -- P300 (regions)
  iso_alpha2      text,                -- P297 (countries)
  chain           jsonb,               -- [{qid,label,types[],iso_3166_2,iso_alpha2}] up the P131 chain, nearest first
  enwiki          text,
  address_street  text,                -- address-plus: "number prefix street type suffix unit"
  address_city    text,
  address_region  text,                -- ISO 3166-2, e.g. US-FL
  address_postal  text,
  address_country text,                -- ISO alpha-2
  address_parsed  boolean,
  fetched_on      date not null
);

-- A venue's name over time: P1448 official name / P2561 name with dates, and aliases.
create table if not exists legacy_franchise_info.place_name (
  qid       text not null,
  name      text not null,
  kind      text not null check (kind in ('official', 'name', 'alias')),
  starts_on date,
  starts_prec smallint,
  ends_on   date,
  ends_prec smallint
);
create unique index if not exists place_name_key on legacy_franchise_info.place_name
  (qid, name, kind, coalesce(starts_on, '0001-01-01'), coalesce(ends_on, '9999-12-31'));

-- Cities (with their ISO 3166-2 region) that the venues and headquarters resolved to;
-- a franchise identity named for one of them, and for only one region, takes that region.
create table if not exists legacy_franchise_info.city_region (
  city         text not null,
  region       text not null,
  country_code text not null,
  qid          text not null,          -- the venue or headquarters the city was read from
  primary key (qid)
);

-- Where Wikidata has no street address for a venue, the "address" line of the venue's
-- English Wikipedia infobox (CC BY-SA 4.0), kept as written.
create table if not exists legacy_franchise_info.place_wikipedia (
  qid         text primary key,
  title       text not null,
  address_raw text,
  fetched_on  date not null
);

-- A venue built from Wikidata is found again on a rebuild by its item id.
alter table core.venue add column if not exists source_key text;
create unique index if not exists venue_source_key on core.venue (source_id, source_key);

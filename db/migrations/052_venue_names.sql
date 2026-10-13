-- Applied to DS1 on 2026-10-12 as 050_venue_names, before renumbering to 052 (two agents had both used 049 and 050).
-- The names a home venue has carried and its basic facts, per Wikidata venue item (the id api.venue_place gives as wikidata_id).
-- core.brand_venue_name: one row per name with the years it applied (from_year, until_year; a year both names shared is the year of the
--   change), filled by db/build/193_venue_names.sql from Wikidata (CC0; official name P1448 and name P2561 with start and end time) and,
--   where Wikidata has no dated names, the "Former names" of the English Wikipedia infobox (CC BY-SA 4.0). is_current marks the name now.
-- core.brand_venue_info: capacity, year opened, owner, surface, roof and street address from the same Wikidata items.
-- About 700 and 300 rows (well under 1 MB). On production they are filled by a data release (AGENTS.md section 8, item 5): tables core.brand_venue_name and core.brand_venue_info.
-- The legacy tables the build reads are migration 051 (working copy and DS1 only).

create table if not exists core.brand_venue_name (
  wikidata_id  text not null,
  name         text not null,
  from_year    smallint,
  until_year   smallint,
  is_current   boolean not null default false,
  source_id    smallint not null references meta.source,
  source_key   text not null,         -- the Wikidata item id, or enwiki:<article title>@<revision id>
  primary key (wikidata_id, name),
  check (from_year is null or until_year is null or from_year <= until_year)
);
comment on table core.brand_venue_name is 'Names of the home venues of core.franchise_brand (api.venue_place.wikidata_id) with the years each applied.';

create table if not exists core.brand_venue_info (
  wikidata_id  text primary key,
  capacity     integer check (capacity > 0),
  opened_year  smallint,
  closed_year  smallint,
  owner        text,
  surface      text,
  roof         text check (roof in ('open', 'dome', 'retractable')),
  address      text,
  source_id    smallint not null references meta.source,
  source_key   text not null,         -- the Wikidata item id
  wikipedia_key    text,              -- enwiki:<article title>@<revision id> when surface or roof come from the infobox
  wikipedia_fields text               -- which of them: surface, roof or surface,roof
);
comment on table core.brand_venue_info is 'Capacity, year opened, owner, surface, roof and street address of the home venues of core.franchise_brand, from Wikidata.';

create or replace view api.venue_name as
select n.wikidata_id, n.name, n.from_year, n.until_year, n.is_current, s.code as source
from core.brand_venue_name n join meta.source s using (source_id);
comment on view api.venue_name is 'Every name of a home venue with the years it applied, and where it came from (wikidata or wikipedia).';
grant select on api.venue_name to anon, authenticated;

create or replace view api.venue_info as
select wikidata_id, capacity, opened_year, closed_year, owner, surface, roof, address from core.brand_venue_info;
comment on view api.venue_info is 'Capacity, year opened, owner, surface, roof and address of a home venue (Wikidata, CC0).';
grant select on api.venue_info to anon, authenticated;

update meta.source set attribution = attribution || ' Venue names and facts (capacity, opened, owner, surface, roof, address) from Wikidata items.'
  where code = 'wikidata' and attribution not like '%Venue names and facts%';
update meta.source set attribution = attribution || ' Former venue names from the infoboxes of English Wikipedia venue articles (CC BY-SA 4.0); text by the articles'' editors, see each article''s history.'
  where code = 'wikipedia' and attribution not like '%Former venue names%';

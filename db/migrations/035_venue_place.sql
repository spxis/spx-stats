-- City, state or province and Wikipedia article of each home venue a club used, for the franchise page's venues table and the
-- venues map. api.team_brand carries only a venue's name and coordinates (home_venue, latitude, longitude).
-- core.brand_venue holds the place facts of those venues, one row per (name, latitude, longitude) as core.franchise_brand has
-- them, so api.venue_place can join on exactly those three. It is a few hundred rows, filled by db/build/176_venue_place.sql
-- from Wikidata (CC0; db/seed/venue_city.csv corrects the cities Wikidata gives as a county or leaves out) and, on production,
-- by the insert-only file scripts/venue_place/to_sql.py prints.

create table if not exists core.brand_venue (
  venue_label   text not null,        -- core.franchise_brand.home_venue
  latitude      numeric(8, 5) not null,
  longitude     numeric(8, 5) not null,
  source_id     smallint not null references meta.source,
  source_key    text not null,        -- the Wikidata item id of the venue
  city          text,
  region        text,                 -- ISO 3166-2, e.g. US-MI, CA-QC
  country_code  text,
  wikipedia_title text,               -- English Wikipedia article title
  primary key (venue_label, latitude, longitude)
);
comment on table core.brand_venue is 'City, region, country and Wikipedia title of the home venues named in core.franchise_brand.';

create or replace view api.venue_place as
select distinct fl.league_code as league, b.franchise_id, v.venue_label as home_venue, v.latitude, v.longitude,
       v.source_key as wikidata_id, v.city, v.region, v.country_code, v.wikipedia_title
from core.brand_venue v
join core.franchise_brand b on b.home_venue = v.venue_label and b.latitude = v.latitude and b.longitude = v.longitude
join core.franchise_league fl on fl.franchise_id = b.franchise_id;
comment on view api.venue_place is 'Per club and home venue, named and placed as in api.team_brand: the venue''s city, ISO 3166-2 region, country, Wikidata id and English Wikipedia title.';
grant select on api.venue_place to anon, authenticated;

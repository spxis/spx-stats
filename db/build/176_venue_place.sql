-- core.brand_venue (migration 035): the city, region, country and English Wikipedia title of every home venue a Wikidata team
-- names, or whose city it is the seat of (legacy_team_brand.team_place, the statements 175_team_brand.sql takes core.franchise_brand's venue name and coordinates from),
-- from Wikidata (CC0). Run from the repo root, as scripts/build_core.sh does.
-- The venue item (legacy_franchise_info.place) gives address_city, address_region (ISO 3166-2), address_country and the sitelink.
-- Wikidata sometimes gives a county or township as the city, or no city at all: db/seed/venue_city.csv names those cities
-- (and a region where Wikidata has none), and a county, township or parish left over is dropped rather than shown as a city.
-- Rerunnable: the table is emptied and filled again.
-- A city is not a venue: a headquarters or located-in item (Miami, Houston, Los Angeles, San Diego ...) gets a row only if a brand row names it, which step 175
-- no longer does (a club item with no home venue takes the seed venues of db/seed/home_venue.csv instead), so no city is left here; the venues those seeds name
-- have no Wikidata team statement, so they are added from their own item (legacy_franchise_info.place, else legacy_game_venue.venue) by the name and coordinates
-- of the brand row. db/checks/063_venue_city.sql must find no city.

drop table if exists pg_temp.seed_city;
create temp table seed_city (wikidata_id text, city text, region text, country_code text);
\copy seed_city from 'db/seed/venue_city.csv' with (format csv, header true)

delete from core.brand_venue;
insert into core.brand_venue (venue_label, latitude, longitude, source_id, source_key, city, region, country_code, wikipedia_title)
select distinct on (tp.label, tp.latitude, tp.longitude)
       tp.label, tp.latitude, tp.longitude, (select source_id from meta.source where code = 'wikidata'), tp.place_qid,
       coalesce(nullif(sc.city, ''),
                case when tp.kind <> 'home_venue' then case when p.description ~* '\m(city|town|borough|village|census)' then tp.label end   -- a city item is its own city
                     when p.address_city !~* ' (county|parish|borough|township)$' then p.address_city end),
       coalesce(nullif(sc.region, ''), p.address_region),
       coalesce(nullif(sc.country_code, ''), split_part(coalesce(nullif(sc.region, ''), p.address_region), '-', 1), p.address_country), p.enwiki
from legacy_team_brand.team_place tp
join legacy_franchise_info.place p on p.qid = tp.place_qid
left join seed_city sc on sc.wikidata_id = tp.place_qid
where tp.label is not null and tp.latitude is not null and tp.longitude is not null and coalesce(tp.rank, '') <> 'deprecated'
  and (tp.kind = 'home_venue' or exists (select 1 from core.franchise_brand b where b.home_venue = tp.label and b.latitude = round(tp.latitude, 5) and b.longitude = round(tp.longitude, 5)))
order by tp.label, tp.latitude, tp.longitude, (tp.kind = 'home_venue') desc, tp.place_qid;

-- the venues of the seed periods step 175 used: no team statement names them, their own item gives the place
insert into core.brand_venue (venue_label, latitude, longitude, source_id, source_key, city, region, country_code, wikipedia_title)
select distinct on (b.home_venue, b.latitude, b.longitude)
       b.home_venue, b.latitude, b.longitude, (select source_id from meta.source where code = 'wikidata'), v.qid,
       coalesce(nullif(sc.city, ''), v.city), coalesce(nullif(sc.region, ''), v.region),
       coalesce(nullif(sc.country_code, ''), split_part(coalesce(nullif(sc.region, ''), v.region), '-', 1), v.country), v.wikipedia_title
from core.franchise_brand b
join (select p.qid, p.label, p.latitude, p.longitude, p.address_city as city, p.address_region as region, p.address_country as country, p.enwiki as wikipedia_title, 1 as rk
      from legacy_franchise_info.place p
      union all select g.qid, g.label, g.latitude, g.longitude, g.city, g.region, g.country_code, g.wikipedia_title, 2 from legacy_game_venue.venue g) v
  on v.label = b.home_venue and round(v.latitude, 5) = b.latitude and round(v.longitude, 5) = b.longitude
left join seed_city sc on sc.wikidata_id = v.qid
where b.home_venue is not null and b.latitude is not null
  and not exists (select 1 from core.brand_venue x where x.venue_label = b.home_venue and x.latitude = b.latitude and x.longitude = b.longitude)
order by b.home_venue, b.latitude, b.longitude, v.rk, v.qid;

select 'brand venues' as what, count(*) from core.brand_venue
union all select 'with city', count(city) from core.brand_venue
union all select 'with region', count(region) from core.brand_venue
union all select 'with wikipedia title', count(wikipedia_title) from core.brand_venue
union all select 'brand stops without a row', count(*) from (select distinct home_venue, latitude, longitude from core.franchise_brand
   where home_venue is not null and latitude is not null) s
   where not exists (select 1 from core.brand_venue v where v.venue_label = s.home_venue and v.latitude = s.latitude and v.longitude = s.longitude);

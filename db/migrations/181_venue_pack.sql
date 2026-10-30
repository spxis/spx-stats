-- Cold reads, part 8. Add-only: one new materialized view. Apply to DS1 first, then production. The site reads it and, while it is
-- missing (a 404), falls back on the three reads it made before, so the site works before and after.
--   api.venue_pack   one row (id 1): api.venue_place, api.venue_info and api.venue_name as columns of short arrays, each in the order the site read its view in
-- Every team page and every season page read api.venue_place (449 rows), api.venue_info (292) and api.venue_name (560) whole: three requests, ~0.27 MB, with
-- the column names written out on every row. This is the same facts in one request of the arrays alone.
-- Precomputed because it reads three views; api.refresh() rebuilds it after a release (it is found from the catalog).

create materialized view api.venue_pack as
with p as (select *, row_number() over (order by league, franchise_id, home_venue, wikidata_id) as n from api.venue_place),
i as (select *, row_number() over (order by wikidata_id) as n from api.venue_info),
v as (select *, row_number() over (order by wikidata_id, from_year nulls first, name) as n from api.venue_name)
select 1 as id,
  coalesce((select array_agg(league order by n) from p), '{}') as place_league,
  coalesce((select array_agg(franchise_id order by n) from p), '{}') as place_franchise_id,
  coalesce((select array_agg(home_venue order by n) from p), '{}') as place_home_venue,
  coalesce((select array_agg(latitude order by n) from p), '{}') as place_latitude,
  coalesce((select array_agg(longitude order by n) from p), '{}') as place_longitude,
  coalesce((select array_agg(city order by n) from p), '{}') as place_city,
  coalesce((select array_agg(region order by n) from p), '{}') as place_region,
  coalesce((select array_agg(country_code order by n) from p), '{}') as place_country_code,
  coalesce((select array_agg(wikipedia_title order by n) from p), '{}') as place_wikipedia_title,
  coalesce((select array_agg(wikidata_id order by n) from p), '{}') as place_wikidata_id,
  coalesce((select array_agg(wikidata_id order by n) from i), '{}') as info_wikidata_id,
  coalesce((select array_agg(capacity order by n) from i), '{}') as info_capacity,
  coalesce((select array_agg(opened_year order by n) from i), '{}') as info_opened_year,
  coalesce((select array_agg(closed_year order by n) from i), '{}') as info_closed_year,
  coalesce((select array_agg(owner order by n) from i), '{}') as info_owner,
  coalesce((select array_agg(surface order by n) from i), '{}') as info_surface,
  coalesce((select array_agg(roof order by n) from i), '{}') as info_roof,
  coalesce((select array_agg(address order by n) from i), '{}') as info_address,
  coalesce((select array_agg(postal_code order by n) from i), '{}') as info_postal_code,
  coalesce((select array_agg(surface_raw order by n) from i), '{}') as info_surface_raw,
  coalesce((select array_agg(status order by n) from i), '{}') as info_status,
  coalesce((select array_agg(wikidata_id order by n) from v), '{}') as name_wikidata_id,
  coalesce((select array_agg(name order by n) from v), '{}') as name_name,
  coalesce((select array_agg(from_year order by n) from v), '{}') as name_from_year,
  coalesce((select array_agg(until_year order by n) from v), '{}') as name_until_year,
  coalesce((select array_agg(is_current order by n) from v), '{}') as name_is_current;
create unique index venue_pack_key on api.venue_pack (id);
comment on materialized view api.venue_pack is
  'One row. place_* are the columns of api.venue_place (ordered by league, franchise_id, home_venue, wikidata_id), info_* those of api.venue_info (by wikidata_id; the site''s columns only) and name_* those of api.venue_name (by wikidata_id, from_year with none first, name; the site''s columns only), each column an array with one entry for each row, in that order. Refreshed by api.refresh() (migration 181).';
analyze api.venue_pack;
grant select on api.venue_pack to anon, authenticated;

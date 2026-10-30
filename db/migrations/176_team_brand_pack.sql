-- Cold reads, part 3 (ticket SPX-812). Add-only: one new materialized view. Apply to DS1 first, then production. The site reads it and, while it is
-- missing (a 404), falls back on the three requests for api.team_brand it made before, so the site works before and after.
--   api.team_brand_pack   one row for each franchise: its logo files once, and its brand eras as short arrays that point into them
-- Every first visit to a page read api.team_brand whole (2,266 rows, three requests, ~0.7 MB) to colour and draw the clubs on the page. The logo address,
-- its licence and its file page are the same long text on every era that shows one logo (947 eras, 310 distinct logos in a franchise), and each row repeated
-- thirteen column names. This is the same facts in 254 rows and one request.
-- Precomputed because it adds up a view; api.refresh() rebuilds it after a release (it is found from the catalog).

create materialized view api.team_brand_pack as
with o as (
  select b.*, row_number() over (
    partition by franchise_id
    order by brand_from nulls first, league, brand_to, logo_url, source, primary_hex, secondary_hex, home_venue, latitude, longitude) as n
  from api.team_brand b),
l as (
  select franchise_id, logo_url, logo_licence, logo_page, min(n) as first_n
  from o where logo_url is not null
  group by franchise_id, logo_url, logo_licence, logo_page),
li as (
  select *, row_number() over (partition by franchise_id order by first_n) - 1 as idx from l),
lg as (
  select franchise_id, jsonb_agg(jsonb_build_array(logo_url, logo_licence, logo_page) order by idx) as logos
  from li group by franchise_id),
e as (
  select o.franchise_id,
         jsonb_agg(jsonb_build_array(o.league, o.brand_from, o.brand_to, o.primary_hex, o.secondary_hex, li.idx, o.source, o.home_venue, o.latitude, o.longitude) order by o.n) as eras
  from o left join li on (li.franchise_id, li.logo_url, li.logo_licence, li.logo_page) is not distinct from (o.franchise_id, o.logo_url, o.logo_licence, o.logo_page) and o.logo_url is not null
  group by o.franchise_id)
select e.franchise_id, coalesce(lg.logos, '[]'::jsonb) as logos, e.eras
from e left join lg using (franchise_id);
create unique index team_brand_pack_key on api.team_brand_pack (franchise_id);
comment on materialized view api.team_brand_pack is
  'The brand eras of a franchise (what api.team_brand lists, row by row, ordered by brand_from with no date first, then league, brand_to, logo, source): logos is each distinct [logo address, licence, file page] once; eras is [league, brand_from, brand_to, primary_hex, secondary_hex, index into logos or null, source, home_venue, latitude, longitude] for each era in that order. Refreshed by api.refresh() (migration 176).';
analyze api.team_brand_pack;
grant select on api.team_brand_pack to anon, authenticated;

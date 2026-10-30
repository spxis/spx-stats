-- Cold reads, part 7 (ticket SPX-812). Add-only: one new materialized view. Apply to DS1 first, then production. The site reads it and, while it is
-- missing (a 404), falls back on the reads it made before, so the site works before and after.
--   api.team_home_city   one row for each club in each league: the city of its latest season
-- The teams list (/teams) shows each club's country and home city, and read the city of every club season (api.team_season_city, 11,696 rows, 12 requests,
-- 2.2 MB) to take the newest of each club. This is that newest row of each club, worked out once: ~700 rows in one request.
-- Precomputed because it reads a view; api.refresh() rebuilds it after a release (it is found from the catalog).

create materialized view api.team_home_city as
select distinct on (league, franchise_id) league, franchise_id, year, city_slug, basis, latitude, longitude, venue_city_slug
from api.team_season_city
order by league, franchise_id, year desc;
create unique index team_home_city_key on api.team_home_city (league, franchise_id);
comment on materialized view api.team_home_city is
  'One row for each club in each league: its newest row of api.team_season_city (year, city_slug, basis, the venue''s latitude and longitude and the venue''s own city), which is where the teams list says the club plays. Refreshed by api.refresh() (migration 180).';
analyze api.team_home_city;
grant select on api.team_home_city to anon, authenticated;

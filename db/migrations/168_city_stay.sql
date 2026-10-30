-- Cold reads, part 2 (ticket SPX-810). Add-only: one new materialized view. Apply to DS1 first, then production. The site reads it and, while it is
-- missing (a 404), falls back on the reads it made before, so the site works before and after.
--   api.city_stay   one row for each club in each city it played in: its seasons there as short arrays, its names, its runs of consecutive seasons
-- The city pages, /cities and the sitemap used to read every placement (api.team_season_city, 12 requests) and every club season (api.team_season_index,
-- 18 requests) to add them up in the server. This is that sum, worked out once: about 3,000 rows in 3 requests.
-- Precomputed because it adds up two views of ~12,000 and ~18,000 rows; api.refresh() rebuilds it after a release (it is found from the catalog).

create materialized view api.city_stay as
with ly as (
  -- every season a league played, in order: a season the league did not play does not break a club's run
  select league, year, dense_rank() over (partition by league order by year) as ord
  from (select distinct league, year from api.team_season_index) y),
mx as (select league, max(year) as newest from api.team_season_index group by league),
j as (
  select s.league, s.franchise_id, p.city_slug, s.year, s.team, s.w, s.l, s.t, s.otl, coalesce(s.champion, false) as champion,
         ly.ord - row_number() over (partition by s.league, s.franchise_id, p.city_slug order by s.year) as island
  from api.team_season_index s
  join api.team_season_city p on p.league = s.league and p.year = s.year and p.franchise_id = s.franchise_id
  join ly on ly.league = s.league and ly.year = s.year),
agg as (
  select league, franchise_id, city_slug, min(year) as first_year, max(year) as last_year,
         coalesce((array_agg(team order by year desc) filter (where coalesce(team, '') <> ''))[1], '') as name,
         jsonb_agg(jsonb_build_array(year, case when champion then 1 else 0 end, coalesce(w, -1), coalesce(l, -1), coalesce(t, 0), coalesce(otl, 0)) order by year) as rows
  from j group by league, franchise_id, city_slug),
runs as (
  select league, franchise_id, city_slug, jsonb_agg(jsonb_build_array(a, b) order by a) as runs
  from (select league, franchise_id, city_slug, island, min(year) as a, max(year) as b from j group by league, franchise_id, city_slug, island) r
  group by league, franchise_id, city_slug),
nm as (
  select league, franchise_id, city_slug, array_agg(team order by first_year) as names
  from (select league, franchise_id, city_slug, team, min(year) as first_year from j where coalesce(team, '') <> '' group by league, franchise_id, city_slug, team) n
  group by league, franchise_id, city_slug),
tt as (
  select j.league, j.franchise_id, j.city_slug, jsonb_agg(coalesce(j.team, a.name) order by j.year) as title_teams
  from j join agg a on (a.league, a.franchise_id, a.city_slug) = (j.league, j.franchise_id, j.city_slug)
  where j.champion
  group by j.league, j.franchise_id, j.city_slug)
select a.league, a.franchise_id, a.city_slug, a.name, coalesce(nm.names, '{}'::text[]) as names, a.first_year, a.last_year,
       (a.last_year = mx.newest) as active, r.runs, a.rows, coalesce(tt.title_teams, '[]'::jsonb) as title_teams
from agg a
join runs r on (r.league, r.franchise_id, r.city_slug) = (a.league, a.franchise_id, a.city_slug)
join mx on mx.league = a.league
left join nm on (nm.league, nm.franchise_id, nm.city_slug) = (a.league, a.franchise_id, a.city_slug)
left join tt on (tt.league, tt.franchise_id, tt.city_slug) = (a.league, a.franchise_id, a.city_slug);
create unique index city_stay_key on api.city_stay (league, franchise_id, city_slug);
comment on materialized view api.city_stay is
  'One row for each club in each city it played in (what the city pages add up from api.team_season_city and api.team_season_index): the name it wore last there, every name in order, the first and last season, whether the league''s newest season is its last here, its runs of consecutive seasons as [from, to] pairs, its seasons as [year, champion 0/1, wins, losses, ties, overtime losses] with -1 for a missing win or loss count, and the club''s name in each title season. Refreshed by api.refresh() (migration 168).';
analyze api.city_stay;
grant select on api.city_stay to anon, authenticated;

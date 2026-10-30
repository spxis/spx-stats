-- Cold reads, part 4 (ticket SPX-812). Add-only: one new materialized view. Apply to DS1 first, then production. The site reads it and, while it is
-- missing (a 404), falls back on the reads it made before, so the site works before and after.
--   api.franchise_name_pack   one row for each club in each league: every name it wore (as api.franchise_names lists them) and its runs of seasons
--                             under one name (as api.team_season_name_run lists them)
-- The address table of the whole site (every team link) read api.franchise_names whole (1,309 rows, two requests) and api.team_season_name_run whole (1,459 rows,
-- two requests); the venue pages and the teams list read the names again. This is the same facts in one request of ~670 short rows.
-- Precomputed because it adds up two views; api.refresh() rebuilds it after a release (it is found from the catalog, after the views it reads).

create materialized view api.franchise_name_pack as
with n as (
  select league, franchise_id,
         jsonb_agg(jsonb_build_array(name, name_from, name_to) order by name_from, name_to, name) as names
  from api.franchise_names
  group by league, franchise_id),
r as (
  select league, franchise_id,
         jsonb_agg(jsonb_build_array(team, from_year, to_year) order by from_year) as runs
  from api.team_season_name_run
  group by league, franchise_id)
select coalesce(n.league, r.league) as league, coalesce(n.franchise_id, r.franchise_id) as franchise_id,
       coalesce(n.names, '[]'::jsonb) as names, coalesce(r.runs, '[]'::jsonb) as runs
from n full join r on (r.league, r.franchise_id) = (n.league, n.franchise_id);
create unique index franchise_name_pack_key on api.franchise_name_pack (league, franchise_id);
comment on materialized view api.franchise_name_pack is
  'For each club in each league: names is every name it wore as [name, name_from, name_to] (ordered by name_from with no date last, then name_to, name; the rows of api.franchise_names); runs is its stretches of consecutive seasons under one name as [team, from_year, to_year] (the rows of api.team_season_name_run). Refreshed by api.refresh() (migration 177).';
analyze api.franchise_name_pack;
grant select on api.franchise_name_pack to anon, authenticated;

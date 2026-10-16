-- Rebuild the two objects that read core.player_season_stat.stats, after migration 117 has packed the column.
-- api.stat_reference is a table filled league by league (migration 120) then swapped in, same columns and numbers
-- as the old materialized view. api.country_franchise is the query from migration 068, with the packed array
-- expanded by core.stats_json. Rerunnable. It does not delete or update core.player_season_stat.
-- Run after 117 and 120, and on production only after the packed rows have been copied back.
-- Needs core.club_season_player (migration 068), core.stat_slot (116) and api.fill_stat_reference (120).

select api.stat_reference_begin();
select api.fill_stat_reference(null);
select api.swap_stat_reference();

drop materialized view if exists api.country_franchise;
create materialized view api.country_franchise as
with pres as (
  select league, franchise_id, country, person_id, team_season_id from core.club_season_player),
everyone as (
  select league, franchise_id, 'all'::text as stat_group, country, count(distinct person_id)::int as players, count(*)::int as seasons, '{}'::jsonb as stats
  from pres group by league, franchise_id, country),
rows_ as (
  select s.league_code as league, ts.franchise_id, coalesce(p.birth_country_code, p.nationality_code, 'ZZ') as country, x.person_id, x.team_season_id, x.stat_group,
         core.stats_json(x.stat_group, x.stats) as stats
  from core.player_season_stat x
  join core.team_season ts using (team_season_id)
  join core.season s using (season_id)
  join core.person p using (person_id)
  where p.kind = 'player' and x.phase = 'regular' and x.is_total is not true and x.stat_group in ('skater', 'goalie', 'batting', 'pitching')),
counts as (
  select league, franchise_id, stat_group, country, count(distinct person_id)::int as players, count(*)::int as seasons
  from rows_ group by league, franchise_id, stat_group, country),
sums as (
  select r.league, r.franchise_id, r.stat_group, r.country, e.key, sum(e.value::numeric) as v
  from rows_ r cross join lateral jsonb_each_text(r.stats) e
  where e.value ~ '^-?[0-9]+(\.[0-9]+)?$'
  group by r.league, r.franchise_id, r.stat_group, r.country, e.key),
packed as (
  select league, franchise_id, stat_group, country, jsonb_object_agg(key, v) as stats
  from sums group by league, franchise_id, stat_group, country)
select * from everyone
union all
select c.league, c.franchise_id, c.stat_group, c.country, c.players, c.seasons, coalesce(p.stats, '{}'::jsonb)
from counts c left join packed p using (league, franchise_id, stat_group, country);
create unique index country_franchise_key on api.country_franchise (league, franchise_id, stat_group, country);
comment on materialized view api.country_franchise is 'Per franchise and country: distinct players and club seasons; stat_group all = everyone on the club, others carry the added-up regular-season counting stats of that group. Refreshed by api.refresh(). Packed stats expanded by core.stats_json (migration 117).';

grant select on api.stat_reference, api.country_franchise to anon, authenticated;
analyze api.stat_reference;
analyze api.country_franchise;

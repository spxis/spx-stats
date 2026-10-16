-- The public roles have no usage on schema core, so core.stats_json (inlined into api.person_stats and
-- api.person_career_totals) failed for anon with "permission denied for schema core" after migration 117.
-- The three readers run as their owner instead, with a fixed search path. They read only core.stat_slot.
alter function core.stat_scaled(int, int) security definer set search_path = pg_catalog;
alter function core.stats_json(text, int4[]) security definer set search_path = pg_catalog;
alter function core.stat_num(text, int4[], text) security definer set search_path = pg_catalog;

-- api.person_career_totals built its rows CTE for every player (it is read twice, so it was materialized) before the
-- person filter, calling core.stats_json 370,000 times per request. NOT MATERIALIZED lets the filter reach the table.
create or replace view api.person_career_totals as
with rows as not materialized (
  select x.person_id, s.league_code as league, x.phase::text as phase, x.stat_group, s.season_id, ts.team_season_id, x.games_played,
         core.stats_json(x.stat_group, x.stats) as stats
  from core.player_season_stat x join core.team_season ts using (team_season_id) join core.season s using (season_id)
  where x.is_total is not true),
sums as (
  select r.person_id, r.league, r.phase, r.stat_group, e.key, sum(e.value::numeric) as v
  from rows r cross join lateral jsonb_each_text(r.stats) e
  where e.value ~ '^-?[0-9]+(\.[0-9]+)?$' and e.key !~ '^(a|p)_'
  group by 1, 2, 3, 4, 5),
agg as (
  select person_id, league, phase, stat_group, jsonb_object_agg(key, v) as stats from sums group by 1, 2, 3, 4),
meta as (
  select person_id, league, phase, stat_group, count(distinct season_id)::int as seasons, count(distinct team_season_id)::int as team_seasons,
         sum(games_played)::int as games_played
  from rows group by 1, 2, 3, 4)
select m.person_id, m.league, m.phase, m.stat_group, m.seasons, m.team_seasons, m.games_played, a.stats
from meta m join agg a using (person_id, league, phase, stat_group);

grant select on api.person_career_totals to anon, authenticated;

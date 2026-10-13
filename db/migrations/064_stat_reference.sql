-- api.stat_reference: what the league looked like in each season, for the player page's league-average line, "rank that season" and percentile
-- radar. One row per league, season, stat group (skater, goalie, batting, pitching), bucket, phase and metric:
--   bucket  'all' (every player of the group) and, for skaters, 'F' (C, LW, RW) and 'D' (by core.person.primary_position; a skater with no
--           position is in 'all' only). Baseball positions are mostly unknown, so a hitter or pitcher is compared with all of them.
--   kind    'rate'  a per-game or ratio figure (goals per game, batting average, ERA ...). Only players who played enough count (a quarter of
--                   the most anyone played that season), so a handful of games cannot top a list. n players, avg of them, q = the 11 values
--                   at 0, 10, 20 ... 100 per cent (a player's percentile is found between them).
--           'total' a season total of everyone (goals, saves, strikeouts ...). n players, top = the 20 highest, best first (a rank is found in it).
-- Hockey's games are "gp", baseball's "g" (so "g" is goals for a skater and games for a hitter or pitcher: each group is read on its own).
-- A player with several clubs in a season is one player: the clubs' rows are added first. Counting numbers come from core.player_season_stat;
-- core.stat_num reads one as a number, or null when it is missing or not a number. The page hides the radar, the league line and the ranks until
-- this view exists. Needs 032. The view is built as stat_reference_new and renamed, so a rerun swaps it in at once and readers never find it
-- missing; api.refresh() refreshes it concurrently (a unique index lets readers keep reading while it does). Rerunnable.
begin;

create or replace function core.stat_num(stats jsonb, k text) returns numeric language sql immutable parallel safe as $$
  select case when stats ->> k ~ '^-?[0-9]+(\.[0-9]+)?$' then (stats ->> k)::numeric end
$$;

drop materialized view if exists api.stat_reference_new;

create materialized view api.stat_reference_new as
with agg as (
  select s.league_code as league, s.start_year as year, x.stat_group, x.phase::text as phase, x.person_id,
         case when x.stat_group <> 'skater' then null when p.primary_position in ('C', 'LW', 'RW', 'F') then 'F' when p.primary_position = 'D' then 'D' end as sub,
         sum(core.stat_num(x.stats, 'gp')) as gp, sum(core.stat_num(x.stats, 'g')) as g, sum(core.stat_num(x.stats, 'a')) as a,
         sum(core.stat_num(x.stats, 'pts')) as pts, sum(core.stat_num(x.stats, 'sog')) as sog, sum(core.stat_num(x.stats, 'pm')) as pm,
         sum(core.stat_num(x.stats, 'w')) as w, sum(core.stat_num(x.stats, 'so')) as so, sum(core.stat_num(x.stats, 'sv')) as sv,
         sum(core.stat_num(x.stats, 'sa')) as sa, sum(core.stat_num(x.stats, 'ga')) as ga, sum(core.stat_num(x.stats, 'toi')) as toi,
         sum(core.stat_num(x.stats, 'ab')) as ab, sum(core.stat_num(x.stats, 'h')) as h, sum(core.stat_num(x.stats, 'hr')) as hr,
         sum(core.stat_num(x.stats, 'rbi')) as rbi, sum(core.stat_num(x.stats, 'r')) as r, sum(core.stat_num(x.stats, 'sb')) as sb,
         sum(core.stat_num(x.stats, 'bb')) as bb, sum(core.stat_num(x.stats, 'hbp')) as hbp, sum(core.stat_num(x.stats, 'sf')) as sf,
         sum(core.stat_num(x.stats, '2b')) as d2, sum(core.stat_num(x.stats, '3b')) as d3,
         sum(core.stat_num(x.stats, 'ipouts')) as ipouts, sum(core.stat_num(x.stats, 'er')) as er
  from core.player_season_stat x
  join core.team_season ts using (team_season_id) join core.season s using (season_id)
  join core.person p using (person_id)
  where x.is_total is not true and x.stat_group in ('skater', 'goalie', 'batting', 'pitching')
  group by 1, 2, 3, 4, 5, 6),
base as (
  select a.*, case stat_group when 'skater' then gp when 'goalie' then gp when 'batting' then ab when 'pitching' then ipouts end as qty
  from agg a),
m as (
  -- skaters: per game
  select league, year, stat_group, phase, sub, person_id, qty, 'g_pg' as metric, 'rate' as kind, g / nullif(gp, 0) as val from base where stat_group = 'skater'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'a_pg', 'rate', a / nullif(gp, 0) from base where stat_group = 'skater'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'pts_pg', 'rate', pts / nullif(gp, 0) from base where stat_group = 'skater'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'sog_pg', 'rate', sog / nullif(gp, 0) from base where stat_group = 'skater'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'pm_pg', 'rate', pm / nullif(gp, 0) from base where stat_group = 'skater'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'g', 'total', g from base where stat_group = 'skater'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'a', 'total', a from base where stat_group = 'skater'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'pts', 'total', pts from base where stat_group = 'skater'
  -- goalies
  union all select league, year, stat_group, phase, sub, person_id, qty, 'svp', 'rate', sv / nullif(sa, 0) from base where stat_group = 'goalie'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'gaa', 'rate', ga * 3600 / nullif(toi, 0) from base where stat_group = 'goalie'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'w_pg', 'rate', w / nullif(gp, 0) from base where stat_group = 'goalie'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'so_pg', 'rate', so / nullif(gp, 0) from base where stat_group = 'goalie'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'w', 'total', w from base where stat_group = 'goalie'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'so', 'total', so from base where stat_group = 'goalie'
  -- hitters
  union all select league, year, stat_group, phase, sub, person_id, qty, 'avg', 'rate', h / nullif(ab, 0) from base where stat_group = 'batting'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'obp', 'rate', (h + coalesce(bb, 0) + coalesce(hbp, 0)) / nullif(ab + coalesce(bb, 0) + coalesce(hbp, 0) + coalesce(sf, 0), 0) from base where stat_group = 'batting'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'slg', 'rate', (h + coalesce(d2, 0) + 2 * coalesce(d3, 0) + 3 * coalesce(hr, 0)) / nullif(ab, 0) from base where stat_group = 'batting'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'hr_pg', 'rate', hr / nullif(g, 0) from base where stat_group = 'batting'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'rbi_pg', 'rate', rbi / nullif(g, 0) from base where stat_group = 'batting'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'r_pg', 'rate', r / nullif(g, 0) from base where stat_group = 'batting'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'sb_pg', 'rate', sb / nullif(g, 0) from base where stat_group = 'batting'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'h', 'total', h from base where stat_group = 'batting'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'hr', 'total', hr from base where stat_group = 'batting'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'rbi', 'total', rbi from base where stat_group = 'batting'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'sb', 'total', sb from base where stat_group = 'batting'
  -- pitchers (innings are outs: 3 to the inning, 27 to the nine)
  union all select league, year, stat_group, phase, sub, person_id, qty, 'era', 'rate', er * 27 / nullif(ipouts, 0) from base where stat_group = 'pitching'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'whip', 'rate', (coalesce(bb, 0) + coalesce(h, 0)) * 3 / nullif(ipouts, 0) from base where stat_group = 'pitching'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'k9', 'rate', so * 27 / nullif(ipouts, 0) from base where stat_group = 'pitching'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'bb9', 'rate', bb * 27 / nullif(ipouts, 0) from base where stat_group = 'pitching'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'hr9', 'rate', hr * 27 / nullif(ipouts, 0) from base where stat_group = 'pitching'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'w', 'total', w from base where stat_group = 'pitching'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'so', 'total', so from base where stat_group = 'pitching'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'sv', 'total', sv from base where stat_group = 'pitching'),
cut as (
  select league, year, stat_group, phase, 0.25 * max(qty) as least from base group by 1, 2, 3, 4),
pick as (
  select m.*, b.bucket
  from m join cut using (league, year, stat_group, phase)
  cross join lateral (values ('all'), (m.sub)) b(bucket)
  where b.bucket is not null and m.val is not null and (m.kind = 'total' or m.qty >= cut.least)),
r as (
  select league, year, stat_group, bucket, phase, metric, kind, count(*)::int as n, avg(val)::float8 as mean,
         percentile_cont(array[0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1]::float8[]) within group (order by val::float8) as q,
         (array_agg(val::float8 order by val desc))[1:20] as top
  from pick group by 1, 2, 3, 4, 5, 6, 7)
select league, year, stat_group, bucket, phase, metric, kind, n,
       case when kind = 'rate' then round(mean::numeric, 4)::real end as avg,
       case when kind = 'rate' then (select array_agg(round(u::numeric, 4)::real order by o) from unnest(q) with ordinality t(u, o)) end as q,
       case when kind = 'total' then (select array_agg(round(u::numeric, 4)::real order by o) from unnest(top) with ordinality t(u, o)) end as top
from r;

create unique index stat_reference_new_key on api.stat_reference_new (league, stat_group, bucket, phase, metric, year);

drop materialized view if exists api.stat_reference;
alter materialized view api.stat_reference_new rename to stat_reference;
alter index api.stat_reference_new_key rename to stat_reference_key;
comment on materialized view api.stat_reference is 'The league around a player, per season: rate metrics as 11 percentile points and an average (players who played enough), total metrics as the 20 best season totals. Refreshed by api.refresh().';

grant select on api.stat_reference to anon, authenticated;

-- api.refresh() (056) with the new view; this one is refreshed concurrently so a reader is never held up.
create or replace function api.refresh() returns void language sql security definer as $$
  refresh materialized view api.season_summary; refresh materialized view api.totals;
  refresh materialized view api.games_by_source; refresh materialized view api.quality;
  refresh materialized view api.player_index;
  refresh materialized view api.team_season_index; refresh materialized view api.standing_index;
  refresh materialized view api.team_index;
  refresh materialized view api.provenance;
  refresh materialized view concurrently api.stat_reference;
$$;
revoke all on function api.refresh() from public;

commit;

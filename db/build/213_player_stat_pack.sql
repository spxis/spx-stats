-- Rebuild the two materialized views that read core.player_season_stat.stats, after migration 117 has packed the column.
-- api.stat_reference is the query from migration 102, and api.country_franchise the one from migration 068, with the packed
-- array expanded (core.stat_num(group, stats, key) and core.stats_json). Same columns, same keys, same numbers.
-- Rerunnable. Drops and rebuilds only these two views. It does not delete or update core.player_season_stat.
-- Run after 117, and on production only after the packed rows have been copied back (an empty table would build empty views).
-- Needs core.club_season_player (migration 068) and core.stat_num(text, int4[], text) (migration 116).

drop materialized view if exists api.stat_reference;
create materialized view api.stat_reference as
with agg as (
  select s.league_code as league, s.start_year as year, x.stat_group, x.phase::text as phase, x.person_id,
         case when x.stat_group <> 'skater' then null when p.primary_position in ('C', 'LW', 'RW', 'F') then 'F' when p.primary_position = 'D' then 'D' end as sub,
         sum(core.stat_num(x.stat_group, x.stats, 'gp')) as gp, sum(core.stat_num(x.stat_group, x.stats, 'g')) as g, sum(core.stat_num(x.stat_group, x.stats, 'a')) as a,
         sum(core.stat_num(x.stat_group, x.stats, 'pts')) as pts, sum(core.stat_num(x.stat_group, x.stats, 'sog')) as sog, sum(core.stat_num(x.stat_group, x.stats, 'pm')) as pm,
         sum(core.stat_num(x.stat_group, x.stats, 'w')) as w, sum(core.stat_num(x.stat_group, x.stats, 'so')) as so, sum(core.stat_num(x.stat_group, x.stats, 'sv')) as sv,
         sum(core.stat_num(x.stat_group, x.stats, 'sa')) as sa, sum(core.stat_num(x.stat_group, x.stats, 'ga')) as ga, sum(core.stat_num(x.stat_group, x.stats, 'toi')) as toi,
         sum(core.stat_num(x.stat_group, x.stats, 'ab')) as ab, sum(core.stat_num(x.stat_group, x.stats, 'h')) as h, sum(core.stat_num(x.stat_group, x.stats, 'hr')) as hr,
         sum(core.stat_num(x.stat_group, x.stats, 'rbi')) as rbi, sum(core.stat_num(x.stat_group, x.stats, 'r')) as r, sum(core.stat_num(x.stat_group, x.stats, 'sb')) as sb,
         sum(core.stat_num(x.stat_group, x.stats, 'bb')) as bb, sum(core.stat_num(x.stat_group, x.stats, 'hbp')) as hbp, sum(core.stat_num(x.stat_group, x.stats, 'sf')) as sf,
         sum(core.stat_num(x.stat_group, x.stats, '2b')) as d2, sum(core.stat_num(x.stat_group, x.stats, '3b')) as d3,
         sum(core.stat_num(x.stat_group, x.stats, 'ipouts')) as ipouts, sum(core.stat_num(x.stat_group, x.stats, 'er')) as er,
         sum(core.stat_num(x.stat_group, x.stats, 'att')) as att, sum(core.stat_num(x.stat_group, x.stats, 'cmp')) as cmp, sum(core.stat_num(x.stat_group, x.stats, 'yds')) as yds,
         sum(core.stat_num(x.stat_group, x.stats, 'td')) as td, sum(core.stat_num(x.stat_group, x.stats, 'int')) as ints, sum(core.stat_num(x.stat_group, x.stats, 'rec')) as rec,
         sum(core.stat_num(x.stat_group, x.stats, 'tkl')) as tkl, sum(core.stat_num(x.stat_group, x.stats, 'ast')) as ast, sum(core.stat_num(x.stat_group, x.stats, 'sck')) as sck,
         sum(core.stat_num(x.stat_group, x.stats, 'pd')) as pd, sum(core.stat_num(x.stat_group, x.stats, 'tfl')) as tfl, sum(core.stat_num(x.stat_group, x.stats, 'fgm')) as fgm,
         sum(core.stat_num(x.stat_group, x.stats, 'fga')) as fga, sum(core.stat_num(x.stat_group, x.stats, 'xpm')) as xpm, sum(core.stat_num(x.stat_group, x.stats, 'xpa')) as xpa,
         sum(core.stat_num(x.stat_group, x.stats, 'punts')) as punts, sum(core.stat_num(x.stat_group, x.stats, 'in20')) as in20, sum(core.stat_num(x.stat_group, x.stats, 'reb')) as reb,
         sum(core.stat_num(x.stat_group, x.stats, 'stl')) as stl, sum(core.stat_num(x.stat_group, x.stats, 'blk')) as blk
  from core.player_season_stat x
  join core.team_season ts using (team_season_id) join core.season s using (season_id)
  join core.person p using (person_id)
  where x.is_total is not true and x.stat_group in ('skater', 'goalie', 'batting', 'pitching', 'basketball', 'passing', 'rushing', 'receiving', 'defense', 'kicking', 'punting')
  group by 1, 2, 3, 4, 5, 6),
base as (
  select a.*, case stat_group when 'skater' then gp when 'goalie' then gp when 'batting' then ab when 'pitching' then ipouts
    when 'basketball' then gp when 'passing' then att when 'rushing' then att when 'receiving' then rec when 'defense' then gp
    when 'kicking' then fga when 'punting' then punts end as qty
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
  union all select league, year, stat_group, phase, sub, person_id, qty, 'sv', 'total', sv from base where stat_group = 'pitching'
  -- basketball (counting numbers; a per-game average the source gave is turned into a total when the line is built, so these are the same everywhere)
  union all select league, year, stat_group, phase, sub, person_id, qty, 'pts_pg', 'rate', pts / nullif(gp, 0) from base where stat_group = 'basketball'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'reb_pg', 'rate', reb / nullif(gp, 0) from base where stat_group = 'basketball'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'ast_pg', 'rate', ast / nullif(gp, 0) from base where stat_group = 'basketball'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'stl_pg', 'rate', stl / nullif(gp, 0) from base where stat_group = 'basketball'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'blk_pg', 'rate', blk / nullif(gp, 0) from base where stat_group = 'basketball'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'pts', 'total', pts from base where stat_group = 'basketball'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'reb', 'total', reb from base where stat_group = 'basketball'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'ast', 'total', ast from base where stat_group = 'basketball'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'stl', 'total', stl from base where stat_group = 'basketball'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'blk', 'total', blk from base where stat_group = 'basketball'
  -- football: passing
  union all select league, year, stat_group, phase, sub, person_id, qty, 'cmp_pct', 'rate', cmp / nullif(att, 0) from base where stat_group = 'passing'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'ypa', 'rate', yds / nullif(att, 0) from base where stat_group = 'passing'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'td_pg', 'rate', td / nullif(gp, 0) from base where stat_group = 'passing'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'yds_pg', 'rate', yds / nullif(gp, 0) from base where stat_group = 'passing'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'int_pg', 'rate', ints / nullif(gp, 0) from base where stat_group = 'passing'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'yds', 'total', yds from base where stat_group = 'passing'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'td', 'total', td from base where stat_group = 'passing'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'cmp', 'total', cmp from base where stat_group = 'passing'
  -- rushing
  union all select league, year, stat_group, phase, sub, person_id, qty, 'ypc', 'rate', yds / nullif(att, 0) from base where stat_group = 'rushing'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'yds_pg', 'rate', yds / nullif(gp, 0) from base where stat_group = 'rushing'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'td_pg', 'rate', td / nullif(gp, 0) from base where stat_group = 'rushing'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'att_pg', 'rate', att / nullif(gp, 0) from base where stat_group = 'rushing'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'yds', 'total', yds from base where stat_group = 'rushing'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'td', 'total', td from base where stat_group = 'rushing'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'att', 'total', att from base where stat_group = 'rushing'
  -- receiving
  union all select league, year, stat_group, phase, sub, person_id, qty, 'ypr', 'rate', yds / nullif(rec, 0) from base where stat_group = 'receiving'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'rec_pg', 'rate', rec / nullif(gp, 0) from base where stat_group = 'receiving'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'yds_pg', 'rate', yds / nullif(gp, 0) from base where stat_group = 'receiving'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'td_pg', 'rate', td / nullif(gp, 0) from base where stat_group = 'receiving'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'yds', 'total', yds from base where stat_group = 'receiving'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'rec', 'total', rec from base where stat_group = 'receiving'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'td', 'total', td from base where stat_group = 'receiving'
  -- defense (combined tackles are solo plus assisted)
  union all select league, year, stat_group, phase, sub, person_id, qty, 'cmb_pg', 'rate', (coalesce(tkl, 0) + coalesce(ast, 0)) / nullif(gp, 0) from base where stat_group = 'defense'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'sck_pg', 'rate', sck / nullif(gp, 0) from base where stat_group = 'defense'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'int_pg', 'rate', ints / nullif(gp, 0) from base where stat_group = 'defense'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'pd_pg', 'rate', pd / nullif(gp, 0) from base where stat_group = 'defense'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'cmb', 'total', case when tkl is null and ast is null then null else coalesce(tkl, 0) + coalesce(ast, 0) end from base where stat_group = 'defense'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'sck', 'total', sck from base where stat_group = 'defense'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'int', 'total', ints from base where stat_group = 'defense'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'pd', 'total', pd from base where stat_group = 'defense'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'tfl', 'total', tfl from base where stat_group = 'defense'
  -- kicking and punting
  union all select league, year, stat_group, phase, sub, person_id, qty, 'fg_pct', 'rate', fgm / nullif(fga, 0) from base where stat_group = 'kicking'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'xp_pct', 'rate', xpm / nullif(xpa, 0) from base where stat_group = 'kicking'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'fgm_pg', 'rate', fgm / nullif(gp, 0) from base where stat_group = 'kicking'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'fgm', 'total', fgm from base where stat_group = 'kicking'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'xpm', 'total', xpm from base where stat_group = 'kicking'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'ypp', 'rate', yds / nullif(punts, 0) from base where stat_group = 'punting'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'in20_pct', 'rate', in20 / nullif(punts, 0) from base where stat_group = 'punting'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'punts_pg', 'rate', punts / nullif(gp, 0) from base where stat_group = 'punting'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'punts', 'total', punts from base where stat_group = 'punting'
  union all select league, year, stat_group, phase, sub, person_id, qty, 'yds', 'total', yds from base where stat_group = 'punting'),
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


create unique index stat_reference_key on api.stat_reference (league, stat_group, bucket, phase, metric, year);
comment on materialized view api.stat_reference is 'The league around a player, per season: rate metrics as 11 percentile points and an average (players who played enough), total metrics as the 20 best season totals. Refreshed by api.refresh(). Packed stats expanded by core.stat_num (migration 117).';

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

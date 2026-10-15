-- api.stat_reference with basketball and football: the league around a player, per season, for the new stat groups (core.player_season_stat rows
-- of db/build/181_stats_nba_wikipedia.sql and 181_stats_nfl_nflverse.sql). Same view, same columns and key as 064, with more metrics:
--   basketball (qty = games)   pts_pg reb_pg ast_pg stl_pg blk_pg (rate) and pts reb ast stl blk (total)
--   passing (qty = attempts)   cmp_pct ypa td_pg yds_pg int_pg (rate); yds td cmp (total)
--   rushing (qty = attempts)   ypc yds_pg td_pg att_pg; yds td att
--   receiving (qty = receptions) ypr rec_pg yds_pg td_pg; yds rec td
--   defense (qty = games)      cmb_pg sck_pg int_pg pd_pg; cmb sck int pd tfl      (cmb = solo plus assisted tackles)
--   kicking (qty = field goals attempted) fg_pct xp_pct fgm_pg; fgm xpm
--   punting (qty = punts)      ypp in20_pct punts_pg; punts yds
-- A season in which a key is absent (nflverse did not record air yards, tackles for loss ...) gives no row for the metrics that need it. Basketball
-- and football players are compared with every player of the group (bucket 'all'); only skaters have the F and D buckets.
-- This is a REBUILD of a materialized view, which the site must not wait for (AGENTS.md section 8; 097): this file builds api.stat_reference_new and
-- its index and nothing else, so it only locks the new view and readers carry on; migration 103 swaps it in. Run the two as separate files, in order,
-- and not while api.refresh() is running. Needs 064, 097 and 101. Rerunnable (it drops and rebuilds only stat_reference_new).
begin;
set local statement_timeout = '30min';

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
         sum(core.stat_num(x.stats, 'ipouts')) as ipouts, sum(core.stat_num(x.stats, 'er')) as er,
         sum(core.stat_num(x.stats, 'att')) as att, sum(core.stat_num(x.stats, 'cmp')) as cmp, sum(core.stat_num(x.stats, 'yds')) as yds,
         sum(core.stat_num(x.stats, 'td')) as td, sum(core.stat_num(x.stats, 'int')) as ints, sum(core.stat_num(x.stats, 'rec')) as rec,
         sum(core.stat_num(x.stats, 'tkl')) as tkl, sum(core.stat_num(x.stats, 'ast')) as ast, sum(core.stat_num(x.stats, 'sck')) as sck,
         sum(core.stat_num(x.stats, 'pd')) as pd, sum(core.stat_num(x.stats, 'tfl')) as tfl, sum(core.stat_num(x.stats, 'fgm')) as fgm,
         sum(core.stat_num(x.stats, 'fga')) as fga, sum(core.stat_num(x.stats, 'xpm')) as xpm, sum(core.stat_num(x.stats, 'xpa')) as xpa,
         sum(core.stat_num(x.stats, 'punts')) as punts, sum(core.stat_num(x.stats, 'in20')) as in20, sum(core.stat_num(x.stats, 'reb')) as reb,
         sum(core.stat_num(x.stats, 'stl')) as stl, sum(core.stat_num(x.stats, 'blk')) as blk
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

create unique index stat_reference_new_key on api.stat_reference_new (league, stat_group, bucket, phase, metric, year);

analyze api.stat_reference_new;
commit;

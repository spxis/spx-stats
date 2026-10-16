-- api.stat_reference as a table filled league by league, then swapped in.
-- The materialized view from 064/102/213 takes well over 60 s on production (Management API and
-- api.refresh_one are cut at about 60 s). Unpacking with core.stats_json once per row was still over 60 s.
-- This file keeps the same columns and numbers. Packed int4[] is read once per row against core.stat_slot
-- (array subscripts, not ~50 core.stat_num calls) and metrics are exploded in one lateral values list.
-- Names checked free on DS1: api.stat_reference_build, api.stat_reference_leagues, api.stat_reference_rows,
-- api.stat_reference_begin, api.fill_stat_reference, api.swap_stat_reference.
-- Needs 097 (refresh_order / refresh_one) and 116 (core.stat_slot). Does not edit 116, 117, 118 or 119.
-- Rerunnable. Does not fill the table: db/build/213 and api.refresh_one do, beside the live object, then swap.

create or replace function api.stat_reference_leagues() returns text[]
language sql immutable parallel safe as $$
  select array['mlb', 'nba', 'nfl', 'nhl']::text[]
$$;

create or replace function api.stat_reference_rows(p_league text)
returns table (
  league text, year smallint, stat_group text, bucket text, phase text, metric text, kind text,
  n integer, avg real, q real[], top real[]
)
language sql stable security definer set search_path = pg_catalog as $$
  with slot as materialized (
    select s.stat_group,
      max(s.ord) filter (where s.key = 'gp') as i_gp, max(s.ord) filter (where s.key = 'g') as i_g,
      max(s.ord) filter (where s.key = 'a') as i_a, max(s.ord) filter (where s.key = 'pts') as i_pts,
      max(s.ord) filter (where s.key = 'sog') as i_sog, max(s.ord) filter (where s.key = 'pm') as i_pm,
      max(s.ord) filter (where s.key = 'w') as i_w, max(s.ord) filter (where s.key = 'so') as i_so,
      max(s.ord) filter (where s.key = 'sv') as i_sv, max(s.ord) filter (where s.key = 'sa') as i_sa,
      max(s.ord) filter (where s.key = 'ga') as i_ga, max(s.ord) filter (where s.key = 'toi') as i_toi,
      max(s.ord) filter (where s.key = 'ab') as i_ab, max(s.ord) filter (where s.key = 'h') as i_h,
      max(s.ord) filter (where s.key = 'hr') as i_hr, max(s.ord) filter (where s.key = 'rbi') as i_rbi,
      max(s.ord) filter (where s.key = 'r') as i_r, max(s.ord) filter (where s.key = 'sb') as i_sb,
      max(s.ord) filter (where s.key = 'bb') as i_bb, max(s.ord) filter (where s.key = 'hbp') as i_hbp,
      max(s.ord) filter (where s.key = 'sf') as i_sf, max(s.ord) filter (where s.key = '2b') as i_2b,
      max(s.ord) filter (where s.key = '3b') as i_3b, max(s.ord) filter (where s.key = 'ipouts') as i_ipouts,
      max(s.ord) filter (where s.key = 'er') as i_er, max(s.ord) filter (where s.key = 'att') as i_att,
      max(s.ord) filter (where s.key = 'cmp') as i_cmp, max(s.ord) filter (where s.key = 'yds') as i_yds,
      max(s.ord) filter (where s.key = 'td') as i_td, max(s.ord) filter (where s.key = 'int') as i_int,
      max(s.ord) filter (where s.key = 'rec') as i_rec, max(s.ord) filter (where s.key = 'tkl') as i_tkl,
      max(s.ord) filter (where s.key = 'ast') as i_ast, max(s.ord) filter (where s.key = 'sck') as i_sck,
      max(s.ord) filter (where s.key = 'pd') as i_pd, max(s.ord) filter (where s.key = 'tfl') as i_tfl,
      max(s.ord) filter (where s.key = 'fgm') as i_fgm, max(s.ord) filter (where s.key = 'fga') as i_fga,
      max(s.ord) filter (where s.key = 'xpm') as i_xpm, max(s.ord) filter (where s.key = 'xpa') as i_xpa,
      max(s.ord) filter (where s.key = 'punts') as i_punts, max(s.ord) filter (where s.key = 'in20') as i_in20,
      max(s.ord) filter (where s.key = 'reb') as i_reb, max(s.ord) filter (where s.key = 'stl') as i_stl,
      max(s.ord) filter (where s.key = 'blk') as i_blk,
      coalesce(max(s.scale) filter (where s.key = 'sck'), 1) as sck_scale
    from core.stat_slot s group by 1),
  agg as materialized (
    select se.league_code as league, se.start_year as year, x.stat_group, x.phase::text as phase, x.person_id,
           case when x.stat_group <> 'skater' then null when p.primary_position in ('C', 'LW', 'RW', 'F') then 'F' when p.primary_position = 'D' then 'D' end as sub,
           sum(x.stats[sl.i_gp]::numeric) as gp, sum(x.stats[sl.i_g]::numeric) as g, sum(x.stats[sl.i_a]::numeric) as a,
           sum(x.stats[sl.i_pts]::numeric) as pts, sum(x.stats[sl.i_sog]::numeric) as sog, sum(x.stats[sl.i_pm]::numeric) as pm,
           sum(x.stats[sl.i_w]::numeric) as w, sum(x.stats[sl.i_so]::numeric) as so, sum(x.stats[sl.i_sv]::numeric) as sv,
           sum(x.stats[sl.i_sa]::numeric) as sa, sum(x.stats[sl.i_ga]::numeric) as ga, sum(x.stats[sl.i_toi]::numeric) as toi,
           sum(x.stats[sl.i_ab]::numeric) as ab, sum(x.stats[sl.i_h]::numeric) as h, sum(x.stats[sl.i_hr]::numeric) as hr,
           sum(x.stats[sl.i_rbi]::numeric) as rbi, sum(x.stats[sl.i_r]::numeric) as r, sum(x.stats[sl.i_sb]::numeric) as sb,
           sum(x.stats[sl.i_bb]::numeric) as bb, sum(x.stats[sl.i_hbp]::numeric) as hbp, sum(x.stats[sl.i_sf]::numeric) as sf,
           sum(x.stats[sl.i_2b]::numeric) as d2, sum(x.stats[sl.i_3b]::numeric) as d3,
           sum(x.stats[sl.i_ipouts]::numeric) as ipouts, sum(x.stats[sl.i_er]::numeric) as er,
           sum(x.stats[sl.i_att]::numeric) as att, sum(x.stats[sl.i_cmp]::numeric) as cmp, sum(x.stats[sl.i_yds]::numeric) as yds,
           sum(x.stats[sl.i_td]::numeric) as td, sum(x.stats[sl.i_int]::numeric) as ints, sum(x.stats[sl.i_rec]::numeric) as rec,
           sum(x.stats[sl.i_tkl]::numeric) as tkl, sum(x.stats[sl.i_ast]::numeric) as ast,
           sum(x.stats[sl.i_sck]::numeric / sl.sck_scale) as sck,
           sum(x.stats[sl.i_pd]::numeric) as pd, sum(x.stats[sl.i_tfl]::numeric) as tfl, sum(x.stats[sl.i_fgm]::numeric) as fgm,
           sum(x.stats[sl.i_fga]::numeric) as fga, sum(x.stats[sl.i_xpm]::numeric) as xpm, sum(x.stats[sl.i_xpa]::numeric) as xpa,
           sum(x.stats[sl.i_punts]::numeric) as punts, sum(x.stats[sl.i_in20]::numeric) as in20, sum(x.stats[sl.i_reb]::numeric) as reb,
           sum(x.stats[sl.i_stl]::numeric) as stl, sum(x.stats[sl.i_blk]::numeric) as blk
    from core.player_season_stat x
    join core.team_season ts on ts.team_season_id = x.team_season_id
    join core.season se on se.season_id = ts.season_id
    join core.person p on p.person_id = x.person_id
    join slot sl on sl.stat_group = x.stat_group
    where x.is_total is not true
      and x.stat_group in ('skater', 'goalie', 'batting', 'pitching', 'basketball', 'passing', 'rushing', 'receiving', 'defense', 'kicking', 'punting')
      and (p_league is null or se.league_code = p_league)
    group by 1, 2, 3, 4, 5, 6),
  base as materialized (
    select a.*, case a.stat_group when 'skater' then a.gp when 'goalie' then a.gp when 'batting' then a.ab when 'pitching' then a.ipouts
      when 'basketball' then a.gp when 'passing' then a.att when 'rushing' then a.att when 'receiving' then a.rec when 'defense' then a.gp
      when 'kicking' then a.fga when 'punting' then a.punts end as qty
    from agg a),
  m as (
    select b.league, b.year, b.stat_group, b.phase, b.sub, b.person_id, b.qty, v.metric, v.kind, v.val
    from base b
    cross join lateral (values
      ('g_pg', 'rate', case when b.stat_group = 'skater' then b.g / nullif(b.gp, 0) end),
      ('a_pg', 'rate', case when b.stat_group = 'skater' then b.a / nullif(b.gp, 0) end),
      ('pts_pg', 'rate', case when b.stat_group = 'skater' then b.pts / nullif(b.gp, 0) end),
      ('sog_pg', 'rate', case when b.stat_group = 'skater' then b.sog / nullif(b.gp, 0) end),
      ('pm_pg', 'rate', case when b.stat_group = 'skater' then b.pm / nullif(b.gp, 0) end),
      ('g', 'total', case when b.stat_group = 'skater' then b.g end),
      ('a', 'total', case when b.stat_group = 'skater' then b.a end),
      ('pts', 'total', case when b.stat_group = 'skater' then b.pts end),
      ('svp', 'rate', case when b.stat_group = 'goalie' then b.sv / nullif(b.sa, 0) end),
      ('gaa', 'rate', case when b.stat_group = 'goalie' then b.ga * 3600 / nullif(b.toi, 0) end),
      ('w_pg', 'rate', case when b.stat_group = 'goalie' then b.w / nullif(b.gp, 0) end),
      ('so_pg', 'rate', case when b.stat_group = 'goalie' then b.so / nullif(b.gp, 0) end),
      ('w', 'total', case when b.stat_group = 'goalie' then b.w end),
      ('so', 'total', case when b.stat_group = 'goalie' then b.so end),
      ('avg', 'rate', case when b.stat_group = 'batting' then b.h / nullif(b.ab, 0) end),
      ('obp', 'rate', case when b.stat_group = 'batting' then (b.h + coalesce(b.bb, 0) + coalesce(b.hbp, 0)) / nullif(b.ab + coalesce(b.bb, 0) + coalesce(b.hbp, 0) + coalesce(b.sf, 0), 0) end),
      ('slg', 'rate', case when b.stat_group = 'batting' then (b.h + coalesce(b.d2, 0) + 2 * coalesce(b.d3, 0) + 3 * coalesce(b.hr, 0)) / nullif(b.ab, 0) end),
      ('hr_pg', 'rate', case when b.stat_group = 'batting' then b.hr / nullif(b.g, 0) end),
      ('rbi_pg', 'rate', case when b.stat_group = 'batting' then b.rbi / nullif(b.g, 0) end),
      ('r_pg', 'rate', case when b.stat_group = 'batting' then b.r / nullif(b.g, 0) end),
      ('sb_pg', 'rate', case when b.stat_group = 'batting' then b.sb / nullif(b.g, 0) end),
      ('h', 'total', case when b.stat_group = 'batting' then b.h end),
      ('hr', 'total', case when b.stat_group = 'batting' then b.hr end),
      ('rbi', 'total', case when b.stat_group = 'batting' then b.rbi end),
      ('sb', 'total', case when b.stat_group = 'batting' then b.sb end),
      ('era', 'rate', case when b.stat_group = 'pitching' then b.er * 27 / nullif(b.ipouts, 0) end),
      ('whip', 'rate', case when b.stat_group = 'pitching' then (coalesce(b.bb, 0) + coalesce(b.h, 0)) * 3 / nullif(b.ipouts, 0) end),
      ('k9', 'rate', case when b.stat_group = 'pitching' then b.so * 27 / nullif(b.ipouts, 0) end),
      ('bb9', 'rate', case when b.stat_group = 'pitching' then b.bb * 27 / nullif(b.ipouts, 0) end),
      ('hr9', 'rate', case when b.stat_group = 'pitching' then b.hr * 27 / nullif(b.ipouts, 0) end),
      ('w', 'total', case when b.stat_group = 'pitching' then b.w end),
      ('so', 'total', case when b.stat_group = 'pitching' then b.so end),
      ('sv', 'total', case when b.stat_group = 'pitching' then b.sv end),
      ('pts_pg', 'rate', case when b.stat_group = 'basketball' then b.pts / nullif(b.gp, 0) end),
      ('reb_pg', 'rate', case when b.stat_group = 'basketball' then b.reb / nullif(b.gp, 0) end),
      ('ast_pg', 'rate', case when b.stat_group = 'basketball' then b.ast / nullif(b.gp, 0) end),
      ('stl_pg', 'rate', case when b.stat_group = 'basketball' then b.stl / nullif(b.gp, 0) end),
      ('blk_pg', 'rate', case when b.stat_group = 'basketball' then b.blk / nullif(b.gp, 0) end),
      ('pts', 'total', case when b.stat_group = 'basketball' then b.pts end),
      ('reb', 'total', case when b.stat_group = 'basketball' then b.reb end),
      ('ast', 'total', case when b.stat_group = 'basketball' then b.ast end),
      ('stl', 'total', case when b.stat_group = 'basketball' then b.stl end),
      ('blk', 'total', case when b.stat_group = 'basketball' then b.blk end),
      ('cmp_pct', 'rate', case when b.stat_group = 'passing' then b.cmp / nullif(b.att, 0) end),
      ('ypa', 'rate', case when b.stat_group = 'passing' then b.yds / nullif(b.att, 0) end),
      ('td_pg', 'rate', case when b.stat_group = 'passing' then b.td / nullif(b.gp, 0) end),
      ('yds_pg', 'rate', case when b.stat_group = 'passing' then b.yds / nullif(b.gp, 0) end),
      ('int_pg', 'rate', case when b.stat_group = 'passing' then b.ints / nullif(b.gp, 0) end),
      ('yds', 'total', case when b.stat_group = 'passing' then b.yds end),
      ('td', 'total', case when b.stat_group = 'passing' then b.td end),
      ('cmp', 'total', case when b.stat_group = 'passing' then b.cmp end),
      ('ypc', 'rate', case when b.stat_group = 'rushing' then b.yds / nullif(b.att, 0) end),
      ('yds_pg', 'rate', case when b.stat_group = 'rushing' then b.yds / nullif(b.gp, 0) end),
      ('td_pg', 'rate', case when b.stat_group = 'rushing' then b.td / nullif(b.gp, 0) end),
      ('att_pg', 'rate', case when b.stat_group = 'rushing' then b.att / nullif(b.gp, 0) end),
      ('yds', 'total', case when b.stat_group = 'rushing' then b.yds end),
      ('td', 'total', case when b.stat_group = 'rushing' then b.td end),
      ('att', 'total', case when b.stat_group = 'rushing' then b.att end),
      ('ypr', 'rate', case when b.stat_group = 'receiving' then b.yds / nullif(b.rec, 0) end),
      ('rec_pg', 'rate', case when b.stat_group = 'receiving' then b.rec / nullif(b.gp, 0) end),
      ('yds_pg', 'rate', case when b.stat_group = 'receiving' then b.yds / nullif(b.gp, 0) end),
      ('td_pg', 'rate', case when b.stat_group = 'receiving' then b.td / nullif(b.gp, 0) end),
      ('yds', 'total', case when b.stat_group = 'receiving' then b.yds end),
      ('rec', 'total', case when b.stat_group = 'receiving' then b.rec end),
      ('td', 'total', case when b.stat_group = 'receiving' then b.td end),
      ('cmb_pg', 'rate', case when b.stat_group = 'defense' then (coalesce(b.tkl, 0) + coalesce(b.ast, 0)) / nullif(b.gp, 0) end),
      ('sck_pg', 'rate', case when b.stat_group = 'defense' then b.sck / nullif(b.gp, 0) end),
      ('int_pg', 'rate', case when b.stat_group = 'defense' then b.ints / nullif(b.gp, 0) end),
      ('pd_pg', 'rate', case when b.stat_group = 'defense' then b.pd / nullif(b.gp, 0) end),
      ('cmb', 'total', case when b.stat_group = 'defense' then case when b.tkl is null and b.ast is null then null else coalesce(b.tkl, 0) + coalesce(b.ast, 0) end end),
      ('sck', 'total', case when b.stat_group = 'defense' then b.sck end),
      ('int', 'total', case when b.stat_group = 'defense' then b.ints end),
      ('pd', 'total', case when b.stat_group = 'defense' then b.pd end),
      ('tfl', 'total', case when b.stat_group = 'defense' then b.tfl end),
      ('fg_pct', 'rate', case when b.stat_group = 'kicking' then b.fgm / nullif(b.fga, 0) end),
      ('xp_pct', 'rate', case when b.stat_group = 'kicking' then b.xpm / nullif(b.xpa, 0) end),
      ('fgm_pg', 'rate', case when b.stat_group = 'kicking' then b.fgm / nullif(b.gp, 0) end),
      ('fgm', 'total', case when b.stat_group = 'kicking' then b.fgm end),
      ('xpm', 'total', case when b.stat_group = 'kicking' then b.xpm end),
      ('ypp', 'rate', case when b.stat_group = 'punting' then b.yds / nullif(b.punts, 0) end),
      ('in20_pct', 'rate', case when b.stat_group = 'punting' then b.in20 / nullif(b.punts, 0) end),
      ('punts_pg', 'rate', case when b.stat_group = 'punting' then b.punts / nullif(b.gp, 0) end),
      ('punts', 'total', case when b.stat_group = 'punting' then b.punts end),
      ('yds', 'total', case when b.stat_group = 'punting' then b.yds end)
    ) v(metric, kind, val)
    where v.val is not null),
  cut as materialized (
    select b.league, b.year, b.stat_group, b.phase, 0.25 * max(b.qty) as least from base b group by 1, 2, 3, 4),
  pick as (
    select m.*, b.bucket
    from m join cut using (league, year, stat_group, phase)
    cross join lateral (values ('all'), (m.sub)) b(bucket)
    where b.bucket is not null and (m.kind = 'total' or m.qty >= cut.least)),
  r as (
    select pick.league, pick.year, pick.stat_group, pick.bucket, pick.phase, pick.metric, pick.kind,
           count(*)::int as n, avg(pick.val)::float8 as mean,
           percentile_cont(array[0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1]::float8[]) within group (order by pick.val::float8) as q,
           (array_agg(pick.val::float8 order by pick.val desc))[1:20] as top
    from pick group by 1, 2, 3, 4, 5, 6, 7)
  select r.league, r.year, r.stat_group, r.bucket, r.phase, r.metric, r.kind, r.n,
         case when r.kind = 'rate' then round(r.mean::numeric, 4)::real end,
         case when r.kind = 'rate' then (select array_agg(round(u::numeric, 4)::real order by o) from unnest(r.q) with ordinality t(u, o)) end,
         case when r.kind = 'total' then (select array_agg(round(u::numeric, 4)::real order by o) from unnest(r.top) with ordinality t(u, o)) end
  from r
$$;

create or replace function api.stat_reference_begin() returns void
language plpgsql security definer set search_path = pg_catalog as $$
begin
  drop table if exists api.stat_reference_build;
  create table api.stat_reference_build (
    league text not null,
    year smallint not null,
    stat_group text not null,
    bucket text not null,
    phase text not null,
    metric text not null,
    kind text not null,
    n integer not null,
    avg real,
    q real[],
    top real[]
  );
  create unique index stat_reference_build_key on api.stat_reference_build (league, stat_group, bucket, phase, metric, year);
end
$$;

create or replace function api.fill_stat_reference(p_league text) returns void
language plpgsql security definer set search_path = pg_catalog as $$
begin
  if to_regclass('api.stat_reference_build') is null then
    raise exception 'api.fill_stat_reference: call api.stat_reference_begin() first';
  end if;
  if p_league is not null then
    if p_league !~ '^[a-z][a-z0-9]*$' then
      raise exception 'api.fill_stat_reference: bad league %', p_league;
    end if;
    delete from api.stat_reference_build where api.stat_reference_build.league = p_league;
  end if;
  insert into api.stat_reference_build
    select * from api.stat_reference_rows(p_league);
end
$$;

-- Build is filled with no lock on the live name. This swap takes ACCESS EXCLUSIVE for milliseconds
-- (rename, drop old, rename index, grant). Refuses an incomplete fill so a failed league does not
-- replace a good live copy. Readers never see an empty or unpopulated object.
create or replace function api.swap_stat_reference() returns void
language plpgsql security definer set search_path = pg_catalog as $$
declare
  live_kind "char";
  missing text;
  old_lock text := current_setting('lock_timeout');
begin
  if to_regclass('api.stat_reference_build') is null then
    raise exception 'api.swap_stat_reference: api.stat_reference_build does not exist';
  end if;
  select string_agg(l, ',' order by l) into missing
  from unnest(api.stat_reference_leagues()) l
  where not exists (select 1 from api.stat_reference_build b where b.league = l);
  if missing is not null then
    raise exception 'api.swap_stat_reference: build is missing league(s) %; not swapping', missing;
  end if;
  select c.relkind into live_kind
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'api' and c.relname = 'stat_reference';
  if live_kind is not null and live_kind not in ('r', 'm') then
    raise exception 'api.swap_stat_reference: api.stat_reference is not a table or materialized view';
  end if;
  perform set_config('lock_timeout', '5s', true);
  if live_kind = 'm' then
    execute 'alter materialized view api.stat_reference rename to stat_reference_old';
  elsif live_kind = 'r' then
    execute 'alter table api.stat_reference rename to stat_reference_old';
  end if;
  execute 'alter table api.stat_reference_build rename to stat_reference';
  if live_kind = 'm' then
    execute 'drop materialized view api.stat_reference_old';
  elsif live_kind = 'r' then
    execute 'drop table api.stat_reference_old';
  end if;
  execute 'alter index api.stat_reference_build_key rename to stat_reference_key';
  execute $c$comment on table api.stat_reference is 'The league around a player, per season: rate metrics as 11 percentile points and an average (players who played enough), total metrics as the 20 best season totals. Table filled league by league (migration 120) and swapped in; api.refresh() / api.refresh_one fill it without a long lock.'$c$;
  execute 'grant select on api.stat_reference to anon, authenticated';
  execute 'analyze api.stat_reference';
  perform set_config('lock_timeout', old_lock, true);
end
$$;

revoke all on function api.stat_reference_leagues() from public, anon, authenticated;
revoke all on function api.stat_reference_rows(text) from public, anon, authenticated;
revoke all on function api.stat_reference_begin() from public, anon, authenticated;
revoke all on function api.fill_stat_reference(text) from public, anon, authenticated;
revoke all on function api.swap_stat_reference() from public, anon, authenticated;
comment on function api.stat_reference_leagues() is 'Leagues api.refresh_one fills into api.stat_reference_build, one statement each.';
comment on function api.stat_reference_rows(text) is 'Rows of api.stat_reference for one league (null = every league). Packed stats read via core.stat_slot.';
comment on function api.stat_reference_begin() is 'Creates an empty api.stat_reference_build for a fill; does not touch the live name.';
comment on function api.fill_stat_reference(text) is 'Inserts one league (or every league when null) into api.stat_reference_build.';
comment on function api.swap_stat_reference() is 'Puts api.stat_reference_build in place of api.stat_reference in one short lock. Refuses an incomplete fill.';

-- Teach api.refresh_order / api.refresh_one to fill this table in pieces (begin, one league, swap)
-- after the materialized views. Other api views still refresh concurrently as in 097.
create or replace function api.refresh_order() returns table (view_name text, mode text, bytes bigint)
language sql stable security definer set search_path = pg_catalog as $$
  with recursive mv as (
    select c.oid, n.nspname, c.relname, c.relispopulated,
           exists (select 1 from pg_index i
                   where i.indrelid = c.oid and i.indisunique and i.indisvalid and i.indislive and i.indimmediate
                     and i.indpred is null and i.indexprs is null) as has_key,
           pg_total_relation_size(c.oid) as sz
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'm' and n.nspname = 'api'),
  dep as (
    select rw.ev_class as mv_oid, d.refobjid as dep_oid
    from pg_rewrite rw join pg_depend d on d.classid = 'pg_rewrite'::regclass and d.objid = rw.oid and d.refobjid <> rw.ev_class
    where d.refclassid = 'pg_class'::regclass),
  reach as (
    select mv_oid as top, dep_oid as oid from dep where mv_oid in (select oid from mv)
    union
    select reach.top, dep.dep_oid from reach join dep on dep.mv_oid = reach.oid),
  views as (
    select format('%I.%I', mv.nspname, mv.relname) as view_name,
           case when mv.has_key and mv.relispopulated then 'concurrently' else 'plain' end as mode,
           mv.sz as bytes, 0 as ord,
           (mv.has_key and mv.relispopulated) as concurrent,
           (select count(*) from reach where reach.top = mv.oid and reach.oid in (select oid from mv)) as deps,
           mv.relname
    from mv),
  extra as (
    select e.view_name, 'fill'::text as mode, 0::bigint as bytes, e.ord
    from (
      select 'api.stat_reference:begin'::text as view_name, 1 as ord
      union all
      select format('api.stat_reference:%s', league), 2
      from unnest(api.stat_reference_leagues()) as league
      union all
      select 'api.stat_reference:swap', 3
    ) e
    where to_regprocedure('api.fill_stat_reference(text)') is not null)
  select s.view_name, s.mode, s.bytes
  from (
    select view_name, mode, bytes, ord, concurrent, deps, relname from views
    union all
    select view_name, mode, bytes, ord, false, 0, view_name from extra
  ) s
  order by s.ord, s.concurrent desc, s.deps, s.bytes, s.relname
$$;

create or replace function api.refresh_one(p_view text) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  o record;
  t0 timestamptz := clock_timestamp();
  old_lock text := current_setting('lock_timeout');
  league text;
begin
  if p_view = 'api.stat_reference' or p_view like 'api.stat_reference:%' then
    begin
      if p_view = 'api.stat_reference' then
        perform api.stat_reference_begin();
        perform api.fill_stat_reference(null);
        perform api.swap_stat_reference();
      elsif p_view = 'api.stat_reference:begin' then
        perform api.stat_reference_begin();
      elsif p_view = 'api.stat_reference:swap' then
        perform api.swap_stat_reference();
      else
        league := substring(p_view from '^api\.stat_reference:(.*)$');
        perform api.fill_stat_reference(league);
      end if;
      return jsonb_build_object('view', p_view, 'mode', 'fill', 'ms', (extract(epoch from clock_timestamp() - t0) * 1000)::int, 'status', 'ok');
    exception when others then
      return jsonb_build_object('view', p_view, 'mode', 'fill', 'ms', (extract(epoch from clock_timestamp() - t0) * 1000)::int,
                                'status', 'failed', 'error', left(sqlerrm, 300));
    end;
  end if;
  select * into o from api.refresh_order() where view_name = p_view;
  if not found then
    raise exception 'api.refresh_one: % is not a materialized view of schema api', p_view;
  end if;
  begin
    perform set_config('lock_timeout', '10s', true);
    execute 'refresh materialized view ' || case when o.mode = 'concurrently' then 'concurrently ' else '' end || o.view_name;
    perform set_config('lock_timeout', old_lock, true);
    return jsonb_build_object('view', o.view_name, 'mode', o.mode, 'ms', (extract(epoch from clock_timestamp() - t0) * 1000)::int, 'status', 'ok');
  exception when others then
    perform set_config('lock_timeout', old_lock, true);
    return jsonb_build_object('view', o.view_name, 'mode', o.mode, 'ms', (extract(epoch from clock_timestamp() - t0) * 1000)::int,
                              'status', 'failed', 'error', left(sqlerrm, 300));
  end;
end
$$;

revoke all on function api.refresh_order() from public, anon, authenticated;
revoke all on function api.refresh_one(text) from public, anon, authenticated;
comment on function api.refresh_order() is 'The materialized views of schema api in refresh order, then api.stat_reference fill steps (begin, one league, swap).';
comment on function api.refresh_one(text) is 'Refreshes one api materialized view concurrently when it has a unique index, or one api.stat_reference fill step; failure is in the result, not raised.';

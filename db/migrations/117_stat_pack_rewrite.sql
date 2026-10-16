-- Rewrite core.player_season_stat.stats from jsonb to int4[] and point the public views at core.stats_json.
-- Needs 116. Does not rebuild api.stat_reference or api.country_franchise: db/build/213 does, after the rows are packed.
--
-- PEAK ON PRODUCTION (measured 2026-10-16: database 458 MB, this table 126 MB heap + 28 MB indexes, 376426 rows).
-- A side-by-side copy does not fit: 458 - 153 + 153 + about 85 = about 543 MB, over the 500 MB cap.
-- Vacuum does not return space to the file. This file refuses that rewrite when the database is under 600 MB
-- and the second copy would pass 480 MB. Production must free the old heap BEFORE this file runs:
--
--   1. Apply 116. No rewrite. Database stays 458 MB.
--   2. Stream the packed rows to a file on the machine running psql (\copy, client side). Do not CREATE TABLE
--      the copy on the database: that would add the new heap while the old 153 MB is still there.
--   3. TRUNCATE core.player_season_stat in its own committed statement. Nothing references this table.
--      Truncate returns the heap and the indexes to the OS. Database about 304 MB (458 - 126 - 28).
--   4. Apply this file. The table is empty, so the type change writes no second copy. Peak stays about 304 MB.
--   5. \copy the 376426 rows back. Indexes grow from empty as the rows land.
--      Peak about 304 + 66 MB heap + 28 MB indexes = 398 MB. Margin about 100 MB under 500.
--   6. Run db/build/213 (rebuilds the two matviews this file drops, about 4 MB). Database ends about 400 MB.
--
-- DS1 is several GB, so this file rewrites in place there. The second copy fits on the NAS. Do not truncate DS1.
-- A scratch database under 480 MB rewrites in place too. Running this file twice is safe: a column that is already
-- int4[] is left alone, and the matviews are dropped only while the column is still jsonb.

do $pack$
declare
  still_jsonb boolean;
  n bigint;
  db bigint;
  heap bigint;
  peak bigint;
begin
  select atttypid = 'jsonb'::regtype into still_jsonb
  from pg_attribute
  where attrelid = 'core.player_season_stat'::regclass and attname = 'stats' and not attisdropped;
  if not still_jsonb then
    raise notice 'core.player_season_stat.stats is already int4[]; left in place';
    return;
  end if;

  select count(*) into n from core.player_season_stat;
  db := pg_database_size(current_database());
  heap := pg_relation_size('core.player_season_stat');
  peak := db + heap / 2;
  if n > 0 and db < 600::bigint * 1024 * 1024 and peak > 480::bigint * 1024 * 1024 then
    raise exception '%', format(
      'refusing to rewrite %s rows in place: peak would be about %s MB and this database is %s MB (cap 500). Export with \copy, truncate core.player_season_stat, commit that, then run this file on the empty table.',
      n, peak / 1024 / 1024, db / 1024 / 1024);
  end if;

  execute 'drop view if exists api.person_career_totals';
  execute 'drop view if exists api.person_stats';
  execute 'drop materialized view if exists api.stat_reference';
  execute 'drop materialized view if exists api.country_franchise';
  execute 'alter table core.player_season_stat drop constraint if exists player_season_stat_stats_check';
  execute $sql$alter table core.player_season_stat
    alter column stats type int4[] using core.stats_pack(stat_group, stats)$sql$;
  execute $sql$comment on column core.player_season_stat.stats is
    'Packed int4[] in core.stat_slot order. A missing category is a null slot, never zero. Readers expand it with core.stats_json. Thousandths for basketball averages and percentages, tenths for sacks.'$sql$;
end
$pack$;

create or replace view api.person_stats as
select x.person_id, s.league_code as league, s.start_year as year, ts.team_season_id, ts.franchise_id,
       api.team_name(ts.team_season_id) as team, x.phase::text as phase, x.stat_group, x.games_played, x.games_started,
       core.stats_json(x.stat_group, x.stats) as stats
from core.player_season_stat x
join core.team_season ts using (team_season_id)
join core.season s using (season_id)
where x.is_total is not true;

create or replace view api.person_career_totals as
with rows as (
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

grant select on api.person_stats, api.person_career_totals to anon, authenticated;

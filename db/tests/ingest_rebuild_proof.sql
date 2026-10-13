-- Proof that the daily results survive a rebuild of core, on the real data of the database it runs in. Run it with
--   bash db/tests/run-rebuild-proof.sh        (one transaction that ends in ROLLBACK; nothing stays)
--
-- 1. take a signature of everything the daily source owns or touched: its own games, the games of other sources it linked to
--    (external id), their verifications and every data issue of the daily source (no timestamps, no ids);
-- 2. simulate what scripts/build_core.sh does to those rows: the daily games, verifications and external ids are deleted, and the
--    other sources' games come back as they were before the daily source filled them in (scheduled, no score, their own date);
-- 3. run the rebuild steps for the daily source: db/build/152 (seasons, team seasons) and db/build/153 (replay of ingest.game_observation);
-- 4. take the signature again. They must be identical.
\set ON_ERROR_STOP on
\o /dev/null
create temp table _p_daily as select source_id from meta.source where code = 'wikipedia_daily';
create function pg_temp.signature() returns text language sql as $$
  select md5(coalesce((
    select string_agg(row(g.source_key, g.status, g.home_score, g.away_score, g.went_to_overtime, g.decided_by_shootout, g.game_date, g.original_date, g.phase, g.is_neutral_site,
                          (select string_agg(v.status || ' ' || coalesce(v.their_value, ''), ',' order by v.status) from meta.verification v
                            where v.entity_kind = 'game' and v.entity_id = g.game_id and v.source_id = (select source_id from _p_daily)),
                          (select string_agg(e.external_key, ',' order by e.external_key) from core.external_id e
                            where e.entity_kind = 'game' and e.entity_id = g.game_id and e.source_id = (select source_id from _p_daily)))::text,
                   ';' order by g.source_id, g.source_key)
    from core.game g
    where g.source_id = (select source_id from _p_daily)
       or exists (select 1 from core.external_id e where e.entity_kind = 'game' and e.entity_id = g.game_id and e.source_id = (select source_id from _p_daily))), '')
  || '#' || coalesce((select string_agg(entity_key || '|' || issue || '|' || coalesce(resolution, '') || '|' || (resolved_at is not null)::text, ';' order by entity_key, issue)
                      from meta.data_issue where source_id = (select source_id from _p_daily)), '')) $$;
create function pg_temp.counts() returns text language sql as $$
  select (select count(*) from core.game where source_id = (select source_id from _p_daily)) || ' own games, '
      || (select count(*) from core.external_id where entity_kind = 'game' and source_id = (select source_id from _p_daily)) || ' external ids, '
      || (select count(*) from meta.verification where entity_kind = 'game' and source_id = (select source_id from _p_daily)) || ' verifications, '
      || (select count(*) from meta.data_issue where source_id = (select source_id from _p_daily)) || ' issues, '
      || (select count(*) from core.game g where g.source_id <> (select source_id from _p_daily) and exists (select 1 from meta.data_issue d where d.source_id = (select source_id from _p_daily) and d.entity_kind = 'game' and d.entity_key = g.source_key and d.issue = 'No result in DS1')) || ' games of other sources filled in' $$;
create temp table _p_before as select pg_temp.signature() as sig, pg_temp.counts() as cnt;

-- (2) the rebuild
create temp table _p_filled as
select g.game_id from core.game g
where g.source_id <> (select source_id from _p_daily)
  and exists (select 1 from meta.data_issue d where d.source_id = (select source_id from _p_daily) and d.entity_kind = 'game' and d.entity_key = g.source_key and d.issue = 'No result in DS1');
update core.game g set status = 'scheduled', home_score = null, away_score = null, went_to_overtime = null, decided_by_shootout = null,
       game_date = coalesce(g.original_date, g.game_date), original_date = null
where g.game_id in (select game_id from _p_filled);
delete from meta.verification where entity_kind = 'game' and source_id = (select source_id from _p_daily)
  and entity_id in (select game_id from core.game g where g.source_id = (select source_id from _p_daily) or g.game_id in (select game_id from _p_filled)
                    or exists (select 1 from core.external_id e where e.entity_kind = 'game' and e.entity_id = g.game_id and e.source_id = (select source_id from _p_daily)));
delete from core.external_id where entity_kind = 'game' and source_id = (select source_id from _p_daily);
delete from core.game where source_id = (select source_id from _p_daily);
create temp table _p_mid as select pg_temp.counts() as cnt;

-- (3) the rebuild steps of the daily source (their own begin/commit lines are removed by the runner)
\i :steps_152
\i :steps_153
create temp table _p_after as select pg_temp.signature() as sig, pg_temp.counts() as cnt;
\o
\echo
\echo '== Rebuild proof =='
select 'before the rebuild' as moment, cnt from _p_before union all select 'after deleting', cnt from _p_mid union all select 'after 152 + 153', cnt from _p_after;
select case when (select sig from _p_before) = (select sig from _p_after) then 'RESULT: IDENTICAL end state after the rebuild (signature ' || (select sig from _p_after) || ')' else 'RESULT: DIFFERENT end state after the rebuild' end as result;
rollback;

-- Apply the log of reported game results (ingest.game_observation, migration 044) again, in order, to the games core now holds.
-- Runs after 152. A rebuild of core (scripts/build_core.sh) deletes every game, verification and external id; the observations
-- are not part of core, so this step brings the daily results back through the same state machine that applied them the first time:
-- games the bulk path would have added are made, then each observation moves its game as it did live. Safe to rerun (a second pass
-- changes nothing). The log is also what a second database (production) would be fed from.
begin;
set local client_min_messages = warning;
do $$
declare res jsonb;
begin
  if to_regprocedure('ingest.replay(boolean,boolean)') is null then
    raise notice '153: migration 044 is not applied here; nothing to replay';
    return;
  end if;
  -- rows that point at games a rebuild deleted
  delete from meta.verification v where v.entity_kind = 'game' and v.source_id = ingest.daily_source()
    and not exists (select 1 from core.game g where g.game_id = v.entity_id);
  delete from core.external_id e where e.entity_kind = 'game' and e.source_id = ingest.daily_source()
    and not exists (select 1 from core.game g where g.game_id = e.entity_id);
  res := ingest.replay(true, false);
  raise notice '153: replayed % observations, % games made, % games changed, outcomes %', res ->> 'replayed', res ->> 'games_made', res ->> 'games_changed', res -> 'outcomes';
end $$;
select 'replayed observations' as "daily replay", count(*) as n from ingest.game_observation where outcome is not null;
commit;

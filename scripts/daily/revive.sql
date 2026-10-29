-- Before the report: a game_ref that scripts/daily/retire.sql retired and that is listed again for real is taken off ingest.game_retired, and the latest
-- observation of its chain is marked as not applied, so the report applies it again (a repeat of an observation that has an outcome is not applied) and the
-- bulk step makes the game when no game is there. "Listed again for real": a club's article lists it, or it has a result, a postponement or a cancellation, or
-- its date is less than 3 days past. A game only a second source lists as scheduled, 3 or more days after its date, stays retired (balldontlie keeps an
-- unplayed game scheduled for good; retire.sql would delete it again every day).
-- Needs the temp table sg0 (db/build/152) and psql variable :league. Nothing happens when no retired game_ref is listed (the usual case).
with back as (
  delete from ingest.game_retired r
  where r.game_ref in (select s.source_key from sg0 s
                       where (:'league' = '' or s.league = :'league')
                         and (s.status <> 'scheduled' or s.game_date > current_date - 3 or exists (select 1 from unnest(s.sources) x where x like 'wp:%')))
  returning r.game_ref
)
update ingest.game_observation o set outcome = null, outcome_detail = null, game_id = null, applied_at = null
where o.observation_id in (select max(x.observation_id) from ingest.game_observation x where x.game_ref in (select game_ref from back) group by x.game_ref);

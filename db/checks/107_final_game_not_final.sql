-- what: a game whose newest reported result is a final (ingest.game_observation, not disputed, applied) but whose status in core is not final: a rerun of a build step took it back. Fix: apply db/build/153 (replays the log); final is terminal
-- baseline: 0
-- needs migrations 044, 114 and 162 (ingest.game_observation, ingest.daily_source, ingest.game_retired) on DS1. Run it after ANY step that writes core.game (145, 150, ...): the step puts the game back to scheduled, 153 restores it, this proves it.
-- The log is the reference that survives a rerun: core.game is rewritten by the steps, the log is not. A game is found as ingest.match_game does (pass 0): its source_key, else the external id of the daily source.
with newest as (
  select distinct on (game_ref) game_ref, observation_id, league, season, game_date, status, verdict, outcome
  from ingest.game_observation
  order by game_ref, observation_id desc
)
select o.game_ref, o.league, o.season, o.game_date, g.game_id, g.status::text as core_status, o.observation_id
from newest o
join core.season s on s.league_code = o.league and s.start_year = o.season
join core.game g on g.season_id = s.season_id
 and ((g.source_id = ingest.daily_source() and g.source_key = o.game_ref)
      or exists (select 1 from core.external_id e where e.source_id = ingest.daily_source() and e.entity_kind = 'game' and e.entity_id = g.game_id and e.external_key = o.game_ref))
where o.status = 'final' and o.verdict <> 'disputed' and o.outcome in ('applied', 'confirmed', 'unchanged')
  and g.status::text not in ('final', 'forfeit')
  and not exists (select 1 from ingest.game_retired r where r.game_ref = o.game_ref)
order by o.league, o.game_date, o.game_ref

-- Cold reads, part 2 (ticket SPX-810). Add-only: one index and two new materialized views. Apply to DS1 first, then production. The site reads each new view
-- and, while it is missing (a 404), falls back on the view it read before, so the site works before and after. No existing object changes.
--   core.soccer_tournament_team (team_id)   index: api.soccer_teams counts each team's tournaments with a subquery that had no index to use
--   api.soccer_team_record_index            materialized: api.soccer_team_records, worked out once
--   api.mls_alltime_index                   materialized: api.mls_alltime, worked out once
-- Each statement finishes in well under a second on a scratch copy at full volume. The flat cost of api.soccer_team_matches is its own file (173).

-- api.soccer_teams ran 180 ms on DS1 for 96 teams: for each team a scan of the 12,000 rows of core.soccer_tournament_team (its key starts with the tournament).
create index if not exists soccer_tournament_team_team_idx on core.soccer_tournament_team (team_id);
analyze core.soccer_tournament_team;

-- api.soccer_team_records (600-730 ms) and api.mls_alltime (120 ms) add up every match of every team (88,000 rows) on each read, and the site
-- reads all their rows. Precomputed like api.team_season_index (migration 036); api.refresh() rebuilds both after a release. Made only where the views exist.
do $$
begin
  if to_regclass('api.soccer_team_records') is not null then
    execute 'create materialized view if not exists api.soccer_team_record_index as select team_id, league, tournaments, played, won, drawn, lost, goals_for, goals_against from api.soccer_team_records';
    execute 'create unique index if not exists soccer_team_record_index_key on api.soccer_team_record_index (team_id, league)';
    execute $v$ comment on materialized view api.soccer_team_record_index is 'api.soccer_team_records worked out once (migration 171). Refreshed by api.refresh().' $v$;
    execute 'analyze api.soccer_team_record_index';
    execute 'grant select on api.soccer_team_record_index to anon, authenticated';
  end if;
  if to_regclass('api.mls_alltime') is not null then
    execute 'create materialized view if not exists api.mls_alltime_index as select team_id, seasons, played, won, drawn, lost, goals_for, goals_against, points from api.mls_alltime';
    execute 'create unique index if not exists mls_alltime_index_key on api.mls_alltime_index (team_id)';
    execute $v$ comment on materialized view api.mls_alltime_index is 'api.mls_alltime worked out once (migration 171). Refreshed by api.refresh().' $v$;
    execute 'analyze api.mls_alltime_index';
    execute 'grant select on api.mls_alltime_index to anon, authenticated';
  end if;
end $$;


-- api.team_season_index and api.standing_index (migration 036) are worked out from the games and team seasons, so they are refreshed after those are rebuilt. Rerunnable.
-- Refresh with `concurrently` (readers carry on; needs the unique indexes of migration 097), never a plain refresh or a drop + create in place.
-- To change a definition: api.<name>_new, then api.swap_matview() (AGENTS.md section 8, "Changing a materialized view").
refresh materialized view concurrently api.team_season_index;
refresh materialized view concurrently api.standing_index;
analyze api.team_season_index;
analyze api.standing_index;

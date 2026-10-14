-- The players index (api.player_index, migration 034) is worked out from core.person, the rosters, the stats and the awards,
-- so it is refreshed last, after everything above has been rebuilt. Rerunnable.
-- Refresh with `concurrently` (readers carry on; needs the unique index of migration 097). Never a plain refresh, and never drop + create in
-- place: both lock every read of the view for the whole rebuild (4 minutes for this one on 2026-10-13). To change its definition, build
-- api.player_index_new beside it, index it, and api.swap_matview() it (AGENTS.md section 8, "Changing a materialized view").
refresh materialized view concurrently api.player_index;
analyze api.player_index;

-- The players index (api.player_index, migration 034) is worked out from core.person, the rosters, the stats and the awards,
-- so it is refreshed last, after everything above has been rebuilt. Rerunnable.
refresh materialized view api.player_index;
analyze api.player_index;

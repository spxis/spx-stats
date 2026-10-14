-- The teams index (api.team_index, migration 037) is worked out from api.team_season_index and the franchise names, so it is refreshed after both (191 above). Rerunnable.
-- Refresh with `concurrently` (readers carry on), never a plain refresh or a drop + create in place; see 190 and AGENTS.md section 8.
refresh materialized view concurrently api.team_index;
analyze api.team_index;

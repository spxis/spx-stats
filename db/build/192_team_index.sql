-- The teams index (api.team_index, migration 037) is worked out from api.team_season_index and the franchise names, so it is refreshed after both (191 above). Rerunnable.
refresh materialized view api.team_index;
analyze api.team_index;

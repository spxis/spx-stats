-- api.team_season_index and api.standing_index (migration 036) are worked out from the games and team seasons, so they are refreshed after those are rebuilt. Rerunnable.
refresh materialized view api.team_season_index;
refresh materialized view api.standing_index;
analyze api.team_season_index;
analyze api.standing_index;

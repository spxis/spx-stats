-- what: games whose team seasons are missing or belong to another season
-- baseline: 0
select g.game_id, g.season_id, g.home_team_season_id, g.away_team_season_id
from core.game g
left join core.team_season h on h.team_season_id = g.home_team_season_id
left join core.team_season a on a.team_season_id = g.away_team_season_id
where h.team_season_id is null or a.team_season_id is null
   or h.season_id <> g.season_id or a.season_id <> g.season_id

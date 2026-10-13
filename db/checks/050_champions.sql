-- what: championship awards with no team season, or a team season from another season
-- baseline: 97
select w.award_winner_id, w.season_id, w.winner_name
from core.award_winner w
join core.award a using (award_id)
left join core.team_season t on t.team_season_id = w.team_season_id
where a.kind = 'championship' and (w.team_season_id is null or t.season_id <> w.season_id)

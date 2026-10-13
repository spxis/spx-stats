-- what: final NBA games that ended level (basketball has no ties), and any negative score
-- baseline: 3
select g.game_id, g.game_date, g.home_score, g.away_score
from core.game g join core.season s using (season_id)
where g.status = 'final'
  and ((s.league_code = 'nba' and g.home_score = g.away_score) or g.home_score < 0 or g.away_score < 0)

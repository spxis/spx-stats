-- what: an MLB game held twice: a Retrosheet game and an SPX game of the same two clubs, season, phase and final score, the SPX one with no Retrosheet link (a game suspended or postponed and played on another day than SPX dated it); step 140 merges them
-- baseline: 0
select r.game_id as retrosheet_game_id, s.game_id as spx_game_id, r.game_date as retrosheet_date, s.game_date as spx_date, r.home_score, r.away_score
from core.game r
join core.game s on s.season_id = r.season_id and s.phase = r.phase and s.status = 'final'
  and s.home_team_season_id = r.home_team_season_id and s.away_team_season_id = r.away_team_season_id
  and s.home_score = r.home_score and s.away_score = r.away_score and s.source_id <> r.source_id
join core.season se on se.season_id = r.season_id and se.league_code = 'mlb'
where r.source_id = (select source_id from meta.source where code = 'retrosheet') and r.status = 'final'
  and not exists (select 1 from core.external_id e where e.entity_kind = 'game' and e.entity_id = s.game_id and e.source_id = r.source_id)
order by r.game_id, s.game_id

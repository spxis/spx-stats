-- what: finished seasons (playoff games all played, none left to play) with no championship winner: step 165 (champions) was not run after the load
-- baseline: 1
select s.season_id, s.league_code, s.start_year
from core.season s
where exists (select 1 from core.game g where g.season_id = s.season_id and g.phase = 'playoffs' and g.status = 'final')
  and not exists (select 1 from core.game g where g.season_id = s.season_id and g.status in ('scheduled', 'in_progress'))
  and not exists (select 1 from core.award_winner w join core.award a using (award_id) where w.season_id = s.season_id and a.kind = 'championship')

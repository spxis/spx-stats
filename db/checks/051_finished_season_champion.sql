-- what: finished seasons (playoff games all played, none left to play) with no championship winner: step 165 (champions) was not run after the load
-- baseline: 1
select s.season_id, s.league_code, s.start_year
from core.season s
where exists (select 1 from core.game g where g.season_id = s.season_id and g.phase = 'playoffs' and g.status = 'final')
  and not exists (select 1 from core.game g where g.season_id = s.season_id and g.status in ('scheduled', 'in_progress'))
  -- a season whose last playoff game was in the last 10 days may still be waiting for its final to be loaded
  and (select max(g.game_date) from core.game g where g.season_id = s.season_id and g.phase = 'playoffs') < current_date - 10
  -- a season whose last playoff game is a semifinal has no final in the archive yet (WNBA 2026: the Finals began after the last
  -- article was read): step 165 skips it the same way, so it is not finished
  and coalesce((select g.round_label from core.game g where g.season_id = s.season_id and g.phase = 'playoffs' and g.status <> 'cancelled'
                order by g.game_date desc, g.game_id desc limit 1), '') !~* 'semi'
  and not exists (select 1 from core.award_winner w join core.award a using (award_id) where w.season_id = s.season_id and a.kind = 'championship')

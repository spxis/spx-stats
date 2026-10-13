-- what: seasons whose api.season_summary row is missing its games or its champion (the view is materialised: refresh it after a load)
-- baseline: 0
select s.season_id, s.league_code, s.start_year
from core.season s
left join api.season_summary m on m.league = s.league_code and m.year = s.start_year
where (select count(*) from core.game g where g.season_id = s.season_id and g.phase = 'regular' and g.status <> 'cancelled') is distinct from coalesce(m.games, 0)
   or (exists (select 1 from core.award_winner w join core.award a using (award_id) where w.season_id = s.season_id and a.kind = 'championship') and m.champion is null)

-- what: rows that point at a person, team season, award or season that does not exist
-- baseline: 0
select 'roster_stint' as tbl, r.roster_stint_id::text as id
from core.roster_stint r
where not exists (select 1 from core.person p where p.person_id = r.person_id)
   or not exists (select 1 from core.team_season t where t.team_season_id = r.team_season_id)
union all
select 'player_season_stat', s.person_id::text || '/' || s.team_season_id::text
from core.player_season_stat s
where not exists (select 1 from core.person p where p.person_id = s.person_id)
   or not exists (select 1 from core.team_season t where t.team_season_id = s.team_season_id)
union all
select 'standing', s.team_season_id::text || '/' || s.phase::text || '/' || s.as_of::text
from core.standing s
where not exists (select 1 from core.team_season t where t.team_season_id = s.team_season_id)
union all
select 'award_winner', w.award_winner_id::text
from core.award_winner w
where not exists (select 1 from core.award a where a.award_id = w.award_id)
   or not exists (select 1 from core.season s where s.season_id = w.season_id)
   or (w.team_season_id is not null and not exists (select 1 from core.team_season t where t.team_season_id = w.team_season_id))
   or (w.person_id is not null and not exists (select 1 from core.person p where p.person_id = w.person_id))
union all
select 'person_career', c.person_id::text
from core.person_career c
where not exists (select 1 from core.person p where p.person_id = c.person_id)

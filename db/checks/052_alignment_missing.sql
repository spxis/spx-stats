-- what: team seasons with no conference where the league had conferences that year, or no division where other clubs of that season have one: step 178 (alignment) was not run after the load
-- baseline: 54
select t.team_season_id, s.league_code, s.start_year,
       (t.conference_id is null) as no_conference, (t.division_id is null) as no_division
from core.team_season t
join core.season s using (season_id)
where (t.conference_id is null
       and exists (select 1 from core.conference c where c.league_code = s.league_code and s.start_year between c.first_season and coalesce(c.last_season, 32767))
       and exists (select 1 from core.team_season o where o.season_id = t.season_id and o.conference_id is not null))
   or (t.division_id is null
       and exists (select 1 from core.team_season o where o.season_id = t.season_id and o.division_id is not null))

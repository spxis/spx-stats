-- what: clubs (a league and a franchise) with no country: none of their team seasons is in core.team_season_city or core.team_season_country, so the teams list shows an empty country; step 197 (cities) was not run after a load, or a club's name and identity name no city and no country
-- baseline: 0
-- needs migration 138 and db/build/197 on DS1.
select s.league_code, t.franchise_id, min(s.start_year) as first_year, max(s.start_year) as last_year, count(*) as seasons
from core.team_season t
join core.season s using (season_id)
left join core.team_season_city c on c.team_season_id = t.team_season_id
left join core.team_season_country k on k.team_season_id = t.team_season_id
group by s.league_code, t.franchise_id
having count(c.team_season_id) + count(k.team_season_id) = 0
order by s.league_code, t.franchise_id

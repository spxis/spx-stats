-- what: a club with a team season in the newest NHL, NBA, MLB, NFL or CFL season whose franchise identity or league membership does not cover today (a build step closed a current club at the end of the last season it read; the daily job then finds no club name and loads nothing)
-- baseline: 0
select s.league_code, s.start_year, t.franchise_id, t.team_season_id,
       not exists (select 1 from core.franchise_identity i where i.franchise_id = t.franchise_id and i.valid_during @> current_date) as no_identity,
       not exists (select 1 from core.franchise_league l where l.franchise_id = t.franchise_id and l.league_code = s.league_code and l.valid_during @> current_date) as no_membership
from core.team_season t
join core.season s using (season_id)
where s.league_code in ('nhl', 'nba', 'mlb', 'nfl', 'cfl')
  and s.start_year = (select max(s2.start_year) from core.season s2 join core.team_season t2 using (season_id) where s2.league_code = s.league_code)
  and (not exists (select 1 from core.franchise_identity i where i.franchise_id = t.franchise_id and i.valid_during @> current_date)
       or not exists (select 1 from core.franchise_league l where l.franchise_id = t.franchise_id and l.league_code = s.league_code and l.valid_during @> current_date))
order by s.league_code, t.franchise_id

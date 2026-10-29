-- what: minor-league team seasons whose parent NHL franchise is not an NHL franchise that season, or whose parent identity does not carry the abbreviation the source printed (db/build/232 resolves a code only to a franchise that does)
-- baseline: 0
select a.team_season_id, s.league_code, s.start_year, a.position, a.label, a.parent_franchise_id
from core.team_season_affiliation a
join core.team_season ts using (team_season_id)
join core.season s using (season_id)
where a.parent_franchise_id is not null
  and (a.parent_league_code is null
       or not exists (select 1 from core.franchise_league l
                      where l.franchise_id = a.parent_franchise_id and l.league_code = a.parent_league_code and l.valid_during @> make_date(s.start_year, 11, 15))
       or not exists (select 1 from core.franchise_identity i
                      where i.franchise_id = a.parent_franchise_id and i.abbreviation = a.label and i.valid_during @> make_date(s.start_year, 11, 15)));

-- The players listed on a club's season (core.roster_stint, role 'player'), one row per player, for the roster table of leagues whose
-- statistics are not loaded (NBA, NFL, CFL: db/build/179 and 181). Read with team_season_id=eq.N. A player holding two stints for one team
-- season (two sources) is one row. Position codes are the person's (core.person.primary_position, positions: ref.position codes); country is
-- the birth country, else the nationality, as api.player_index.country. Add-only; rerunnable.
create or replace view api.team_season_roster as
select distinct on (rs.team_season_id, rs.person_id)
       rs.team_season_id, p.person_id, p.full_name as name, p.primary_position as position, p.positions,
       coalesce(p.birth_country_code, p.nationality_code) as country, rs.jersey_number, rs.status
from core.roster_stint rs
join core.person p using (person_id)
where rs.role = 'player'
order by rs.team_season_id, rs.person_id, (rs.jersey_number is null), rs.roster_stint_id;

comment on view api.team_season_roster is 'The players on a club''s season roster: name, position codes, country, jersey number and roster status. Read with team_season_id=eq.N.';
grant select on api.team_season_roster to anon, authenticated;

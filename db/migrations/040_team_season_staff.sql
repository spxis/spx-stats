-- The head coaches (managers in MLB), captains and alternate captains of a club's season, for the team-season page.
-- Rows live in core.roster_stint (role 'head_coach', or captaincy 'C' / 'A'); several coaches in one season mean a change during it,
-- and first_on / last_on hold the dates where the source has games (Retrosheet, nflverse). kind 'player' means a player page exists.
create or replace view api.team_season_staff as
select r.team_season_id,
       s.league_code as league,
       s.start_year as year,
       ts.franchise_id,
       case when r.role = 'head_coach' then 'head_coach' when r.captaincy = 'C' then 'captain' else 'alternate_captain' end as role,
       r.person_id,
       p.full_name as name,
       p.kind,
       lower(r.valid_during) as first_on,
       upper(r.valid_during) - 1 as last_on,
       src.code as source,
       row_number() over (partition by r.team_season_id order by r.role = 'head_coach' desc, r.captaincy, lower(r.valid_during) nulls first, r.roster_stint_id) as ord
from core.roster_stint r
join core.team_season ts using (team_season_id)
join core.season s using (season_id)
join core.person p using (person_id)
left join meta.source src on src.source_id = r.source_id
where r.role = 'head_coach' or r.captaincy is not null;

grant select on api.team_season_staff to anon, authenticated;

-- The public API for people: read-only views over core.person, core.roster_stint and core.award_winner.
-- Filled by db/build/pending/177_people.sql. A page for one person asks each view with person_id=eq.N.
--   api.people          one row per person, with counts worked out from their awards and teams
--   api.person_awards   the awards a person won
--   api.person_teams    the teams a person played for, one row per unbroken run of seasons
--   api.team_awards     what a franchise won, and what its players won while on it
-- championship_count: titles won by a team the person was on the roster of that season (roster_stint x the
-- league's championship). It is only as complete as the roster rows we hold: people who are not award winners
-- have none yet.

create or replace view api.people as
select p.person_id, p.full_name as name, p.kind, p.birth_date, p.death_date, p.birth_place, p.birth_country_code, p.birth_lat, p.birth_lon,
       p.nationality_code, p.height_cm, p.primary_position as position, p.hall_of_fame_year, p.debut_on as debut, p.final_game_on as final,
       (select count(*)::int from core.award_winner w join core.award a using (award_id)
         where w.person_id = p.person_id and a.kind = 'person_award') as award_count,
       (select count(distinct (c.season_id, c.team_season_id))::int
          from core.roster_stint rs join core.award_winner c on c.team_season_id = rs.team_season_id
          join core.award a on a.award_id = c.award_id and a.kind = 'championship'
         where rs.person_id = p.person_id and rs.role = 'player') as championship_count,
       (select count(distinct ts.season_id)::int from core.roster_stint rs join core.team_season ts using (team_season_id)
         where rs.person_id = p.person_id and rs.role = 'player') as seasons_played,
       (select min(s.start_year) from core.roster_stint rs join core.team_season ts using (team_season_id) join core.season s using (season_id)
         where rs.person_id = p.person_id and rs.role = 'player') as first_season,
       (select max(s.start_year) from core.roster_stint rs join core.team_season ts using (team_season_id) join core.season s using (season_id)
         where rs.person_id = p.person_id and rs.role = 'player') as last_season,
       (select array_agg(distinct l order by l) from (
          select s.league_code as l from core.roster_stint rs join core.team_season ts using (team_season_id) join core.season s using (season_id) where rs.person_id = p.person_id
          union select s.league_code from core.award_winner w join core.season s using (season_id) where w.person_id = p.person_id) x) as leagues
from core.person p;

create or replace view api.person_awards as
select w.person_id, s.league_code as league, s.start_year as year, a.name as award, a.code as award_code, a.kind::text as kind, w.note,
       api.team_name(w.team_season_id) as team, ts.franchise_id, src.code as source
from core.award_winner w join core.award a using (award_id) join core.season s using (season_id)
join meta.source src on src.source_id = w.source_id
left join core.team_season ts on ts.team_season_id = w.team_season_id
where w.person_id is not null;

-- One row per unbroken run of seasons with a franchise (a gap of a season starts a new row).
create or replace view api.person_teams as
with st as (
  select distinct rs.person_id, s.league_code as league, ts.franchise_id, s.start_year as y
  from core.roster_stint rs join core.team_season ts using (team_season_id) join core.season s using (season_id)
  where rs.role = 'player'),
runs as (
  select person_id, league, franchise_id, min(y) as from_year, max(y) as to_year
  from (select st.*, y - dense_rank() over (partition by person_id, franchise_id order by y) as grp from st) g
  group by person_id, league, franchise_id, grp)
select r.person_id, r.league, r.franchise_id,
       (select api.team_name(ts.team_season_id) from core.team_season ts join core.season s using (season_id)
         where ts.franchise_id = r.franchise_id and s.league_code = r.league and s.start_year = r.to_year) as team,
       r.from_year, r.to_year
from runs r;

-- Awards a franchise won (championships, team awards), and awards its players won in a season they were on its roster
-- or that were recorded against the team. One row per award, season, franchise and winner.
create or replace view api.team_awards as
select distinct on (u.award_code, u.year, u.franchise_id, case when u.kind = 'person_award' then coalesce(u.person_id::text, u.winner) else 'team' end)
       u.league, u.franchise_id, u.year, u.award, u.winner, u.person_id, u.kind, u.award_code
from (
  select s.league_code as league, ts.franchise_id, s.start_year as year, a.name as award, a.code as award_code, a.kind::text as kind,
         w.winner_name as winner, w.person_id, (w.person_id is not null) as linked
  from core.award_winner w join core.award a using (award_id) join core.season s on s.season_id = w.season_id
  join core.team_season ts on ts.team_season_id = w.team_season_id
  union all
  select s.league_code, ts.franchise_id, s.start_year, a.name, a.code, a.kind::text, w.winner_name, w.person_id, true
  from core.award_winner w join core.award a using (award_id) join core.season s on s.season_id = w.season_id
  join core.roster_stint rs on rs.person_id = w.person_id and rs.role = 'player'
  join core.team_season ts on ts.team_season_id = rs.team_season_id and ts.season_id = w.season_id
  where a.kind = 'person_award') u
order by u.award_code, u.year, u.franchise_id, case when u.kind = 'person_award' then coalesce(u.person_id::text, u.winner) else 'team' end, u.linked desc;

-- The season page links each winner who is a person: appended at the end, so existing readers are unchanged.
create or replace view api.awards as
select s.league_code as league, s.start_year as year, a.code as award_code, a.name as award, a.kind::text as kind,
       w.winner_name as winner, w.note, src.code as source,
       (select franchise_id from core.team_season where team_season_id = w.team_season_id) as franchise_id,
       w.person_id
from core.award_winner w join core.award a using (award_id) join core.season s using (season_id) join meta.source src on src.source_id = w.source_id;

grant select on api.people, api.person_awards, api.person_teams, api.team_awards, api.awards to anon, authenticated;

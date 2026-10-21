-- People with several careers, phase 2 (docs/person-roles.md): front-office and assistant-coach stints, and the playoff record of a head coach.
--  * core.roster_stint already takes the roles 'coach' (assistants, job title in `position`) and 'general_manager'; 'president' is added.
--  * core.coach_playoff_record: the playoff games and series of the club seasons a person was head coach, derived by db/build/189 from core.game and
--    the head_coach stints. A game is his when his stint holds the game date, else when he was the club's only head coach that season, else when he was
--    the last of dated stints. A season with several undated coaches has no row (who coached the playoffs is not known).
--  * api.person_staff and api.coach_playoff_record: what the person page reads. Both are empty until the build steps have run and a release has carried them.
-- Names checked free in db/migrations and on production (core.coach_playoff_record, api.person_staff, api.coach_playoff_record).
-- Add-only for production: the role check is replaced by a wider one (every existing row passes), no data changes.

alter table core.roster_stint drop constraint if exists roster_stint_role_check;
alter table core.roster_stint add constraint roster_stint_role_check
  check (role in ('player', 'head_coach', 'coach', 'manager', 'general_manager', 'president')) not valid;
alter table core.roster_stint validate constraint roster_stint_role_check;

create table if not exists core.coach_playoff_record (
  person_id       bigint   not null references core.person,
  team_season_id  integer  not null references core.team_season,
  games           smallint not null,
  w               smallint not null,
  l               smallint not null,
  t               smallint not null default 0,
  series_w        smallint not null default 0,
  series_l        smallint not null default 0,
  basis           text     not null check (basis in ('sole', 'dated')),
  primary key (person_id, team_season_id)
);
comment on table core.coach_playoff_record is
  'Playoff games and series of a club season for the person who was its head coach (db/build/189). basis: sole = the only head coach of the season; dated = chosen by the dates of the stints. Only games the archive holds; a series is counted for the coach of its last game.';
create index if not exists coach_playoff_record_ts_idx on core.coach_playoff_record (team_season_id);

-- Non-head-coach staff and the front office of a club's season: assistants, general managers, presidents.
create or replace view api.person_staff as
select r.person_id,
       r.team_season_id,
       s.league_code as league,
       s.start_year as year,
       ts.franchise_id,
       r.role,
       r.position,
       lower(r.valid_during) as first_on,
       upper(r.valid_during) - 1 as last_on,
       src.code as source
from core.roster_stint r
join core.team_season ts using (team_season_id)
join core.season s using (season_id)
left join meta.source src on src.source_id = r.source_id
where r.role in ('coach', 'general_manager', 'president');

create or replace view api.coach_playoff_record as
select c.person_id,
       c.team_season_id,
       s.league_code as league,
       s.start_year as year,
       ts.franchise_id,
       c.games, c.w, c.l, c.t, c.series_w, c.series_l, c.basis
from core.coach_playoff_record c
join core.team_season ts using (team_season_id)
join core.season s using (season_id);

grant select on api.person_staff, api.coach_playoff_record to anon, authenticated;

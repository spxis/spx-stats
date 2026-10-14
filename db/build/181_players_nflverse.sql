-- NFL players by team season from nflverse's season rosters (legacy_nflverse.roster, migration 094; CC BY 4.0; scripts/rosters/nflverse_*.py):
-- core.person and core.roster_stint (source nflverse). Rerunnable, and safe after scripts/build_core.sh has rebuilt franchises and team seasons:
-- every key it uses is stable. Run after 150 and 151 (the NFL team seasons) and before 184, 185 and 186.
--  * A club is the franchise of the nflverse team code in that season (db/seed/nflverse_roster_team.csv: ARZ, BLT, SL, RAI and the other
--    codes of earlier years), found through the franchise keys step 150 wrote (core.external_id, entity_kind 'franchise', source nflverse, 'team:<code>').
--    A season we hold no team season for (before 1972) places nothing.
--  * A person is keyed by the NFL's player id as nflverse publishes it (gsis_id) in core.external_id (entity_kind 'person', source nflverse).
--    Seasons before the ids (and rows without one) are the same player as a row with an id when name (accents ignored) and birth date are the same;
--    a row with neither an id nor a birth date is not used. Other sites' ids (ESPN, Pro Football Reference and the rest) are not stored.
--  * A person nflverse has not met is matched to an existing record only when both the name (accents ignored) and the birth date are the same, that
--    record has an NFL season (a roster, a team award) and is the only one that fits; otherwise a new person is made. Further duplicates are
--    for db/build/185_person_merge.sql, which merges only with a confirming fact.
--  * A roster_stint is one player on one team in one season (role 'player', source nflverse): the position code of ref.position (the finer depth-chart
--    position where the roster's position is only a group; a value the list has no code for stays empty), jersey number (0 before 2023 means unknown),
--    weight in kg, and nflverse's status (ACT active, RES reserve/injured, CUT released, DEV practice squad and so on). A pair another step already placed
--    is not written again.
--  * The person's height, weight and college are those of the latest season; empty fields of an existing person are filled, nothing is overwritten.
-- Provenance: the nflverse id is the key; nothing is written in free text.
begin;

update meta.source set
  attribution = attribution || ' Season rosters from nflverse-data (github.com/nflverse/nflverse-data, release "rosters"), CC BY 4.0.',
  notes = coalesce(notes, '') || ' Season rosters (roster_<season>.csv, 1920-2026) fetched 2026-10-14 without other sites'' player ids; archived in legacy_files.raw_archive under nflverse_rosters/.'
where code = 'nflverse' and attribution not like '%Season rosters from nflverse-data%';
create temp table nsrc on commit drop as select source_id from meta.source where code = 'nflverse';

drop table if exists pg_temp.seed_team;
create temp table seed_team (code text, from_season int, to_season int, target text);
\copy seed_team from 'db/seed/nflverse_roster_team.csv' with (format csv, header true)

delete from core.roster_stint where source_id = (select source_id from nsrc);

-- ---- 1. Roster rows with their team season ------------------------------------------------------------------------------------------
create temp table r0 on commit drop as
select rr.*, core.fold_text(rr.full_name) as fn, t.target
from legacy_nflverse.roster rr left join seed_team t on t.code = rr.team and rr.season between t.from_season and t.to_season;

create temp table r on commit drop as
select r0.*, ts.team_season_id
from r0
join core.external_id x on x.entity_kind = 'franchise' and x.source_id = (select source_id from nsrc) and x.external_key = 'team:' || r0.target
join core.season s on s.league_code = 'nfl' and s.start_year = r0.season
join core.team_season ts on ts.season_id = s.season_id and ts.franchise_id = x.entity_id;

-- the player behind each row: the id, else the id another season of the same name and birth date carries, else name and birth date
create temp table rk on commit drop as
select r.*, k.key
from (select r.*, coalesce(r.gsis_id, case when r.birth_date is not null then max(r.gsis_id) over (partition by r.fn, r.birth_date) end) as gid from r) r
cross join lateral (select coalesce(r.gid, case when r.birth_date is not null then 'np:' || r.fn || ':' || r.birth_date end) as key) k
where k.key is not null;
create index on rk (key);

-- position code: the finer position where the roster's own is a group
create temp table rp on commit drop as
select rk.*, (select a.code from ref.position_alias a
              where a.source_code = 'nflverse' and a.league_code = 'nfl' and a.ord = 1
                and a.raw_value = lower(case when rk.position in ('DB', 'DL', 'LB', 'OL', 'SPEC') or rk.position is null then coalesce(nullif(rk.depth_position, ''), rk.position) else rk.position end)) as pos_code
from rk;

-- ---- 2. People ----------------------------------------------------------------------------------------------------------------------
create temp table pl on commit drop as
select distinct on (key) key, full_name, first_name, last_name, birth_date, fn, height_in, weight_lb,
       (select (array_agg(x.college order by x.season desc, x.row_no desc) filter (where x.college is not null and x.college <> ''))[1] from rk x where x.key = rk.key) as college
from rk order by key, season desc, row_no desc;

create temp table nfl_person on commit drop as
select p.person_id, core.fold_text(p.full_name) as fn, p.birth_date from core.person p
where p.birth_date is not null
  and (exists (select 1 from core.roster_stint rs join core.team_season ts using (team_season_id) join core.season s using (season_id)
                where rs.person_id = p.person_id and s.league_code = 'nfl' and rs.source_id <> (select source_id from nsrc))
       or exists (select 1 from core.award_winner w join core.season s using (season_id) where w.person_id = p.person_id and s.league_code = 'nfl'));
create index on nfl_person (fn, birth_date);

create temp table pp on commit drop as
select pl.*, coalesce(x.entity_id, m.person_id, nextval(pg_get_serial_sequence('core.person', 'person_id'))) as person_id,
       (x.entity_id is not null) as keyed, (m.person_id is not null) as matched
from pl
left join core.external_id x on x.entity_kind = 'person' and x.source_id = (select source_id from nsrc) and x.external_key = pl.key
left join lateral (
  select min(np.person_id) as person_id from nfl_person np
  where x.entity_id is null and pl.birth_date is not null and np.fn = pl.fn and np.birth_date = pl.birth_date
  having count(*) = 1
     and not exists (select 1 from core.external_id k where k.entity_kind = 'person' and k.entity_id = min(np.person_id)
                       and k.source_id = (select source_id from nsrc) and k.external_key <> pl.key)) m on true;

insert into core.person (person_id, full_name, kind, given_name, family_name, birth_date, height_cm, weight_kg, college, source_id)
overriding system value
select pp.person_id, pp.full_name, 'player', pp.first_name, pp.last_name, pp.birth_date,
       case when pp.height_in between 48 and 96 then round(pp.height_in * 2.54)::smallint end,
       case when pp.weight_lb between 80 and 600 then round(pp.weight_lb * 0.45359237, 1) end,
       pp.college, (select source_id from nsrc)
from pp where not pp.keyed and not pp.matched
on conflict (person_id) do nothing;

-- a person already in core keeps what they have; only the empty fields are filled
update core.person p set
  given_name = coalesce(p.given_name, pp.first_name), family_name = coalesce(p.family_name, pp.last_name),
  birth_date = coalesce(p.birth_date, pp.birth_date),
  height_cm = coalesce(p.height_cm, case when pp.height_in between 48 and 96 then round(pp.height_in * 2.54)::smallint end),
  weight_kg = coalesce(p.weight_kg, case when pp.weight_lb between 80 and 600 then round(pp.weight_lb * 0.45359237, 1) end),
  college = coalesce(p.college, pp.college), updated_at = now()
from pp
where p.person_id = pp.person_id and (pp.keyed or pp.matched)
  and (p.given_name is null or p.family_name is null or p.birth_date is null or p.height_cm is null or p.weight_kg is null or p.college is null);

insert into core.external_id (entity_kind, entity_id, source_id, external_key)
select 'person', pp.person_id, (select source_id from nsrc), pp.key from pp where not pp.keyed
on conflict do nothing;

-- ---- 3. Rosters ---------------------------------------------------------------------------------------------------------------------
insert into core.roster_stint (person_id, team_season_id, role, position, jersey_number, weight_kg, status, source_id)
select distinct on (pp.person_id, rp.team_season_id) pp.person_id, rp.team_season_id, 'player', rp.pos_code,
       case when rp.jersey_number between 0 and 99 and (rp.jersey_number > 0 or rp.season >= 2023) then rp.jersey_number end,
       case when rp.weight_lb between 80 and 600 then round(rp.weight_lb * 0.45359237)::smallint end,
       nullif(rp.status, ''), (select source_id from nsrc)
from rp join pp using (key)
where not exists (select 1 from core.roster_stint o where o.person_id = pp.person_id and o.team_season_id = rp.team_season_id and o.role = 'player')
order by pp.person_id, rp.team_season_id, rp.row_no desc;

-- ---- 4. What could not be placed ----------------------------------------------------------------------------------------------------
delete from meta.data_issue where source_id = (select source_id from nsrc) and entity_kind = 'roster_team' and entity_key like 'nflverse_rosters:%';
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from nsrc), 'roster_team', 'nflverse_rosters:' || x.team || ':' || x.first_season,
       format('nflverse roster rows with team code %s in %s-%s (%s rows) fit no NFL team season we hold', x.team, x.first_season, x.last_season, x.n),
       case when x.target is null then 'Code not in db/seed/nflverse_roster_team.csv' else 'Franchise has no team season that year' end
from (select r0.team, min(r0.season) as first_season, max(r0.season) as last_season, count(*) as n, bool_and(r0.target is null) as no_code, min(r0.target) as target
      from r0 where r0.season >= 1972 and not exists (select 1 from r where r.season = r0.season and r.row_no = r0.row_no) group by r0.team) x;
delete from meta.data_issue where source_id = (select source_id from nsrc) and entity_kind = 'roster_player' and entity_key = 'nflverse_rosters:no_identity';
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from nsrc), 'roster_player', 'nflverse_rosters:no_identity',
       format('%s nflverse roster rows since 1972 have neither a player id nor a birth date; they are not used', n), 'Left out'
from (select count(*) as n from r where season >= 1972 and not exists (select 1 from rk where rk.season = r.season and rk.row_no = r.row_no)) z where n > 0;

select (select count(*) from core.roster_stint where source_id = (select source_id from nsrc)) as stints,
       (select count(*) from pp) as players, (select count(*) from pp where not keyed and not matched) as new_people, (select count(*) from pp where matched) as matched_people,
       (select count(distinct season) from rk) as seasons;
commit;

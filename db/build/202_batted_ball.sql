-- Where MLB batted balls landed (core.batted_ball_season, _league, _team, _player), from legacy_retrosheet.batted_ball. Run from the repo root,
-- after the steps that write MLB seasons, team seasons and people (140, 181, 185). Rerunnable: the rows of these four tables are deleted and
-- written again. Needs migrations 071 (DS1) and 072.
--
-- Source: Retrosheet's play-by-play event files, 1986-2025. Retrosheet's notice (meta.source 'retrosheet'): "The information used here was
-- obtained free of charge from and is copyrighted by Retrosheet. Interested parties may contact Retrosheet at www.retrosheet.org."
-- Dense from 1989; 1986-88 are partial: core.batted_ball_season says how many balls in play each season has and how many carry a zone.
--
-- Load order (DS1, through scripts/mac/ds1-apply.sh, --dry-run first; the raw zips of 2026-10-13 are in
-- ~/Projects/backups/spx-stats/raw/retrosheet_events/2026-10-13/):
--   python3 -I scripts/archive_raw.py retrosheet_events <raw dir> 2026-10-13                 (psql env set: archives the zips in raw_archive)
--   bash scripts/mac/ds1-apply.sh db/migrations/071_legacy_batted_ball.sql
--   python3 -I scripts/retrosheet/events.py <raw dir> <out dir>                              (writes <out dir>/load.sql)
--   bash scripts/mac/ds1-apply.sh <out dir>/load.sql --force
--   bash scripts/mac/ds1-apply.sh db/migrations/072_batted_ball.sql
--   bash scripts/mac/ds1-apply.sh db/build/202_batted_ball.sql
-- Production: migration 072, then a data release of ref.hit_zone, meta.source and the four core.batted_ball_* tables.
--
-- A person is found as in db/build/184: core.external_id (retrosheet id), else Lahman's retroID (legacy_lahman.people) and the person that
-- Lahman id belongs to. A club is a team_season by Retrosheet's team code and year, as in db/build/184. Nothing is guessed: a batter or a club
-- that cannot be found is logged in meta.data_issue ('batted_ball_person', 'batted_ball_team') and left out of that table (never out of the league
-- table or of legacy_retrosheet.batted_ball). All-star games are in the legacy table only. Trajectory-only plays are counted in
-- core.batted_ball_season, not here. Pitchers are the fielding side's pitcher of the play (Retrosheet's start and sub records). How the cells are packed: the top of db/migrations/072_batted_ball.sql.

-- ---------------------------------------------------------------- packing helpers (this session only)
create function pg_temp.vint(c int) returns bytea language plpgsql immutable as $$
begin
  if c < 0 then raise exception 'negative count %', c; end if;
  if c < 128 then return set_byte('\x00'::bytea, 0, c); end if;
  if c < 16384 then return set_byte(set_byte('\x0000'::bytea, 0, (c & 127) | 128), 1, c >> 7); end if;
  if c < 2097152 then return set_byte(set_byte(set_byte('\x000000'::bytea, 0, (c & 127) | 128), 1, ((c >> 7) & 127) | 128), 2, c >> 14); end if;
  raise exception 'count % too large', c;
end $$;
-- one zone: its index, the results that have a count (0 out .. 6 fielders_choice, ascending) and the counts
create function pg_temp.cell(z int, ks int[], ns int[]) returns bytea language plpgsql immutable as $$
declare mask int := 0; res bytea; i int;
begin
  for i in 1..cardinality(ks) loop mask := mask | (1 << ks[i]); end loop;
  res := set_byte('\x00'::bytea, 0, z) || set_byte('\x00'::bytea, 0, mask);
  for i in 1..cardinality(ks) loop res := res || pg_temp.vint(ns[i]); end loop;
  return res;
end $$;
-- the seven trajectory counts, always all seven (0 G, 1 L, 2 F, 3 P, 4 BG, 5 BP, 6 BL)
create function pg_temp.trajbytes(ks int[], ns int[]) returns bytea language plpgsql immutable as $$
declare res bytea := ''::bytea; k int; i int;
begin
  for k in 0..6 loop
    i := array_position(ks, k);
    res := res || pg_temp.vint(case when i is null then 0 else ns[i] end);
  end loop;
  return res;
end $$;

-- ---------------------------------------------------------------- source
create temp table src on commit drop as select source_id from meta.source where code = 'retrosheet';
update meta.source set name = 'Retrosheet game logs and event files',
       notes = coalesce(notes, '') || ' Hit locations of batted balls, 1986-2025 (core.batted_ball_*): the play-by-play event files events/<year>eve.zip, <year>post.zip and <year>as.zip, fetched 2026-10-13; the notice above covers them.'
where code = 'retrosheet' and coalesce(notes, '') not like '%play-by-play event files%';

delete from core.batted_ball_player;
delete from core.batted_ball_team;
delete from core.batted_ball_league;
delete from core.batted_ball_season;
delete from meta.data_issue where entity_kind in ('batted_ball_person', 'batted_ball_team');

-- ---------------------------------------------------------------- people and clubs
create temp table lp on commit drop as
select retroid, min(playerid) as playerid from legacy_lahman.people where retroid is not null and retroid <> '' group by 1;
create temp table pmap on commit drop as
select i.id, coalesce(x.entity_id, via.entity_id) as person_id
from (select batter as id from legacy_retrosheet.batted_ball where game_type = 'regular' and zone is not null
      union select pitcher from legacy_retrosheet.batted_ball where game_type = 'regular' and zone is not null and pitcher is not null) i
left join core.external_id x on x.entity_kind = 'person' and x.source_id = (select source_id from src) and x.external_key = i.id
left join lp on lp.retroid = i.id
left join core.external_id via on via.entity_kind = 'person' and via.source_id = (select source_id from meta.source where code = 'lahman') and via.external_key = lp.playerid;
create index on pmap (id);

create temp table retro_ts on commit drop as
select distinct y, c, ts from (
  select substr(source_key, 7, 4)::int y, split_part(source_key, ':', 3) c, home_team_season_id ts from core.game where source_id = (select source_id from src)
  union select substr(source_key, 7, 4)::int, split_part(source_key, ':', 4), away_team_season_id from core.game where source_id = (select source_id from src)) x;
create temp table fr on commit drop as
select entity_id as franchise_id, substr(external_key, 11) as code from core.external_id
where entity_kind = 'franchise' and source_id = (select source_id from src);
create temp table mlb_ts on commit drop as
select y, c, min(ts) as ts from (
  select y, c, ts from retro_ts
  union all
  select s.start_year, cn.team_id, ts.team_season_id
  from legacy_retrosheet.current_name cn join fr on fr.code = cn.franchise_id
  join core.season s on s.league_code = 'mlb' and s.start_year between extract(year from cn.first_game)::int and extract(year from coalesce(cn.last_game, '9999-01-01'))::int
  join core.team_season ts on ts.season_id = s.season_id and ts.franchise_id = fr.franchise_id
  where not exists (select 1 from retro_ts r where r.y = s.start_year and r.c = cn.team_id)) z
group by y, c;
create index on mlb_ts (y, c);

-- ---------------------------------------------------------------- one row per located ball, in numbers
create temp table res (k int primary key, result text unique);
insert into res values (0, 'out'), (1, 'single'), (2, 'double'), (3, 'triple'), (4, 'home_run'), (5, 'error'), (6, 'fielders_choice');
create temp table trj (k int primary key, traj text unique);
insert into trj values (0, 'G'), (1, 'L'), (2, 'F'), (3, 'P'), (4, 'BG'), (5, 'BP'), (6, 'BL');

create temp table bbx on commit drop as
select s.season_id, case b.game_type when 'regular' then 'regular' else 'playoffs' end as phase, t.k as traj_k, b.traj, z.zone_idx, r.k as result_k,
       bt.ts as bat_ts, ft.ts as fld_ts, case when b.game_type = 'regular' then pm.person_id end as person_id, case when b.game_type = 'regular' then pp.person_id end as pit_person_id,
       b.batter, b.pitcher, b.bat_team, b.fld_team, b.season
from legacy_retrosheet.batted_ball b
join core.season s on s.league_code = 'mlb' and s.start_year = b.season
join ref.hit_zone z on z.code = b.zone
join res r on r.result = b.result
join trj t on t.traj = b.traj
left join mlb_ts bt on bt.y = b.season and bt.c = b.bat_team
left join mlb_ts ft on ft.y = b.season and ft.c = b.fld_team
left join pmap pm on pm.id = b.batter
left join pmap pp on pp.id = b.pitcher
where b.zone is not null and b.game_type <> 'allstar';

-- ---------------------------------------------------------------- season coverage
insert into core.batted_ball_season (season_id, phase, plays, balls_in_play, with_trajectory, with_zone, located, source_id)
select s.season_id, case c.game_type when 'regular' then 'regular' else 'playoffs' end::core.season_phase,
       c.plays, c.balls_in_play, c.with_trajectory, c.with_zone, c.located, (select source_id from src)
from legacy_retrosheet.batted_ball_coverage c
join core.season s on s.league_code = 'mlb' and s.start_year = c.season
where c.game_type <> 'allstar';

-- ---------------------------------------------------------------- the league, per season, phase and trajectory
insert into core.batted_ball_league (season_id, phase, traj, n, cells, source_id)
select season_id, phase::core.season_phase, traj, sum((select sum(x) from unnest(ns) x))::int,
       string_agg(pg_temp.cell(zone_idx, ks, ns), ''::bytea order by zone_idx), (select source_id from src)
from (select season_id, phase, traj, zone_idx, array_agg(result_k order by result_k) as ks, array_agg(n::int order by result_k) as ns
      from (select season_id, phase, traj, zone_idx, result_k, count(*) as n from bbx group by 1, 2, 3, 4, 5) q
      group by 1, 2, 3, 4) g
group by season_id, phase, traj;

-- ---------------------------------------------------------------- clubs, as batters (bat) and as the defence (fld)
create temp table team_cells on commit drop as
select ts, phase, role, sum((select sum(x) from unnest(ns) x))::int as n, string_agg(pg_temp.cell(zone_idx, ks, ns), ''::bytea order by zone_idx) as cells
from (select ts, phase, role, zone_idx, array_agg(result_k order by result_k) as ks, array_agg(n::int order by result_k) as ns
      from (select bat_ts as ts, phase, 'bat' as role, zone_idx, result_k, count(*) as n from bbx where bat_ts is not null group by 1, 2, 4, 5
            union all
            select fld_ts, phase, 'fld', zone_idx, result_k, count(*) from bbx where fld_ts is not null group by 1, 2, 4, 5) q
      group by 1, 2, 3, 4) g
group by ts, phase, role;
create temp table team_traj on commit drop as
select ts, phase, role, pg_temp.trajbytes(array_agg(k order by k), array_agg(m::int order by k)) as traj
from (select bat_ts as ts, phase, 'bat' as role, traj_k as k, count(*) as m from bbx where bat_ts is not null group by 1, 2, 4
      union all
      select fld_ts, phase, 'fld', traj_k, count(*) from bbx where fld_ts is not null group by 1, 2, 4) q
group by ts, phase, role;
insert into core.batted_ball_team (team_season_id, phase, role, n, traj, cells, source_id)
select c.ts, c.phase::core.season_phase, c.role, c.n, t.traj, c.cells, (select source_id from src)
from team_cells c join team_traj t using (ts, phase, role);

-- ---------------------------------------------------------------- batters (bat) and pitchers (pit), regular season
create temp table pbx on commit drop as
select person_id, 'bat' as role, season_id, zone_idx, result_k, traj_k from bbx where person_id is not null and phase = 'regular'
union all
select pit_person_id, 'pit', season_id, zone_idx, result_k, traj_k from bbx where pit_person_id is not null and phase = 'regular';
create temp table player_cells on commit drop as
select person_id, role, season_id, sum((select sum(x) from unnest(ns) x))::int as n, string_agg(pg_temp.cell(zone_idx, ks, ns), ''::bytea order by zone_idx) as cells
from (select person_id, role, season_id, zone_idx, array_agg(result_k order by result_k) as ks, array_agg(n::int order by result_k) as ns
      from (select person_id, role, season_id, zone_idx, result_k, count(*) as n from pbx group by 1, 2, 3, 4, 5) q
      group by 1, 2, 3, 4) g
group by person_id, role, season_id;
create temp table player_traj on commit drop as
select person_id, role, season_id, pg_temp.trajbytes(array_agg(k order by k), array_agg(m::int order by k)) as traj
from (select person_id, role, season_id, traj_k as k, count(*) as m from pbx group by 1, 2, 3, 4) q
group by person_id, role, season_id;
insert into core.batted_ball_player (person_id, season_id, role, n, traj, cells, source_id)
select c.person_id, c.season_id, c.role, c.n, t.traj, c.cells, (select source_id from src)
from player_cells c join player_traj t using (person_id, role, season_id);

-- ---------------------------------------------------------------- what could not be placed
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'batted_ball_person', id,
       format('Retrosheet player %s has %s located batted balls (as batter %s, as pitcher %s) in the regular seasons %s-%s and no core.person', id,
              count(*), count(*) filter (where role = 'bat'), count(*) filter (where role = 'pit'), min(season), max(season)),
       'Left out of core.batted_ball_player; still in the league and club tables and in legacy_retrosheet.batted_ball'
from (select batter as id, 'bat' as role, season from bbx where phase = 'regular' and person_id is null
      union all select pitcher, 'pit', season from bbx where phase = 'regular' and pit_person_id is null and pitcher is not null) m
group by id;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'batted_ball_team', season || ':' || code,
       format('Retrosheet team %s in %s has no team season (%s located batted balls)', code, season, sum(n)),
       'Left out of core.batted_ball_team; still in the league table'
from (select season, bat_team as code, count(*) as n from bbx where bat_ts is null group by 1, 2
      union all select season, fld_team, count(*) from bbx where fld_ts is null group by 1, 2) m
group by season, code;

analyze core.batted_ball_season;
analyze core.batted_ball_league;
analyze core.batted_ball_team;
analyze core.batted_ball_player;

-- ---------------------------------------------------------------- report (read it: the numbers should add up; the player rows count a ball once as batted and once as pitched)
select 'located balls (all-star games excluded)' as what, count(*)::text as n from bbx
union all select 'in core.batted_ball_league', sum(n)::text from core.batted_ball_league
union all select 'in core.batted_ball_team, bat / fld', (select sum(n) from core.batted_ball_team where role = 'bat')::text || ' / ' || (select sum(n) from core.batted_ball_team where role = 'fld')::text
union all select 'in core.batted_ball_player, bat / pit (regular season)', (select sum(n) from core.batted_ball_player where role = 'bat')::text || ' / ' || (select sum(n) from core.batted_ball_player where role = 'pit')::text
union all select 'players (batters or pitchers) with no core.person', count(*)::text from meta.data_issue where entity_kind = 'batted_ball_person'
union all select 'club seasons with no team season', count(*)::text from meta.data_issue where entity_kind = 'batted_ball_team';

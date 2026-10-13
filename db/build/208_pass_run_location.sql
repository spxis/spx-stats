-- Where NFL passes and runs went (core.pass_run_season, _league, _team, _player_id, _player), from legacy_nflverse.pbp_location. Run from the repo
-- root, after the steps that write NFL seasons, team seasons and games (150, 151, 152). Rerunnable: the rows of these five tables are deleted and
-- written again. Needs migrations 080 (DS1) and 081.
--
-- Source: nflverse-data, release "pbp", play_by_play_<year>.csv.gz, 1999-2025 (CC BY 4.0, credit "nflverse (CC BY 4.0), data from NFL.com").
-- Runs are located from 1999; passes (pass_location with air_yards) from 2006: core.pass_run_season says how many plays each season has and how
-- many carry a location. A play with no location is a hole, counted there and nowhere else. Two-point tries are not counted.
--
-- Load order (DS1, through scripts/mac/ds1-apply.sh, --dry-run first; the raw files of 2026-10-13 are in
-- ~/Projects/backups/spx-stats/raw/nflverse_pbp/2026-10-13/, 27 files, 442 MB, with SHA256SUMS.txt):
--   bash scripts/mac/ds1-apply.sh db/migrations/080_legacy_pbp_location.sql
--   python3 -I scripts/nflverse/pbp_location.py <raw dir> <out dir>                          (writes <out dir>/load.sql)
--   bash scripts/mac/ds1-apply.sh <out dir>/load.sql --force
--   bash scripts/mac/ds1-apply.sh db/migrations/081_pass_run_location.sql
--   bash scripts/mac/ds1-apply.sh db/build/208_pass_run_location.sql
-- Production: migration 081, then a data release of ref.pass_zone, ref.run_zone, meta.source and the five core.pass_run_* tables.
--
-- A game is found by its nflverse game id in core.external_id (entity_kind 'game', source nflverse, the key of legacy_nflverse.game); the club
-- with the ball is the game's home or away team season by posteam_type (nflverse writes current team codes in every season, so the code does not
-- say which). A player is found by core.external_id (entity_kind 'person', source nflverse, key 'gsis:<gsis id>'): none are loaded yet, so every
-- player starts unmatched. Nothing is guessed from a name: an unmatched player keeps person_id null in core.pass_run_player_id, and the season
-- counts are logged in meta.data_issue ('pass_run_person', one row per season). A game with no core.game is logged ('pass_run_game') and left
-- out of every table. How the cells are packed: the top of db/migrations/081_pass_run_location.sql.

-- ---------------------------------------------------------------- packing helpers (this session only)
create function pg_temp.vint(c int) returns bytea language plpgsql immutable as $$
declare res bytea := ''::bytea;
begin
  if c < 0 then raise exception 'negative count %', c; end if;
  loop
    if c < 128 then return res || set_byte('\x00'::bytea, 0, c); end if;
    res := res || set_byte('\x00'::bytea, 0, (c & 127) | 128);
    c := c >> 7;
  end loop;
end $$;
create function pg_temp.zz(y int) returns int language sql immutable as $$ select case when y >= 0 then y * 2 else -y * 2 - 1 end $$;
-- one zone: its index, then its counts as varints
create function pg_temp.cell(z int, vals int[]) returns bytea language plpgsql immutable as $$
declare res bytea := set_byte('\x00'::bytea, 0, z); i int;
begin
  for i in 1..cardinality(vals) loop res := res || pg_temp.vint(vals[i]); end loop;
  return res;
end $$;
-- the zone of a play, as the number of ref.pass_zone / ref.run_zone
create function pg_temp.pass_zone(loc text, ay int) returns int language sql immutable as $$
  select (case when ay >= 15 then 3 else 0 end) + case loc when 'left' then 0 when 'middle' then 1 when 'right' then 2 end $$;
create function pg_temp.run_zone(loc text, gap text) returns int language sql immutable as $$
  select case when loc = 'middle' then 3
              when loc = 'left' then case gap when 'end' then 0 when 'tackle' then 1 when 'guard' then 2 end
              when loc = 'right' then case gap when 'guard' then 4 when 'tackle' then 5 when 'end' then 6 end end $$;

-- ---------------------------------------------------------------- source
create temp table src on commit drop as select source_id from meta.source where code = 'nflverse';
update meta.source set notes = coalesce(notes, '') || ' Pass and run locations 1999-2025 (core.pass_run_*): play_by_play_<year>.csv.gz of the nflverse-data release "pbp", fetched 2026-10-13. Credit: nflverse (CC BY 4.0), data from NFL.com.'
where code = 'nflverse' and coalesce(notes, '') not like '%Pass and run locations%';

delete from core.pass_run_player_id;      -- cascades to core.pass_run_player
delete from core.pass_run_team;
delete from core.pass_run_league;
delete from core.pass_run_season;
delete from meta.data_issue where entity_kind in ('pass_run_game', 'pass_run_person');

-- ---------------------------------------------------------------- games
create temp table gmap on commit drop as
select x.external_key as nfl_game_id, g.game_id, g.season_id, g.phase::text as phase, g.home_team_season_id, g.away_team_season_id
from core.external_id x
join core.game g on g.game_id = x.entity_id
where x.entity_kind = 'game' and x.source_id = (select source_id from src) and g.phase in ('regular', 'playoffs');
create index on gmap (nfl_game_id);

-- ---------------------------------------------------------------- one row per located play
create temp table px on commit drop as
select m.season_id, m.phase, m.nfl_game_id, p.season, p.play_id,
       case when p.posteam_type = 'home' then m.home_team_season_id when p.posteam_type = 'away' then m.away_team_season_id end as off_ts,
       case when p.posteam_type = 'home' then m.away_team_season_id when p.posteam_type = 'away' then m.home_team_season_id end as def_ts,
       'pass'::text as kind, pg_temp.pass_zone(p.pass_location, p.air_yards) as zone_idx,
       case when p.complete_pass then 1 else 0 end as comp, coalesce(p.yards_gained, 0)::int as yds,
       case when p.pass_touchdown then 1 else 0 end as td, case when p.interception then 1 else 0 end as ic,
       p.passer_id, p.passer_name, p.receiver_id, p.receiver_name, null::text as rusher_id, null::text as rusher_name
from legacy_nflverse.pbp_location p
join gmap m on m.nfl_game_id = p.game_id
where p.play_type = 'pass' and p.pass_attempt and not p.two_point and p.pass_location is not null and p.air_yards is not null
union all
select m.season_id, m.phase, m.nfl_game_id, p.season, p.play_id,
       case when p.posteam_type = 'home' then m.home_team_season_id when p.posteam_type = 'away' then m.away_team_season_id end,
       case when p.posteam_type = 'home' then m.away_team_season_id when p.posteam_type = 'away' then m.home_team_season_id end,
       'run', pg_temp.run_zone(p.run_location, p.run_gap), 0, coalesce(p.yards_gained, 0)::int,
       case when p.rush_touchdown then 1 else 0 end, 0,
       null, null, null, null, p.rusher_id, p.rusher_name
from legacy_nflverse.pbp_location p
join gmap m on m.nfl_game_id = p.game_id
where p.play_type = 'run' and p.rush_attempt and not p.two_point and pg_temp.run_zone(p.run_location, p.run_gap) is not null;

-- ---------------------------------------------------------------- season coverage
insert into core.pass_run_season (season_id, phase, plays, pass_attempts, pass_located, runs, run_located, source_id)
select m.season_id, m.phase::core.season_phase, count(*),
       count(*) filter (where p.play_type = 'pass' and p.pass_attempt and not p.two_point),
       count(*) filter (where p.play_type = 'pass' and p.pass_attempt and not p.two_point and p.pass_location is not null and p.air_yards is not null),
       count(*) filter (where p.play_type = 'run' and p.rush_attempt and not p.two_point),
       count(*) filter (where p.play_type = 'run' and p.rush_attempt and not p.two_point and pg_temp.run_zone(p.run_location, p.run_gap) is not null),
       (select source_id from src)
from legacy_nflverse.pbp_location p join gmap m on m.nfl_game_id = p.game_id
group by m.season_id, m.phase;

-- ---------------------------------------------------------------- the packed row of one scope: counts by zone
create function pg_temp.zone_cell(kind text, zone_idx int, a bigint, c bigint, y bigint, t bigint, i bigint) returns bytea language sql immutable as $$
  select case kind when 'pass' then pg_temp.cell(zone_idx, array[a::int, c::int, pg_temp.zz(y::int), t::int, i::int])
                   else pg_temp.cell(zone_idx, array[a::int, pg_temp.zz(y::int), t::int]) end $$;

-- ---------------------------------------------------------------- the league, per season, phase and kind
insert into core.pass_run_league (season_id, phase, kind, n, cells, source_id)
select season_id, phase::core.season_phase, kind, sum(a)::int, string_agg(pg_temp.zone_cell(kind, zone_idx, a, c, y, t, i), ''::bytea order by zone_idx), (select source_id from src)
from (select season_id, phase, kind, zone_idx, count(*) as a, sum(comp) as c, sum(yds) as y, sum(td) as t, sum(ic) as i from px group by 1, 2, 3, 4) z
group by season_id, phase, kind;

-- ---------------------------------------------------------------- clubs, with the ball (off) and without it (def)
insert into core.pass_run_team (team_season_id, phase, role, kind, n, cells, source_id)
select ts, phase::core.season_phase, role, kind, sum(a)::int, string_agg(pg_temp.zone_cell(kind, zone_idx, a, c, y, t, i), ''::bytea order by zone_idx), (select source_id from src)
from (select off_ts as ts, phase, 'off' as role, kind, zone_idx, count(*) as a, sum(comp) as c, sum(yds) as y, sum(td) as t, sum(ic) as i from px where off_ts is not null group by 1, 2, 4, 5
      union all
      select def_ts, phase, 'def', kind, zone_idx, count(*), sum(comp), sum(yds), sum(td), sum(ic) from px where def_ts is not null group by 1, 2, 4, 5) z
group by ts, phase, role, kind;

-- ---------------------------------------------------------------- players, regular season: passer, target (rec) and rusher
create temp table pl on commit drop as
select gsis_id, role, season_id, kind, zone_idx, count(*) as a, sum(comp) as c, sum(yds) as y, sum(td) as t, sum(ic) as i
from (select passer_id as gsis_id, 'pass' as role, season_id, kind, zone_idx, comp, yds, td, ic from px where kind = 'pass' and phase = 'regular' and passer_id is not null
      union all
      select receiver_id, 'rec', season_id, kind, zone_idx, comp, yds, td, ic from px where kind = 'pass' and phase = 'regular' and receiver_id is not null
      union all
      select rusher_id, 'rush', season_id, kind, zone_idx, comp, yds, td, ic from px where kind = 'run' and phase = 'regular' and rusher_id is not null) q
group by gsis_id, role, season_id, kind, zone_idx;

create temp table pnames on commit drop as
select gsis_id, (array_agg(name order by season desc, play_id desc))[1] as name
from (select passer_id as gsis_id, passer_name as name, season, play_id from px where passer_id is not null and passer_name is not null
      union all select receiver_id, receiver_name, season, play_id from px where receiver_id is not null and receiver_name is not null
      union all select rusher_id, rusher_name, season, play_id from px where rusher_id is not null and rusher_name is not null) n
group by gsis_id;

insert into core.pass_run_player_id (gsis_id, person_id, name)
select i.gsis_id, x.entity_id, coalesce(n.name, i.gsis_id)
from (select distinct gsis_id from pl) i
left join pnames n using (gsis_id)
left join core.external_id x on x.entity_kind = 'person' and x.source_id = (select source_id from src) and x.external_key = 'gsis:' || i.gsis_id;

insert into core.pass_run_player (gsis_id, season_id, role, n, cells, source_id)
select gsis_id, season_id, role, sum(a)::int, string_agg(pg_temp.zone_cell(kind, zone_idx, a, c, y, t, i), ''::bytea order by zone_idx), (select source_id from src)
from pl group by gsis_id, season_id, role;

-- ---------------------------------------------------------------- what could not be placed
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'pass_run_game', p.game_id,
       format('nflverse game %s has %s passes and runs in the play-by-play and no core.game', p.game_id, count(*)),
       'Left out of every core.pass_run_* table; still in legacy_nflverse.pbp_location'
from legacy_nflverse.pbp_location p
where not exists (select 1 from gmap m where m.nfl_game_id = p.game_id)
group by p.game_id;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'pass_run_person', 'season:' || s.start_year,
       format('%s of %s players with located passes thrown, targets or carries in the %s regular season have no core.person (their gsis id is not in core.external_id)',
              count(*) filter (where i.person_id is null), count(*), s.start_year),
       'person_id is null in core.pass_run_player_id (select ... where person_id is null lists them); the counts stay in core.pass_run_player under the gsis id. Never matched on a name'
from (select distinct gsis_id, season_id from core.pass_run_player) p
join core.pass_run_player_id i using (gsis_id)
join core.season s using (season_id)
group by s.start_year
having count(*) filter (where i.person_id is null) > 0;

analyze core.pass_run_season;
analyze core.pass_run_league;
analyze core.pass_run_team;
analyze core.pass_run_player_id;
analyze core.pass_run_player;

-- ---------------------------------------------------------------- report (read it: the numbers should add up; the team rows count a play once on offence and once on defence)
select 'located plays (pass / run)' as what, (select count(*) from px where kind = 'pass')::text || ' / ' || (select count(*) from px where kind = 'run')::text as n
union all select 'in core.pass_run_season, pass_located / run_located', sum(pass_located)::text || ' / ' || sum(run_located)::text from core.pass_run_season
union all select 'in core.pass_run_league, pass / run', (select sum(n) from core.pass_run_league where kind = 'pass')::text || ' / ' || (select sum(n) from core.pass_run_league where kind = 'run')::text
union all select 'in core.pass_run_team off, pass / run', (select sum(n) from core.pass_run_team where role = 'off' and kind = 'pass')::text || ' / ' || (select sum(n) from core.pass_run_team where role = 'off' and kind = 'run')::text
union all select 'in core.pass_run_team def, pass / run', (select sum(n) from core.pass_run_team where role = 'def' and kind = 'pass')::text || ' / ' || (select sum(n) from core.pass_run_team where role = 'def' and kind = 'run')::text
union all select 'in core.pass_run_player, pass / rec / rush (regular season)', (select sum(n) from core.pass_run_player where role = 'pass')::text || ' / ' || (select sum(n) from core.pass_run_player where role = 'rec')::text || ' / ' || (select sum(n) from core.pass_run_player where role = 'rush')::text
union all select 'players, matched to a person / all', (select count(*) from core.pass_run_player_id where person_id is not null)::text || ' / ' || (select count(*) from core.pass_run_player_id)::text
union all select 'games with no core.game', count(*)::text from meta.data_issue where entity_kind = 'pass_run_game';

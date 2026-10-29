-- core.batted_ball_player_hand: each player's located MLB batted balls of a regular season, split by the side the batter hit from, as a batter (bat) and as a
-- pitcher (pit), from legacy_retrosheet.batted_ball. Run from the repo root, after db/build/202 (it finds people as 202 does). Needs migrations 071, 072 and 165.
-- Rerunnable: the table is deleted and written again; it holds nothing else, and no id is made (a row is keyed by core.person's and core.season's own ids), so a
-- rerun changes no id. Both sides of a player-season add up to its core.batted_ball_player row (db/checks/105).
--
-- Source: Retrosheet's play-by-play event files, 1986-2025. Retrosheet's notice (meta.source 'retrosheet'): "The information used here was obtained free of
-- charge from and is copyrighted by Retrosheet. Interested parties may contact Retrosheet at www.retrosheet.org." Dense from 1989; 1986-88 are partial
-- (db/migrations/071). A ball whose play has no location on the diagram, an all-star or postseason ball, and a ball with no batter's side are not counted.
--
-- A person is found as in db/build/202: core.external_id (retrosheet id), else Lahman's retroID and the person that Lahman id belongs to; never by name. A player
-- who cannot be found is already logged by 202 (meta.data_issue 'batted_ball_person') and left out here.
-- How the cells and traj are packed: the top of db/migrations/072_batted_ball.sql. Load order (DS1, through scripts/mac/ds1-apply.sh, --dry-run first):
-- migration 165, then this step (after 202). Publish with a Turso data release of core.batted_ball_player_hand.

-- ---------------------------------------------------------------- packing helpers (the same as db/build/202)
create function pg_temp.vint(c int) returns bytea language plpgsql immutable as $$
begin
  if c < 0 then raise exception 'negative count %', c; end if;
  if c < 128 then return set_byte('\x00'::bytea, 0, c); end if;
  if c < 16384 then return set_byte(set_byte('\x0000'::bytea, 0, (c & 127) | 128), 1, c >> 7); end if;
  if c < 2097152 then return set_byte(set_byte(set_byte('\x000000'::bytea, 0, (c & 127) | 128), 1, ((c >> 7) & 127) | 128), 2, c >> 14); end if;
  raise exception 'count % too large', c;
end $$;
create function pg_temp.cell(z int, ks int[], ns int[]) returns bytea language plpgsql immutable as $$
declare mask int := 0; res bytea; i int;
begin
  for i in 1..cardinality(ks) loop mask := mask | (1 << ks[i]); end loop;
  res := set_byte('\x00'::bytea, 0, z) || set_byte('\x00'::bytea, 0, mask);
  for i in 1..cardinality(ks) loop res := res || pg_temp.vint(ns[i]); end loop;
  return res;
end $$;
create function pg_temp.trajbytes(ks int[], ns int[]) returns bytea language plpgsql immutable as $$
declare res bytea := ''::bytea; k int; i int;
begin
  for k in 0..6 loop
    i := array_position(ks, k);
    res := res || pg_temp.vint(case when i is null then 0 else ns[i] end);
  end loop;
  return res;
end $$;

-- ---------------------------------------------------------------- people
create temp table src on commit drop as select source_id from meta.source where code = 'retrosheet';
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

-- ---------------------------------------------------------------- one row per located ball of a regular season, in numbers, once as batted and once as pitched
create temp table res (k int primary key, result text unique);
insert into res values (0, 'out'), (1, 'single'), (2, 'double'), (3, 'triple'), (4, 'home_run'), (5, 'error'), (6, 'fielders_choice');
create temp table trj (k int primary key, traj text unique);
insert into trj values (0, 'G'), (1, 'L'), (2, 'F'), (3, 'P'), (4, 'BG'), (5, 'BP'), (6, 'BL');

create temp table pbx on commit drop as
select pm.person_id, 'bat'::text as role, s.season_id, s.start_year::smallint as year, b.bat_hand, z.zone_idx, r.k as result_k, t.k as traj_k
from legacy_retrosheet.batted_ball b
join core.season s on s.league_code = 'mlb' and s.start_year = b.season
join ref.hit_zone z on z.code = b.zone
join res r on r.result = b.result
join trj t on t.traj = b.traj
join pmap pm on pm.id = b.batter
where b.game_type = 'regular' and b.zone is not null and b.bat_hand is not null and pm.person_id is not null
union all
select pm.person_id, 'pit', s.season_id, s.start_year::smallint, b.bat_hand, z.zone_idx, r.k, t.k
from legacy_retrosheet.batted_ball b
join core.season s on s.league_code = 'mlb' and s.start_year = b.season
join ref.hit_zone z on z.code = b.zone
join res r on r.result = b.result
join trj t on t.traj = b.traj
join pmap pm on pm.id = b.pitcher
where b.game_type = 'regular' and b.zone is not null and b.bat_hand is not null and pm.person_id is not null;

create temp table hand_cells on commit drop as
select person_id, role, season_id, year, bat_hand, sum((select sum(x) from unnest(ns) x))::int as n, string_agg(pg_temp.cell(zone_idx, ks, ns), ''::bytea order by zone_idx) as cells
from (select person_id, role, season_id, year, bat_hand, zone_idx, array_agg(result_k order by result_k) as ks, array_agg(n::int order by result_k) as ns
      from (select person_id, role, season_id, year, bat_hand, zone_idx, result_k, count(*) as n from pbx group by 1, 2, 3, 4, 5, 6, 7) q
      group by 1, 2, 3, 4, 5, 6) g
group by person_id, role, season_id, year, bat_hand;
create temp table hand_traj on commit drop as
select person_id, role, season_id, bat_hand, pg_temp.trajbytes(array_agg(k order by k), array_agg(m::int order by k)) as traj
from (select person_id, role, season_id, bat_hand, traj_k as k, count(*) as m from pbx group by 1, 2, 3, 4, 5) q
group by person_id, role, season_id, bat_hand;

delete from core.batted_ball_player_hand;
insert into core.batted_ball_player_hand (person_id, season_id, year, role, bat_hand, n, traj, cells, source_id)
select c.person_id, c.season_id, c.year, c.role, c.bat_hand, c.n, t.traj, c.cells, (select source_id from src)
from hand_cells c join hand_traj t using (person_id, role, season_id, bat_hand);
analyze core.batted_ball_player_hand;

-- ---------------------------------------------------------------- report (read it: the two tables count the same balls)
select 'rows in core.batted_ball_player_hand' as what, count(*)::text as n from core.batted_ball_player_hand
union all select 'balls, bat / pit', (select sum(n) from core.batted_ball_player_hand where role = 'bat')::text || ' / ' || (select sum(n) from core.batted_ball_player_hand where role = 'pit')::text
union all select 'the same in core.batted_ball_player, bat / pit', (select sum(n) from core.batted_ball_player where role = 'bat')::text || ' / ' || (select sum(n) from core.batted_ball_player where role = 'pit')::text
union all select 'players with both sides in a season (switch hitters, and every pitcher)', count(*)::text from (select 1 from core.batted_ball_player_hand group by person_id, season_id, role having count(*) > 1) m;

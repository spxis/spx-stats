-- Where MLB batted balls landed, 1986-2025: counts per hit-location zone, per result, from Retrosheet's play-by-play event files.
-- Add-only, DS1 and production. db/build/202_batted_ball.sql fills the four core tables from legacy_retrosheet.batted_ball
-- (migration 071, DS1 only); production gets them through a data release. Retrosheet's notice (meta.source 'retrosheet'):
-- "The information used here was obtained free of charge from and is copyrighted by Retrosheet. Interested parties may contact
-- Retrosheet at www.retrosheet.org."
--
-- Zones are the 68 of Retrosheet's hit-location diagram (retrosheet.org/location.htm), listed in ref.hit_zone with the number the packed
-- cells use. Coverage is dense from 1989 (about 90% of balls in play 1989-1999, 95% or more 2000-2025) and partial in 1986-88 (16%, 12%, 44%); a ball with no
-- zone is a hole and is not counted anywhere here. core.batted_ball_season says how many balls each season has and how many were located.
--
-- To keep production small (about 13 MB for everything) the counts of one scope are packed in a bytea, "cells":
--   a run of records, one per zone that has any ball, in zone_idx order:
--     byte 0   zone_idx, the number in ref.hit_zone (0 to 67)
--     byte 1   mask: bit k set when the result k has a count (k: 0 out, 1 single, 2 double, 3 triple, 4 home_run, 5 error, 6 fielders_choice)
--     then one count per set bit, lowest bit first, each a little-endian base-128 varint (7 bits a byte, high bit means more bytes follow).
--   "traj" (teams and players) is the seven balls-by-trajectory counts, always all seven, as varints: G ground ball, L line drive, F fly
--   ball, P pop-up, BG bunt grounder, BP bunt pop-up, BL bunt line drive. A league row has one trajectory per row (its key) and no traj.
-- core.hit_cells_json(cells) and core.hit_traj_json(traj) unpack them; the api views do, and show {"8D": {"out": 3, "single": 1}}.

-- ---------------------------------------------------------------- the zones
create table if not exists ref.hit_zone (
  zone_idx  smallint primary key check (zone_idx between 0 and 67),
  code      text not null unique,        -- Retrosheet's code, e.g. 8D, 56S, 7LSF
  area      text not null check (area in ('infield', 'outfield', 'foul'))
);
comment on table ref.hit_zone is 'The 68 zones of Retrosheet''s hit-location diagram. zone_idx is the number the packed cells of core.batted_ball_* use: never renumber.';
insert into ref.hit_zone (zone_idx, code, area)
select (ord - 1)::smallint, code, case when code ~ 'F$' then 'foul' when code ~ '^[789]' then 'outfield' else 'infield' end
from unnest(string_to_array(
  '2 2F 1S 1 25 23 25F 23F 15 13 5S 3S 56S 34S 6S 4S 6MS 4MS 6M 4M 5F 3F 5 3 56 34 6 4 5D 3D 5DF 3DF 56D 34D 6D 4D 6MD 4MD 7LSF 9LSF 7LF 9LF 7LDF 9LDF '
  '7LS 7L 7LD 7S 7 7D 78S 78 78D 78XD 8S 8 8D 8XD 89S 89 89D 89XD 9S 9 9D 9LS 9L 9LD', ' ')) with ordinality as t(code, ord)
on conflict (zone_idx) do nothing;

-- ---------------------------------------------------------------- unpacking
create or replace function core.hit_cells_json(cells bytea) returns jsonb language plpgsql stable as $$
declare
  names constant text[] := array['out', 'single', 'double', 'triple', 'home_run', 'error', 'fielders_choice'];
  codes text[];
  pos int := 0;
  len int := coalesce(length(cells), 0);
  z int; mask int; k int; v int; sh int; b int;
  cell jsonb;
  res jsonb := '{}';
begin
  select array_agg(code order by zone_idx) into codes from ref.hit_zone;
  while pos < len loop
    z := get_byte(cells, pos); mask := get_byte(cells, pos + 1); pos := pos + 2;
    cell := '{}';
    for k in 0..6 loop
      if (mask >> k) & 1 = 1 then
        v := 0; sh := 0;
        loop
          b := get_byte(cells, pos); pos := pos + 1;
          v := v | ((b & 127) << sh); sh := sh + 7;
          exit when b < 128;
        end loop;
        cell := cell || jsonb_build_object(names[k + 1], v);
      end if;
    end loop;
    res := res || jsonb_build_object(codes[z + 1], cell);
  end loop;
  return res;
end $$;
comment on function core.hit_cells_json(bytea) is 'Unpacks the cells of core.batted_ball_* into {zone: {result: count}} (see migration 072).';

create or replace function core.hit_traj_json(traj bytea) returns jsonb language plpgsql immutable as $$
declare
  names constant text[] := array['G', 'L', 'F', 'P', 'BG', 'BP', 'BL'];
  pos int := 0;
  len int := coalesce(length(traj), 0);
  k int := 0; v int; sh int; b int;
  res jsonb := '{}';
begin
  while pos < len and k < 7 loop
    v := 0; sh := 0;
    loop
      b := get_byte(traj, pos); pos := pos + 1;
      v := v | ((b & 127) << sh); sh := sh + 7;
      exit when b < 128;
    end loop;
    if v > 0 then res := res || jsonb_build_object(names[k + 1], v); end if;
    k := k + 1;
  end loop;
  return res;
end $$;
comment on function core.hit_traj_json(bytea) is 'Unpacks the traj counts of core.batted_ball_* into {trajectory: count} (see migration 072).';

-- ---------------------------------------------------------------- tables
create table if not exists core.batted_ball_season (
  season_id        integer not null references core.season on delete cascade,
  phase            core.season_phase not null check (phase in ('regular', 'playoffs')),
  plays            integer not null,   -- plays in the season's event files (no-play lines excluded)
  balls_in_play    integer not null,   -- singles, doubles, triples, home runs, errors, fielder's choices and outs on a fielder's play
  with_trajectory  integer not null,
  with_zone        integer not null,   -- a trajectory and a zone code of any kind
  located          integer not null,   -- the zone is one of the 68: the balls the other tables count
  source_id        smallint not null references meta.source,
  primary key (season_id, phase)
);
comment on table core.batted_ball_season is 'How many balls in play each MLB season has in Retrosheet''s event files, and how many carry a hit location. The rest are holes.';

create table if not exists core.batted_ball_league (
  season_id  integer not null references core.season on delete cascade,
  phase      core.season_phase not null check (phase in ('regular', 'playoffs')),
  traj       text not null check (traj in ('G', 'L', 'F', 'P', 'BG', 'BP', 'BL')),
  n          integer not null,       -- located balls
  cells      bytea not null,         -- counts by zone and result, packed (see the top of this file)
  source_id  smallint not null references meta.source,
  primary key (season_id, phase, traj)
);
comment on table core.batted_ball_league is 'The league''s located batted balls of a season, per trajectory: counts by hit-location zone and result, packed in cells.';

create table if not exists core.batted_ball_team (
  team_season_id  integer not null references core.team_season on delete cascade,
  phase           core.season_phase not null check (phase in ('regular', 'playoffs')),
  role            text not null check (role in ('bat', 'fld')),   -- bat: balls the club's batters hit; fld: balls hit against its pitchers and fielders
  n               integer not null,
  traj            bytea not null,    -- balls by trajectory, packed
  cells           bytea not null,    -- counts by zone and result, packed
  source_id       smallint not null references meta.source,
  primary key (team_season_id, phase, role)
);
comment on table core.batted_ball_team is 'A club''s located batted balls of a season, as hit (bat) and as faced (fld): counts by hit-location zone and result, packed in cells.';

create table if not exists core.batted_ball_player (
  person_id  bigint not null references core.person on delete cascade,
  season_id  integer not null references core.season on delete cascade,
  role       text not null check (role in ('bat', 'pit')),    -- bat: balls he hit; pit: balls hit against him. Regular season only
  n          integer not null,
  traj       bytea not null,
  cells      bytea not null,
  source_id  smallint not null references meta.source,
  primary key (person_id, season_id, role)
);
comment on table core.batted_ball_player is 'A player''s located batted balls of an MLB regular season, all clubs together, as a batter (bat) and as a pitcher (pit): counts by hit-location zone and result, packed in cells.';

-- ---------------------------------------------------------------- api
create or replace view api.hit_zone as
select zone_idx, code, area from ref.hit_zone;

create or replace view api.batted_ball_season as
select s.league_code as league, s.start_year as year, b.phase::text as phase, b.plays, b.balls_in_play, b.with_trajectory, b.with_zone, b.located,
       src.code as source
from core.batted_ball_season b
join core.season s using (season_id)
join meta.source src on src.source_id = b.source_id;

create or replace view api.batted_ball_league as
select s.league_code as league, s.start_year as year, b.phase::text as phase, b.traj as trajectory, b.n,
       core.hit_cells_json(b.cells) as zones, src.code as source
from core.batted_ball_league b
join core.season s using (season_id)
join meta.source src on src.source_id = b.source_id;

create or replace view api.batted_ball_team as
select b.team_season_id, ts.franchise_id, s.league_code as league, s.start_year as year, b.phase::text as phase, b.role, b.n,
       core.hit_traj_json(b.traj) as trajectories, core.hit_cells_json(b.cells) as zones, src.code as source
from core.batted_ball_team b
join core.team_season ts using (team_season_id)
join core.season s on s.season_id = ts.season_id
join meta.source src on src.source_id = b.source_id;

create or replace view api.batted_ball_player as
select b.person_id, s.league_code as league, s.start_year as year, b.role, b.n,
       core.hit_traj_json(b.traj) as trajectories, core.hit_cells_json(b.cells) as zones, src.code as source
from core.batted_ball_player b
join core.season s using (season_id)
join meta.source src on src.source_id = b.source_id;

grant select on api.hit_zone, api.batted_ball_season, api.batted_ball_league, api.batted_ball_team, api.batted_ball_player to anon, authenticated;

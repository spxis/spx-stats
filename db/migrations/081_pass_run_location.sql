-- Where NFL passes and runs went, 1999-2025: counts per pass zone and per run zone, from nflverse's play-by-play (pbp release).
-- Add-only, DS1 and production. db/build/208_pass_run_location.sql fills the core tables from legacy_nflverse.pbp_location (migration 080, DS1
-- only); production gets them through a data release. nflverse's licence (meta.source 'nflverse') is CC BY 4.0: credit "nflverse (CC BY 4.0),
-- data from NFL.com".
--
-- Pass zones are the six of kyogijo's 'football-pass' zone set (src/heat.zones.ts): short (fewer than 15 air yards past the line of scrimmage,
-- a pass thrown behind it included) or deep (15 or more), by the side of the field nflverse's pass_location gives (left, middle, right: the
-- passer's left and right, middle between the hash marks). Run zones are nflverse's run_location and run_gap: left, right, each with end,
-- tackle or guard, and middle (nflverse gives no gap for a run up the middle). A play with no location (or, for a pass, no air yards) is a hole
-- and is counted only in core.pass_run_season. Pass locations with air yards exist from 2006; runs from 1999. Two-point tries, sacks, spikes and
-- kneel-downs are not counted anywhere here.
--
-- To keep production small (a few MB for everything) the counts of one scope are packed in a bytea, "cells":
--   a run of records, one per zone that has any play, in zone_idx order:
--     byte 0   zone_idx, the number in ref.pass_zone (kind 'pass') or ref.run_zone (kind 'run')
--     then the zone's counts as little-endian base-128 varints (7 bits a byte, the high bit means more bytes follow):
--       pass: attempts, completions, yards, touchdowns, interceptions
--       run:  carries, yards, touchdowns
--     yards are zigzag coded (0, -1, 1, -2, 2 ... as 0, 1, 2, 3, 4 ...): a zone's yards can be negative.
-- core.pass_run_cells_json(kind, cells) unpacks them; the api views do, and show {"short-left": {"attempts": 9, "completions": 5, ...}}.

-- ---------------------------------------------------------------- the zones
create table if not exists ref.pass_zone (
  zone_idx  smallint primary key check (zone_idx between 0 and 5),
  code      text not null unique     -- the ids of kyogijo's 'football-pass' set
);
comment on table ref.pass_zone is 'The six pass zones (kyogijo football-pass): length (short, deep) by side (left, middle, right). zone_idx is the number the packed cells of core.pass_run_* use: never renumber.';
insert into ref.pass_zone (zone_idx, code) values
  (0, 'short-left'), (1, 'short-middle'), (2, 'short-right'), (3, 'deep-left'), (4, 'deep-middle'), (5, 'deep-right')
on conflict (zone_idx) do nothing;

create table if not exists ref.run_zone (
  zone_idx  smallint primary key check (zone_idx between 0 and 6),
  code      text not null unique
);
comment on table ref.run_zone is 'The seven run zones of nflverse''s run_location and run_gap: left and right by end, tackle or guard, and middle. zone_idx is the number the packed cells of core.pass_run_* use: never renumber.';
insert into ref.run_zone (zone_idx, code) values
  (0, 'left-end'), (1, 'left-tackle'), (2, 'left-guard'), (3, 'middle'), (4, 'right-guard'), (5, 'right-tackle'), (6, 'right-end')
on conflict (zone_idx) do nothing;

-- ---------------------------------------------------------------- unpacking
create or replace function core.pass_run_cells_json(kind text, cells bytea) returns jsonb language plpgsql stable as $$
declare
  names text[];
  codes text[];
  pos int := 0;
  len int := coalesce(length(cells), 0);
  z int; k int; v int; sh int; b int;
  cell jsonb;
  res jsonb := '{}';
begin
  if kind = 'pass' then
    names := array['attempts', 'completions', 'yards', 'touchdowns', 'interceptions'];
    select array_agg(code order by zone_idx) into codes from ref.pass_zone;
  elsif kind = 'run' then
    names := array['carries', 'yards', 'touchdowns'];
    select array_agg(code order by zone_idx) into codes from ref.run_zone;
  else
    raise exception 'kind must be pass or run, not %', kind;
  end if;
  while pos < len loop
    z := get_byte(cells, pos); pos := pos + 1;
    cell := '{}';
    for k in 1..cardinality(names) loop
      v := 0; sh := 0;
      loop
        b := get_byte(cells, pos); pos := pos + 1;
        v := v | ((b & 127) << sh); sh := sh + 7;
        exit when b < 128;
      end loop;
      if names[k] = 'yards' then v := (v >> 1) # -(v & 1); end if;   -- zigzag
      cell := cell || jsonb_build_object(names[k], v);
    end loop;
    res := res || jsonb_build_object(codes[z + 1], cell);
  end loop;
  return res;
end $$;
comment on function core.pass_run_cells_json(text, bytea) is 'Unpacks the cells of core.pass_run_* into {zone: {count name: number}}; kind is pass or run (see migration 081).';

-- ---------------------------------------------------------------- tables
create table if not exists core.pass_run_season (
  season_id      integer not null references core.season on delete cascade,
  phase          core.season_phase not null check (phase in ('regular', 'playoffs')),
  plays          integer not null,   -- passes and runs of the season's games in nflverse's file (kicks, punts, kneel-downs, spikes, no-plays excluded)
  pass_attempts  integer not null,   -- two-point tries excluded
  pass_located   integer not null,   -- ... with a pass location and air yards: the passes core.pass_run_league and _team count (0 before 2006)
  runs           integer not null,
  run_located    integer not null,   -- ... up the middle, or left or right with a gap: the runs the other tables count
  source_id      smallint not null references meta.source,
  primary key (season_id, phase)
);
comment on table core.pass_run_season is 'How many passes and runs each NFL season has in nflverse''s play-by-play, and how many carry a location. The rest are holes.';

create table if not exists core.pass_run_league (
  season_id  integer not null references core.season on delete cascade,
  phase      core.season_phase not null check (phase in ('regular', 'playoffs')),
  kind       text not null check (kind in ('pass', 'run')),
  n          integer not null,       -- located plays
  cells      bytea not null,         -- counts by zone, packed (see the top of this file)
  source_id  smallint not null references meta.source,
  primary key (season_id, phase, kind)
);
comment on table core.pass_run_league is 'The league''s located passes and runs of a season: counts by pass zone or run zone, packed in cells.';

create table if not exists core.pass_run_team (
  team_season_id  integer not null references core.team_season on delete cascade,
  phase           core.season_phase not null check (phase in ('regular', 'playoffs')),
  role            text not null check (role in ('off', 'def')),   -- off: plays the club ran; def: plays run against it
  kind            text not null check (kind in ('pass', 'run')),
  n               integer not null,
  cells           bytea not null,
  source_id       smallint not null references meta.source,
  primary key (team_season_id, phase, role, kind)
);
comment on table core.pass_run_team is 'A club''s located passes and runs of a season, as the offence (off) and as the defence (def): counts by pass zone or run zone, packed in cells.';

create table if not exists core.pass_run_player_id (
  gsis_id    text primary key,       -- nflverse / NFL.com gsis player id (00-0033873)
  person_id  bigint references core.person on delete set null,   -- null until the id is matched to a person (core.external_id key 'gsis:<id>')
  name       text not null           -- the name as nflverse writes it (T.Brady)
);
comment on table core.pass_run_player_id is 'The players of core.pass_run_player: nflverse gsis id, the core.person it is matched to (null when not matched) and the name as nflverse writes it.';

create table if not exists core.pass_run_player (
  gsis_id    text not null references core.pass_run_player_id on delete cascade,
  season_id  integer not null references core.season on delete cascade,
  role       text not null check (role in ('pass', 'rec', 'rush')),   -- pass: passes he threw; rec: passes thrown to him (targets); rush: his carries. Regular season only
  n          integer not null,
  cells      bytea not null,
  source_id  smallint not null references meta.source,
  primary key (gsis_id, season_id, role)
);
comment on table core.pass_run_player is 'A player''s located passes thrown (pass), targets (rec) and carries (rush) of an NFL regular season, all clubs together: counts by pass zone or run zone, packed in cells. For rec, attempts are targets and completions receptions.';

-- ---------------------------------------------------------------- api
create or replace view api.pass_zone as select zone_idx, code from ref.pass_zone;
create or replace view api.run_zone as select zone_idx, code from ref.run_zone;

create or replace view api.pass_run_season as
select s.start_year as year, b.phase::text as phase, b.plays, b.pass_attempts, b.pass_located, b.runs, b.run_located, src.code as source
from core.pass_run_season b
join core.season s using (season_id)
join meta.source src on src.source_id = b.source_id;

create or replace view api.pass_run_league as
select s.start_year as year, b.phase::text as phase, b.kind, b.n, core.pass_run_cells_json(b.kind, b.cells) as zones, src.code as source
from core.pass_run_league b
join core.season s using (season_id)
join meta.source src on src.source_id = b.source_id;

create or replace view api.pass_run_team as
select b.team_season_id, ts.franchise_id, s.start_year as year, b.phase::text as phase, b.role, b.kind, b.n,
       core.pass_run_cells_json(b.kind, b.cells) as zones, src.code as source
from core.pass_run_team b
join core.team_season ts using (team_season_id)
join core.season s on s.season_id = ts.season_id
join meta.source src on src.source_id = b.source_id;

create or replace view api.pass_run_player as
select b.gsis_id, i.person_id, i.name, s.start_year as year, b.role, b.n,
       core.pass_run_cells_json(case b.role when 'rush' then 'run' else 'pass' end, b.cells) as zones, src.code as source
from core.pass_run_player b
join core.pass_run_player_id i using (gsis_id)
join core.season s using (season_id)
join meta.source src on src.source_id = b.source_id;

grant select on api.pass_zone, api.run_zone, api.pass_run_season, api.pass_run_league, api.pass_run_team, api.pass_run_player to anon, authenticated;

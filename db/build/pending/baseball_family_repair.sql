-- DS1 repair, not a build step (it lives in pending/, so build_core.sh never runs it): splits the baseball family out of MLB in place and folds the
-- ghost franchises. Run once, after db/build/139_baseball_leagues.sql and before the rerun of 140 (the steps and their order are in the hand-off).
-- Run with: bash scripts/mac/ds1-apply.sh db/build/pending/baseball_family_repair.sql [--dry-run]   (DS1 only; one transaction, no begin or commit here;
-- from the repository root, because of \copy).
--
-- What it does (every id stays: game, team season, franchise_identity of the surviving franchises):
--  1. a core.season for each year of the National Association, American Association, Union Association, Players' League and Federal League;
--  2. the Retrosheet games of those leagues move to the season of their league (update season_id), and so do the team seasons that played them;
--  2b. a Retrosheet team id that a club of its own uses from a year on (BR4: the Brooklyn Gladiators of 1890, whose games step 140 filed under the
--     Dodgers because the names file gives BR4 to the Dodgers' 1888-89 years) gets a franchise of its own and a team season; the Dodgers' 1890
--     team season keeps the National League games;
--  3. each Retrosheet team id that db/seed/baseball_club.csv folds into another (the Cardinals' American Association years logged as SL4 beside
--     SLN, Louisville, Washington, the Cleveland Spiders, the Boston Reds, Baltimore) stops being a franchise of its own: its team seasons and every
--     other row that points at it go to the surviving franchise (a row that would clash with one the survivor already has is dropped), the franchise,
--     its identities, its league memberships and its external id go;
--  4. the National Association's empty MLB seasons (1871-75) are removed;
--  5. the remembered ids (ingest.row_id_map) of the rows that left their natural key are forgotten; db/build/221 remembers the new keys.
-- Afterwards, in this order: 140, 155, 165, 167, 172, 175_team_brand, 175_team_logo_extra, 175_team_logo_fit, 178, 183, 190 to 192, 198, 199, 209, 212, 222, 221,
-- then refresh the api views. A rerun of this file changes nothing.
-- It switches no foreign keys off.

create temp table club_seed (team_id text primary key, into_team_id text, from_year integer, note text);
\copy club_seed from 'db/seed/baseball_club.csv' with (format csv, header true)
create temp table fold as select team_id, into_team_id, note from club_seed where into_team_id is not null;
create temp table own as select team_id, from_year from club_seed where into_team_id is null;
create temp table src as select source_id from meta.source where code = 'retrosheet';

do $$
begin
  if not exists (select 1 from ref.league where league_code in ('na', 'aa', 'ua', 'pl', 'fl') having count(*) = 5) then
    raise exception 'the leagues na, aa, ua, pl and fl are missing: run db/build/139_baseball_leagues.sql first';
  end if;
end $$;

-- 1. The Retrosheet games of the five leagues, with the core game each one is (the same key step 140 builds).
create temp table gl as
select g.game_id, lower(l.home_league) as lg, extract(year from l.game_date)::int as yr, g.home_team_season_id as h, g.away_team_season_id as a,
       l.home as hid, l.visitor as aid
from core.external_id e
join core.game g on g.game_id = e.entity_id
join legacy_retrosheet.game_log l
  on to_char(l.game_date, 'YYYYMMDD') || ':' || l.home || ':' || l.visitor || ':' || l.game_number || ':' || l.game_type = e.external_key
where e.entity_kind = 'game' and e.source_id = (select source_id from src) and l.home_league in ('NA', 'AA', 'UA', 'PL', 'FL');

insert into core.season (league_code, start_year, end_year, label, source_id)
select lg, yr, yr, yr::text, (select source_id from src) from gl group by lg, yr
on conflict (league_code, start_year) do nothing;

-- 2b. A club of its own: its franchise, its team season in the league and year, and its games' sides (the other side keeps its team season)
insert into core.franchise (sport_code, source_id, source_key)
select 'baseball', (select source_id from src), o.team_id from own o
where not exists (select 1 from core.franchise f where f.source_id = (select source_id from src) and f.source_key = o.team_id);
create temp table own_side as
select gl.game_id, 'h' as side, gl.lg, gl.yr, f.franchise_id from gl join own o on o.team_id = gl.hid and gl.yr >= o.from_year
  join core.franchise f on f.source_id = (select source_id from src) and f.source_key = o.team_id
union all
select gl.game_id, 'a', gl.lg, gl.yr, f.franchise_id from gl join own o on o.team_id = gl.aid and gl.yr >= o.from_year
  join core.franchise f on f.source_id = (select source_id from src) and f.source_key = o.team_id;
insert into core.team_season (franchise_id, season_id, source_id)
select distinct os.franchise_id, ns.season_id, (select source_id from src)
from own_side os join core.season ns on ns.league_code = os.lg and ns.start_year = os.yr
on conflict (franchise_id, season_id) do nothing;
update core.game g set home_team_season_id = t.team_season_id
from own_side os join core.season ns on ns.league_code = os.lg and ns.start_year = os.yr
join core.team_season t on t.franchise_id = os.franchise_id and t.season_id = ns.season_id
where os.side = 'h' and g.game_id = os.game_id and g.home_team_season_id <> t.team_season_id;
update core.game g set away_team_season_id = t.team_season_id
from own_side os join core.season ns on ns.league_code = os.lg and ns.start_year = os.yr
join core.team_season t on t.franchise_id = os.franchise_id and t.season_id = ns.season_id
where os.side = 'a' and g.game_id = os.game_id and g.away_team_season_id <> t.team_season_id;

-- 2. Team seasons: the league of a team season is the league of its games. One in two leagues would be a mistake in the data: stop.
create temp table tsl as
select x.ts as team_season_id, x.lg, x.yr, ns.season_id as new_season_id, t.season_id as old_season_id, t.franchise_id,
       t.franchise_id || '/' || t.season_id as old_key
from (select h as ts, lg, yr from gl where not exists (select 1 from own_side os where os.game_id = gl.game_id and os.side = 'h')
      union select a, lg, yr from gl where not exists (select 1 from own_side os where os.game_id = gl.game_id and os.side = 'a')) x
join core.team_season t on t.team_season_id = x.ts
join core.season ns on ns.league_code = x.lg and ns.start_year = x.yr;
do $$
begin
  if exists (select 1 from tsl group by team_season_id having count(*) > 1) then
    raise exception 'a team season has games in two leagues';
  end if;
end $$;

update core.game g set season_id = ns.season_id
from gl join core.season ns on ns.league_code = gl.lg and ns.start_year = gl.yr
where g.game_id = gl.game_id and g.season_id <> ns.season_id;
update core.team_season t set season_id = m.new_season_id from tsl m where t.team_season_id = m.team_season_id and t.season_id <> m.new_season_id;

-- 3. Fold the ghost franchises. keep_id: a current club's franchise (named by its Retrosheet franchise code), or the defunct club's own.
create temp table ghost as
select gf.franchise_id as ghost_id, gf.source_key as ghost_key,
       coalesce(
         (select e.entity_id::int from core.external_id e
           where e.entity_kind = 'franchise' and e.source_id = (select source_id from src)
             and e.external_key = 'franchise:' || (select c.franchise_id from legacy_retrosheet.current_name c where c.team_id = f.into_team_id limit 1)),
         (select k.franchise_id from core.franchise k where k.source_id = (select source_id from src) and k.source_key = f.into_team_id)) as keep_id
from fold f join core.franchise gf on gf.source_id = (select source_id from src) and gf.source_key = f.team_id;
do $$
begin
  if exists (select 1 from ghost where keep_id is null or keep_id = ghost_id) then
    raise exception 'a folded Retrosheet team id has no surviving franchise';
  end if;
end $$;
-- the keys the map must forget: the ghost franchise, its identities, and the team seasons whose franchise changes
create temp table forget (tbl text, natural_key text);
insert into forget select 'core.franchise', (select source_id from src) || '/' || ghost_key from ghost;
insert into forget select 'core.franchise_identity', i.franchise_id || '/' || coalesce(lower(i.valid_during)::text, '')
from core.franchise_identity i where i.franchise_id in (select ghost_id from ghost);
insert into forget select 'core.team_season', old_key from tsl;

update core.team_season set franchise_identity_id = null where franchise_id in (select ghost_id from ghost);
update core.team_season t set franchise_id = g.keep_id from ghost g where t.franchise_id = g.ghost_id;

-- every other row that points at a ghost: moved to the survivor, or dropped when it clashes with a row the survivor already has
do $$
declare r record; g record; x record; moved bigint := 0; dropped bigint := 0;
begin
  for r in
    select c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'core.franchise'::regclass and cardinality(c.conkey) = 1
      and c.conrelid not in ('core.franchise_identity'::regclass, 'core.franchise_league'::regclass, 'core.team_season'::regclass)
    order by 1, 2
  loop
    for g in select * from ghost loop
      for x in execute format('select ctid as id from %s where %I = $1', r.tbl, r.col) using g.ghost_id loop
        begin
          execute format('update %s set %I = $2 where ctid = $1', r.tbl, r.col) using x.id, g.keep_id;
          moved := moved + 1;
        exception when unique_violation or exclusion_violation then
          execute format('delete from %s where ctid = $1', r.tbl) using x.id;
          dropped := dropped + 1;
        end;
      end loop;
    end loop;
  end loop;
  raise notice 'franchise fold: % rows moved to the surviving franchise, % dropped as clashes', moved, dropped;
end $$;

delete from core.external_id e using ghost g where e.entity_kind = 'franchise' and e.entity_id = g.ghost_id;
delete from core.franchise_identity where franchise_id in (select ghost_id from ghost);
delete from core.franchise where franchise_id in (select ghost_id from ghost);

-- a moved team season takes the surviving club's name of that year where one covers it (step 140 settles the rest)
update core.team_season ts set franchise_identity_id = (
  select i.franchise_identity_id from core.franchise_identity i join core.season s on s.season_id = ts.season_id
  where i.franchise_id = ts.franchise_id and i.valid_during && daterange(make_date(s.start_year, 1, 1), make_date(s.start_year + 1, 1, 1))
  order by upper(i.valid_during) desc nulls first limit 1)
where ts.franchise_identity_id is null and ts.franchise_id in (select keep_id from ghost) and ts.team_season_id in (select team_season_id from tsl);

-- 4. The National Association's MLB seasons are empty now. The derived venue tables are rebuilt by step 209.
delete from core.venue_game_season where season_id in (select season_id from core.season where league_code = 'mlb' and start_year between 1871 and 1875);
delete from core.venue_final_game where season_id in (select season_id from core.season where league_code = 'mlb' and start_year between 1871 and 1875);
insert into forget select 'core.season', 'mlb/' || start_year from core.season s
where s.league_code = 'mlb' and s.start_year between 1871 and 1875
  and not exists (select 1 from core.game g where g.season_id = s.season_id) and not exists (select 1 from core.team_season t where t.season_id = s.season_id);
delete from core.season s
where s.league_code = 'mlb' and s.start_year between 1871 and 1875
  and not exists (select 1 from core.game g where g.season_id = s.season_id) and not exists (select 1 from core.team_season t where t.season_id = s.season_id);

-- 5. Forget the remembered ids of keys that are gone (a key still in use is kept: its id did not change)
delete from ingest.row_id_map m using forget f
where m.tbl = f.tbl and m.natural_key = f.natural_key
  and not exists (select 1 from ingest.row_id_current c where c.tbl = m.tbl and c.natural_key = m.natural_key);

select 'new seasons by league' as what, string_agg(lg || ' ' || n, ', ' order by lg) as n from (select lg, count(distinct yr) n from gl group by lg) z
union all select 'games of the five leagues in their league', count(*)::text from gl join core.game g using (game_id) join core.season s using (season_id) where s.league_code = gl.lg
union all select 'team seasons moved', count(*)::text from tsl
union all select 'ghost franchises folded', count(*)::text from ghost
union all select 'ghost franchises left', count(*)::text from core.franchise f join fold on f.source_key = fold.team_id and f.source_id = (select source_id from src)
union all select 'mlb seasons', count(*)::text from core.season where league_code = 'mlb'
union all select 'team seasons still in mlb 1871-75', count(*)::text from core.team_season t join core.season s using (season_id) where s.league_code = 'mlb' and s.start_year between 1871 and 1875;

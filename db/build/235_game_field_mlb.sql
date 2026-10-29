-- The MLB game page's batted balls (core.game_field, kind 'mlb_balls'), from legacy_retrosheet.batted_ball. Run from the repo root, after the steps
-- that write MLB games (140). Needs migrations 071 and 164. Rerunnable: a game's row is written in place (insert or update), a game that no longer has
-- a located ball loses its row, and no other kind of row is touched. Nothing else changes: a game keeps its id (core.game_field takes the game's id).
--
-- Source: Retrosheet's play-by-play event files, 1986-2025. Retrosheet's notice (meta.source 'retrosheet'): "The information used here was obtained
-- free of charge from and is copyrighted by Retrosheet. Interested parties may contact Retrosheet at www.retrosheet.org." Dense from 1989; 1986-88
-- are partial (db/migrations/071). A ball whose play has no location on the diagram is not drawn and not counted.
--
-- A game is found as in db/build/202 and 184: Retrosheet's game id is the home club's code, the date and the game's number in the day (BAL198704060),
-- and a core.game written from Retrosheet's logs has the source_key retro:<yyyymmdd>:<home>:<visitor>:<number>:<type>. All-star games are not in core.
--
-- data (read by web/src/lib/fieldPlays.ts): the balls in the order they were hit, separated by ';', each
--     <inning>,<half>,<zone>,<trajectory>,<result>,<batter's person id, or empty>
--   half 0 the visitors bat, 1 the home team; zone one of ref.hit_zone's codes (8D, 56S, 7LS); trajectory G ground ball, L line drive, F fly ball,
--   P pop-up, BG BP BL a bunted ball; result o out, s single, d double, t triple, h home run, e reached on an error, f fielder's choice.
-- Load order and commands (DS1, through scripts/mac/ds1-apply.sh, --dry-run first): migration 164, then this step.

create temp table src on commit drop as select source_id from meta.source where code = 'retrosheet';

create temp table rg on commit drop as
select g.game_id, split_part(g.source_key, ':', 3) || split_part(g.source_key, ':', 2) || split_part(g.source_key, ':', 5) as rid
from core.game g
where g.source_id = (select source_id from src) and g.source_key like 'retro:%';
create unique index on rg (rid);

create temp table lp on commit drop as
select retroid, min(playerid) as playerid from legacy_lahman.people where retroid is not null and retroid <> '' group by 1;
create temp table pmap on commit drop as
select i.id, coalesce(x.entity_id, via.entity_id) as person_id
from (select distinct batter as id from legacy_retrosheet.batted_ball where zone is not null and game_type <> 'allstar') i
left join core.external_id x on x.entity_kind = 'person' and x.source_id = (select source_id from src) and x.external_key = i.id
left join lp on lp.retroid = i.id
left join core.external_id via on via.entity_kind = 'person' and via.source_id = (select source_id from meta.source where code = 'lahman') and via.external_key = lp.playerid;
create unique index on pmap (id);

create temp table game_field_new on commit drop as
select rg.game_id, min(b.season)::smallint as season, count(*)::smallint as n,
       string_agg(b.inning || ',' || b.half || ',' || b.zone || ',' || b.traj || ',' ||
                  case b.result when 'out' then 'o' when 'single' then 's' when 'double' then 'd' when 'triple' then 't' when 'home_run' then 'h'
                                when 'error' then 'e' else 'f' end || ',' || coalesce(pm.person_id::text, ''), ';' order by b.seq) as data
from legacy_retrosheet.batted_ball b
join rg on rg.rid = b.game_id
left join pmap pm on pm.id = b.batter
where b.zone is not null and b.game_type <> 'allstar'
group by rg.game_id;

insert into core.game_field (game_id, kind, season, n, data)
select game_id, 'mlb_balls', season, n, data from game_field_new
on conflict (game_id, kind) do update set season = excluded.season, n = excluded.n, data = excluded.data
where (core.game_field.season, core.game_field.n, core.game_field.data) is distinct from (excluded.season, excluded.n, excluded.data);

delete from core.game_field f
where f.kind = 'mlb_balls' and not exists (select 1 from game_field_new x where x.game_id = f.game_id);

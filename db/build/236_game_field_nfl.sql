-- The NFL game page's drives (core.game_field, kind 'nfl_drives'), from legacy_nflverse.pbp_drive. Run from the repo root, after the steps that write
-- NFL games (150). Needs migration 164 and legacy_nflverse.pbp_drive loaded by scripts/nflverse/pbp_drive.py. Rerunnable: a
-- game's row is written in place, a game with no drive left loses its row, and no other kind of row is touched. A game keeps its id.
--
-- Source: nflverse's play-by-play (pbp release), 1999-2025, CC BY 4.0, "nflverse (CC BY 4.0), data from NFL.com" (meta.source 'nflverse').
-- A game is found through core.external_id (entity_kind 'game', source nflverse, the nflverse game id season_week_away_home), which db/build/150 writes
-- for the games it adds (source_key nflverse:<id>) and for SPX's own games it matched (same season, date, home and away franchise), so the seasons SPX
-- holds (2002-2011) are found too. A nflverse game with drives that no core game has is logged in meta.data_issue ('game_field_nfl', the nflverse id; one
-- row each, kept between reruns) and not drawn. Never guessed.
--
-- data (read by web/src/lib/fieldPlays.ts): the drives in the order played, separated by ';', each
--     <drive>,<side>,<quarter>,<clock>,<result>,<start>,<end>,<plays>,<first downs>,<seconds>,<scored>,<lines of scrimmage>
--   side 0 the visitors have the ball, 1 the home team; quarter 5 is overtime; clock the game clock at the start (mm:ss); start, end and the lines of
--   scrimmage (space separated) are yards from the opponent's end line (pbp_drive.start_yd, end_yd, los); seconds the time of possession; scored 1 or 0;
--   result T touchdown, F field goal, M missed field goal, P punt, X turnover, D turnover on downs, H end of half, S safety, O opponent's touchdown
--   (a turnover returned for a score), ? when nflverse gives none.
-- Load order and commands (DS1, through scripts/mac/ds1-apply.sh, --dry-run first): migration 164, scripts/nflverse/pbp_drive.py and its load.sql
-- (--force), then this step.

create temp table src on commit drop as select source_id from meta.source where code = 'nflverse';

create temp table game_field_new on commit drop as
select g.entity_id as game_id, min(d.season)::smallint as season, count(*)::smallint as n,
       string_agg(d.drive || ',' || (d.posteam_type = 'home')::int || ',' || coalesce(d.qtr::text, '') || ',' || coalesce(d.clock, '') || ',' ||
                  case d.result when 'Touchdown' then 'T' when 'Field goal' then 'F' when 'Missed field goal' then 'M' when 'Punt' then 'P' when 'Turnover' then 'X'
                                when 'Turnover on downs' then 'D' when 'End of half' then 'H' when 'Safety' then 'S' when 'Opp touchdown' then 'O' else '?' end || ',' ||
                  d.start_yd || ',' || d.end_yd || ',' || coalesce(d.plays::text, '') || ',' || coalesce(d.first_downs::text, '') || ',' || coalesce(d.top_secs::text, '') || ',' ||
                  coalesce(d.scored::int::text, '') || ',' || d.los, ';' order by d.drive) as data
from legacy_nflverse.pbp_drive d
join core.external_id g on g.entity_kind = 'game' and g.source_id = (select source_id from src) and g.external_key = d.game_id
group by g.entity_id;

insert into core.game_field (game_id, kind, season, n, data)
select game_id, 'nfl_drives', season, n, data from game_field_new
on conflict (game_id, kind) do update set season = excluded.season, n = excluded.n, data = excluded.data
where (core.game_field.season, core.game_field.n, core.game_field.data) is distinct from (excluded.season, excluded.n, excluded.data);

delete from core.game_field f
where f.kind = 'nfl_drives' and not exists (select 1 from game_field_new x where x.game_id = f.game_id);

-- nflverse games with drives that no core game has: logged once each, and cleared when a later run finds the game.
create temp table game_field_lost on commit drop as
select distinct d.game_id as nid
from legacy_nflverse.pbp_drive d
where not exists (select 1 from core.external_id e where e.entity_kind = 'game' and e.source_id = (select source_id from src) and e.external_key = d.game_id);
delete from meta.data_issue i
where i.entity_kind = 'game_field_nfl' and not exists (select 1 from game_field_lost l where l.nid = i.entity_key);
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game_field_nfl', l.nid, 'nflverse game with drives has no game in core', 'Drives not drawn'
from game_field_lost l
where not exists (select 1 from meta.data_issue i where i.entity_kind = 'game_field_nfl' and i.entity_key = l.nid);

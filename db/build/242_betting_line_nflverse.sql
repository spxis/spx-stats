-- NFL betting lines from nflverse (CC BY 4.0, 1999 on): the spread, total and moneylines of legacy_nflverse.game's own columns, one line a game, as published.
-- No new download: the columns are in the `row` of every game of the games.csv already archived (nflverse_load.py keeps every column). Runs after 150 (the games
-- and their nflverse ids in core.external_id) and after 100-140 (SPX's lines stay; both sources are kept side by side).
-- nflverse: spread_line is from the home side's view (positive = home favoured), total_line the total, moneylines the home and away prices. A line is stored as the
-- source states it: the favourite and the favourite's money line only where the spread names a favourite (a pick'em has none); the underdog's money line, the prices on the
-- spread and the total, and the moment (open or close: nflverse does not say) are not stored. No fetch, no estimate, no copy from any other source.
-- A rerun keeps every line's id (an existing row is updated in place; a row whose game was deleted and added again gets the id ingest.row_id_map remembers) and deletes only
-- this source's lines for games nflverse no longer lists. Run from anywhere; DS1 only (reads legacy_nflverse, ingest). Needs migration 196 and 221 afterwards.
begin;

create temp table src as select source_id from meta.source where code = 'nflverse';

create temp table nl as
select e.entity_id::bigint as game_id, 'nflverse:line:' || g.game_id as source_key,
       nullif(g.row->>'spread_line', '')::numeric as spread, nullif(g.row->>'total_line', '')::numeric as total,
       nullif(g.row->>'home_moneyline', '')::numeric::integer as hml, nullif(g.row->>'away_moneyline', '')::numeric::integer as aml
from legacy_nflverse.game g
join core.external_id e on e.entity_kind = 'game' and e.source_id = (select source_id from src) and e.external_key = g.game_id;
delete from nl where spread is null and total is null and hml is null and aml is null;

create temp table want as
select game_id, source_key,
       case when spread > 0 then 'home' when spread < 0 then 'away' end as favourite,
       abs(spread) as point_spread,
       case when spread > 0 then hml when spread < 0 then aml end as favourite_money_line,
       total
from nl;

update core.betting_line b
set game_id = w.game_id, favourite = w.favourite, point_spread = w.point_spread, favourite_money_line = w.favourite_money_line, total = w.total
from want w
where b.source_id = (select source_id from src) and b.source_key = w.source_key
  and (b.game_id, b.favourite, b.point_spread, b.favourite_money_line, b.total) is distinct from (w.game_id, w.favourite, w.point_spread, w.favourite_money_line, w.total);

delete from core.betting_line b
where b.source_id = (select source_id from src) and b.source_key like 'nflverse:line:%'
  and not exists (select 1 from want w where w.source_key = b.source_key);

insert into core.betting_line (betting_line_id, game_id, source_id, source_key, favourite, point_spread, favourite_money_line, total)
overriding system value
select coalesce(m.row_id, nextval(pg_get_serial_sequence('core.betting_line', 'betting_line_id'))),
       w.game_id, (select source_id from src), w.source_key, w.favourite, w.point_spread, w.favourite_money_line, w.total
from want w
left join ingest.row_id_map m on m.tbl = 'core.betting_line' and m.natural_key = (select source_id from src)::text || '/' || w.source_key
     and not exists (select 1 from core.betting_line y where y.betting_line_id = m.row_id)
where not exists (select 1 from core.betting_line b where b.source_id = (select source_id from src) and b.source_key = w.source_key);

select 'nflverse lines' as what, count(*) as n from core.betting_line where source_id = (select source_id from src);
commit;

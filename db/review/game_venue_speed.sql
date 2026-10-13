-- Read-only (run with ds1-apply.sh --dry-run): how fast a venue page can list its games, and how big the game-venue tables are.
-- Fenway Park is Wikidata Q49136. Expect a few tens of milliseconds for about 10,000 games; the budget for an hourly-ISR page is 1 second.
explain (analyze, buffers, costs off)
select count(*) from api.venue_game where venue_id = (select venue_id from core.venue where source_key = 'Q49136');

explain (analyze, buffers, costs off)
select * from api.venue_game where venue_id = (select venue_id from core.venue where source_key = 'Q49136') order by game_date desc limit 50;

explain (analyze, buffers, costs off)
select * from api.game_venue where game_id = (select min(game_id) from core.game where game_date = '2004-10-20');

select 'core.game' as tbl, count(*) as n, pg_size_pretty(pg_total_relation_size('core.game')) as total from core.game
union all select 'core.game_venue', count(*), pg_size_pretty(pg_total_relation_size('core.game_venue')) from core.game_venue
union all select 'core.franchise_home_venue', count(*), pg_size_pretty(pg_total_relation_size('core.franchise_home_venue')) from core.franchise_home_venue
union all select 'core.venue', count(*), pg_size_pretty(pg_total_relation_size('core.venue')) from core.venue
union all select 'core.venue_name', count(*), pg_size_pretty(pg_total_relation_size('core.venue_name')) from core.venue_name;

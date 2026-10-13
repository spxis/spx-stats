-- what: world soccer stadiums (scripts/world_stadiums/): a pitch size for an item that is not a venue, a pitch size that a football pitch cannot have, a venue
--       that closed before it opened, a soccer match with a venue_id but no Wikidata id, and a match whose venue_id is not the venue of its Wikidata id (or of
--       the item db/seed/soccer_venue_fix.csv gives for it). Run after db/build/206 (and 207, once it has been applied).
-- baseline: 0
drop table if exists pg_temp.seed_fix;
create temp table seed_fix (match_wikidata_id text, venue_wikidata_id text, why text);
\copy seed_fix from 'db/seed/soccer_venue_fix.csv' with (format csv, header true)

select 'pitch for an item that is not a venue: ' || p.wikidata_id as problem
from core.venue_pitch p
where not exists (select 1 from core.venue v where v.source_key = p.wikidata_id and v.source_id = (select source_id from meta.source where code = 'wikidata'))
union all
select 'pitch a football pitch cannot have: ' || p.wikidata_id || ' ' || p.length_m || ' x ' || p.width_m
from core.venue_pitch p
where p.length_m < p.width_m or p.length_m not between 90 and 120 or p.width_m not between 50 and 90
union all
select 'venue closed before it opened: ' || v.source_key
from core.venue v
where v.opened_on is not null and v.closed_on is not null and v.closed_on < v.opened_on
union all
select 'soccer match venue_id without a Wikidata id: ' || m.source_key
from core.soccer_match m
where m.venue_id is not null and m.venue_wikidata_id is null
union all
select 'soccer match venue_id of another item: ' || m.source_key || ' ' || m.venue_wikidata_id || ' -> ' || v.source_key
from core.soccer_match m
join core.venue v on v.venue_id = m.venue_id
left join seed_fix f on f.match_wikidata_id = m.venue_wikidata_id
where m.venue_wikidata_id is not null and v.source_key <> coalesce(f.venue_wikidata_id, m.venue_wikidata_id);

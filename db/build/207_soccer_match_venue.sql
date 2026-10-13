-- core.soccer_match.venue_id: the venue of every World Cup and MLS match, by Wikidata id. Run from the repo root; rerunnable.
-- Run it ONLY after the soccer data (World Cup 200, MLS 205) and the world stadium venues (db/build/198 and 206, scripts/world_stadiums/README.md) have reached
-- PRODUCTION: a data release of core.soccer_match carries venue_id, and a venue_id that points at a core.venue row production lacks would break it.
-- It writes one column of one table, only where it is null, and meta.data_issue ('soccer_match_venue'); no other column or table of core.soccer_*.
--
--   venue_id  = the core.venue whose source_key is the match's venue_wikidata_id (source wikidata), or, when db/seed/soccer_venue_fix.csv names a
--               better item for that id (a link that led to a disambiguation page, a club or a competition), the venue of the fixed item.
--   A match that already has a venue_id keeps it. A match with no venue_wikidata_id stays null (its source gave the stadium only as text).
--   Logged, one row per distinct item or name: an item with no core.venue ('Wikidata item Q.. is not a venue ...'), and a stadium the source
--   names without a Wikidata link ('stadium "X, Y" has no Wikidata id') so its source can be made to link it.

drop table if exists pg_temp.seed_fix;
create temp table seed_fix (match_wikidata_id text, venue_wikidata_id text, why text);
\copy seed_fix from 'db/seed/soccer_venue_fix.csv' with (format csv, header true)

create temp table wd as select source_id from meta.source where code = 'wikidata';

update core.soccer_match m set venue_id = v.venue_id
from seed_fix f right join (select distinct venue_wikidata_id as qid from core.soccer_match where venue_id is null and venue_wikidata_id is not null) q on q.qid = f.match_wikidata_id
join core.venue v on v.source_id = (select source_id from wd) and v.source_key = coalesce(f.venue_wikidata_id, q.qid)
where m.venue_id is null and m.venue_wikidata_id = q.qid;

delete from meta.data_issue where entity_kind = 'soccer_match_venue';
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wd), 'soccer_match_venue', m.venue_wikidata_id,
       'Wikidata item ' || m.venue_wikidata_id || ' (' || (array_agg(m.venue_name order by m.match_date))[1] || ', ' || count(*) || ' matches) is not a venue in core.venue',
       'venue_id left null. See meta.data_issue world_venue for the reason, or db/seed/soccer_venue_fix.csv for a link that led to the wrong item.'
from core.soccer_match m
where m.venue_id is null and m.venue_wikidata_id is not null
group by m.venue_wikidata_id;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wd), 'soccer_match_venue', 'name:' || t.league_code || ':' || m.venue_name || coalesce(', ' || m.venue_city, ''),
       'Stadium "' || m.venue_name || coalesce(', ' || m.venue_city, '') || '" (' || count(*) || ' ' || t.league_code || ' matches) has no Wikidata id in its source',
       'venue_id left null; the match build would need a link for this stadium.'
from core.soccer_match m join core.soccer_tournament t using (tournament_id)
where m.venue_id is null and m.venue_wikidata_id is null and m.venue_name is not null
group by t.league_code, m.venue_name, m.venue_city;

select t.league_code as league, count(*) as matches, count(m.venue_id) as with_venue, count(*) filter (where m.venue_id is null and m.venue_wikidata_id is not null) as qid_no_venue,
       count(*) filter (where m.venue_wikidata_id is null) as no_qid
from core.soccer_match m join core.soccer_tournament t using (tournament_id)
group by t.league_code order by 1;

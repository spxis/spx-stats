-- core.soccer_match.venue_id: the venue of every World Cup and MLS match, by Wikidata id. Run from the repo root; rerunnable.
-- Run it ONLY after the soccer data (World Cup 200, MLS 205) and the world stadium venues (db/build/198 and 206, scripts/world_stadiums/README.md) have reached
-- PRODUCTION: a data release of core.soccer_match carries venue_id, and a venue_id that points at a core.venue row production lacks would break it.
-- It writes one column of one table, only where it is null, and meta.data_issue ('soccer_match_venue'); no other column or table of core.soccer_*.
--
--   venue_id  = the core.venue whose source_key is the match's venue_wikidata_id (source wikidata), or, when db/seed/soccer_venue_fix.csv names a
--               better item for that id (a link that led to a disambiguation page, a club or a competition), the venue of the fixed item.
--   A match that already has a venue_id keeps it.
--   A match with no venue_wikidata_id (its source gave the stadium only as text) is then matched BY EXACT NAME, second pass, still only where venue_id is null:
--     the name (core.fold_text: lower case, accents removed, punctuation and repeated spaces collapsed; Stadium/Field/Park are kept) must equal a
--     core.venue_name name of some venue. Tier 'in period': names whose valid_during contains the match date. Only when no venue has such a name,
--     tier 'any time': names valid in any period (a stadium the match source calls by a name the venue carried before or after). Where the match has a
--     venue_city, only venues whose city equals it (core.fold_text) count. venue_id is filled ONLY when exactly one venue is left; two or more
--     (ambiguous) or none (unmatched, or the name exists only in another city) leave it null. Nothing is guessed.
--   Logged, one row per distinct item or name: an item with no core.venue ('Wikidata item Q.. is not a venue ...'), and a stadium the source
--   names without a Wikidata link ('stadium "X, Y" has no Wikidata id') so its source can be made to link it.
--   Name pass, meta.data_issue 'soccer_match_venue_name' (rebuilt on every run from the matches, so a rerun logs the same rows): 'fill:' one row per
--   distinct name, city, venue and tier filled; 'ambiguous:' / 'unmatched:' / 'city:' one row per distinct name still without a venue, with the match count
--   ('city:' = the name exists but only in another city). db/checks/079_world_venue.sql verifies every name fill.

drop table if exists pg_temp.seed_fix;
create temp table seed_fix (match_wikidata_id text, venue_wikidata_id text, why text);
\copy seed_fix from 'db/seed/soccer_venue_fix.csv' with (format csv, header true)

create temp table wd as select source_id from meta.source where code = 'wikidata';

update core.soccer_match m set venue_id = v.venue_id
from seed_fix f right join (select distinct venue_wikidata_id as qid from core.soccer_match where venue_id is null and venue_wikidata_id is not null) q on q.qid = f.match_wikidata_id
join core.venue v on v.source_id = (select source_id from wd) and v.source_key = coalesce(f.venue_wikidata_id, q.qid)
where m.venue_id is null and m.venue_wikidata_id = q.qid;

-- ---------------------------------------------------------------- second pass: exact venue name (matches with no Wikidata id)
drop table if exists pg_temp.smv_vn, pg_temp.smv_m, pg_temp.smv_cand, pg_temp.smv_any, pg_temp.smv_res;
create temp table smv_vn as
select n.venue_id, n.valid_during, core.fold_text(n.name) as nn, core.fold_text(v.city) as nc
from core.venue_name n join core.venue v using (venue_id)
where core.fold_text(n.name) <> '';
create index on smv_vn (nn);

create temp table smv_m as
select m.match_id, m.match_date, m.venue_name, m.venue_city, m.venue_id as had_venue,
       core.fold_text(m.venue_name) as nn, nullif(core.fold_text(m.venue_city), '') as nc
from core.soccer_match m
where m.venue_wikidata_id is null and core.fold_text(m.venue_name) <> '';

-- every venue sharing the name (any period), city rule NOT applied: tells a wrong city from an unknown name
create temp table smv_any as
select m.match_id, n.venue_id
from smv_m m join smv_vn n on n.nn = m.nn
group by m.match_id, n.venue_id;

-- the venues left once the city rule is applied; in_period = the name was valid on the match date
create temp table smv_cand as
select m.match_id, n.venue_id, bool_or(n.valid_during @> m.match_date) as in_period
from smv_m m join smv_vn n on n.nn = m.nn
where m.nc is null or n.nc = m.nc
group by m.match_id, n.venue_id;

create temp table smv_res as
select m.match_id, m.had_venue,
       case when t1.n = 1 then t1.vid when t1.n = 0 and t2.n = 1 then t2.vid end as venue_id,
       case when t1.n = 1 then 'in period' when t1.n = 0 and t2.n = 1 then 'any time' end as tier,
       case when t1.n = 1 or (t1.n = 0 and t2.n = 1) then 'fill'
            when t1.n > 1 or t2.n > 1 then 'ambiguous'
            when a.n > 0 then 'city'
            else 'unmatched' end as status
from smv_m m
cross join lateral (select count(*) as n, min(venue_id) as vid from smv_cand c where c.match_id = m.match_id and c.in_period) t1
cross join lateral (select count(*) as n, min(venue_id) as vid from smv_cand c where c.match_id = m.match_id) t2
cross join lateral (select count(*) as n from smv_any x where x.match_id = m.match_id) a;

update core.soccer_match m set venue_id = r.venue_id
from smv_res r
where r.match_id = m.match_id and r.status = 'fill' and m.venue_id is null;

delete from meta.data_issue where entity_kind = 'soccer_match_venue_name';
-- fills (a match filled by an earlier run counts too: its venue_id is the one the name resolves to)
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wd), 'soccer_match_venue_name',
       'fill:' || t.league_code || ':' || m.venue_name || coalesce(', ' || m.venue_city, '') || ':' || r.venue_id,
       'Stadium "' || m.venue_name || coalesce(', ' || m.venue_city, '') || '" (' || count(*) || ' ' || t.league_code || ' matches) has no Wikidata id; filled by exact name with venue_id '
         || r.venue_id || ' (' || coalesce(v.source_key, '-') || ', ' || v.city || '), tier: ' || r.tier,
       case r.tier when 'in period' then 'venue_id set: exactly one venue carried this name on the match date' || case when m.venue_city is null then ' (the match has no city to check)' else ' in this city' end
                   else 'venue_id set: no venue carried this name on the match date; exactly one venue carries it in another period' || case when m.venue_city is null then ' (the match has no city to check)' else ', in this city' end end
from smv_res r
join core.soccer_match m using (match_id)
join core.soccer_tournament t using (tournament_id)
join core.venue v on v.venue_id = r.venue_id
where r.status = 'fill' and m.venue_id = r.venue_id
group by t.league_code, m.venue_name, m.venue_city, r.venue_id, v.source_key, v.city, r.tier;
-- names still without a venue
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wd), 'soccer_match_venue_name', r.status || ':' || t.league_code || ':' || m.venue_name,
       'Stadium "' || m.venue_name || '" (' || count(*) || ' ' || t.league_code || ' matches, cities: ' || coalesce(string_agg(distinct m.venue_city, ' / '), 'none') || ') '
         || case r.status when 'ambiguous' then 'matches more than one venue by exact name'
                          when 'city' then 'matches a venue name only in another city'
                          else 'matches no venue name' end
         || case when r.status = 'ambiguous' then ': ' || (select string_agg(distinct c.venue_id::text, ', ') from smv_cand c join smv_res r2 using (match_id)
                                                          join core.soccer_match m2 on m2.match_id = c.match_id
                                                          where m2.venue_name = m.venue_name and r2.status = 'ambiguous') else '' end,
       'venue_id left null; add the name to core.venue_name, or give the match source a Wikidata link for this stadium.'
from smv_res r
join core.soccer_match m using (match_id)
join core.soccer_tournament t using (tournament_id)
where r.status <> 'fill' and m.venue_id is null
group by t.league_code, m.venue_name, r.status;
-- a blank name (the source put the stadium in the city column) can never match: one row so it is not lost
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wd), 'soccer_match_venue_name', 'blank:' || t.league_code || ':' || coalesce(m.venue_city, ''),
       'A ' || t.league_code || ' match has an empty stadium name (city column: "' || coalesce(m.venue_city, '') || '"; ' || count(*) || ' matches)',
       'venue_id left null; the source row is misaligned, fix it in the match build.'
from core.soccer_match m join core.soccer_tournament t using (tournament_id)
where m.venue_wikidata_id is null and m.venue_id is null and m.venue_name is not null and core.fold_text(m.venue_name) = ''
group by t.league_code, m.venue_city;

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
       count(*) filter (where m.venue_wikidata_id is null) as no_qid,
       count(*) filter (where m.venue_wikidata_id is null and m.venue_id is not null) as no_qid_with_venue,
       count(*) filter (where m.venue_wikidata_id is null and m.venue_id is null and m.venue_name is not null) as no_qid_open
from core.soccer_match m join core.soccer_tournament t using (tournament_id)
group by t.league_code order by 1;

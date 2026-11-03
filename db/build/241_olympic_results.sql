-- core.olympic_*: the Olympic Games, events, races and athlete lines from legacy_wikipedia_olympics (migration 193; English Wikipedia, CC BY-SA 4.0;
-- scripts/olympics/) into migration 194's tables. Run from the repo root (it reads db/seed/olympic_games.csv and olympic_event.csv), after db/build/179 and 185
-- (the people and the Wikidata ids it matches against). Rerunnable, ids kept: every table is upserted on its natural key (Games: season and year; event: Games
-- and event key; race: event, round order and race number; result: race and row order) and a row is deleted only when it is this source's and the legacy
-- tables no longer hold it. No begin or commit of its own (ds1-apply.sh wraps the file in one transaction and a dry run rolls it back; run it by hand with psql -1).
--
-- A name is tied to a person ONLY through a Wikidata id (match by source ids; John, 2026-10-29: "don't do anything like linking unless you're absolutely
-- positive on the match"): the article the name links to is a Wikidata item (a merged item is followed: legacy_rosters.redirect) and that item is the
-- Wikidata id of a person in core.external_id (source wikidata, entity_kind person), who was not born after the Games less 10 years or dead before them.
-- Every other name stays text, with its qid kept for a later match. Never the name alone.

create temp table src on commit drop as select source_id from meta.source where code = 'wikipedia';
create temp table wd on commit drop as select source_id from meta.source where code = 'wikidata';

create temp table seed_games (season text, year smallint, held_year smallint, name text, host_city text, host_ioc text);
\copy seed_games from 'db/seed/olympic_games.csv' with (format csv, header true)
create temp table seed_event (event_key text, sport text, gender text, distance_m smallint, stroke text);
\copy seed_event from 'db/seed/olympic_event.csv' with (format csv, header true)

-- ---- 1. Games and events ---------------------------------------------------------------------------------------------------------------
insert into core.olympic_games (season, year, held_year, name, host_city, host_ioc)
select season, year, held_year, name, host_city, host_ioc from seed_games
on conflict (season, year) do update set held_year = excluded.held_year, name = excluded.name, host_city = excluded.host_city, host_ioc = excluded.host_ioc;

insert into core.olympic_event (games_id, event_key, sport, name, gender, distance_m, stroke, qid, source_id, source_key)
select g.games_id, a.event_key, s.sport, coalesce(nullif(plain.name, ''), initcap(s.gender) || '''s ' || s.distance_m || ' metres'), s.gender, s.distance_m, s.stroke, a.qid,
       (select source_id from src), 'enwiki:' || a.page_title || '@' || a.revid
from legacy_wikipedia_olympics.article a
join seed_event s on s.event_key = a.event_key
join core.olympic_games g on g.season = 'summer' and g.year = a.games_year
cross join lateral (select regexp_replace(regexp_replace(coalesce(a.infobox ->> 'event', ''), '\[\[([^\]|]*\|)?([^\]]*)\]\]', '\2', 'g'), '<[^>]*>|''''+', '', 'g') as name) plain
on conflict (games_id, event_key) do update set sport = excluded.sport, name = excluded.name, gender = excluded.gender, distance_m = excluded.distance_m,
  stroke = excluded.stroke, qid = excluded.qid, source_id = excluded.source_id, source_key = excluded.source_key;

-- ---- 2. Races --------------------------------------------------------------------------------------------------------------------------
insert into core.olympic_race (event_id, round_code, round_ord, round_label, race_no, heat_label, wind_ms, wind_text, place_scope)
select e.event_id, r.round_code, r.round_ord, r.round_label, r.race_no, r.heat_label, r.wind_ms, r.wind_text, r.place_scope
from legacy_wikipedia_olympics.race r
join core.olympic_games g on g.season = 'summer' and g.year = r.games_year
join core.olympic_event e on e.games_id = g.games_id and e.event_key = r.event_key
on conflict (event_id, round_ord, race_no) do update set round_code = excluded.round_code, round_label = excluded.round_label, heat_label = excluded.heat_label,
  wind_ms = excluded.wind_ms, wind_text = excluded.wind_text, place_scope = excluded.place_scope;

-- ---- 3. Each line's Wikidata item and person -----------------------------------------------------------------------------------------------
create temp table ln on commit drop as
select e.event_id, rc.race_id, l.row_ord, l.lane, l.place, l.place_text, l.status, l.name, l.link_title, g.year as games_year,
       coalesce(rd.to_qid, lt.qid) as qid, l.nation, l.reaction_s, l.time_s, l.time_hand_s, l.time_text, l.marks, l.notes, l.splits, e.source_key
from legacy_wikipedia_olympics.line l
join core.olympic_games g on g.season = 'summer' and g.year = l.games_year
join core.olympic_event e on e.games_id = g.games_id and e.event_key = l.event_key
join core.olympic_race rc on rc.event_id = e.event_id and rc.round_ord = l.round_ord and rc.race_no = l.race_no
left join legacy_wikipedia_olympics.link_title lt on lt.title = l.link_title and lt.qid is not null and not lt.disambiguation and not lt.missing
left join legacy_rosters.redirect rd on rd.from_qid = lt.qid;
create index on ln (race_id, row_ord);

create temp table pq on commit drop as
select x.external_key as qid, x.entity_id as person_id from core.external_id x
where x.entity_kind = 'person' and x.source_id = (select source_id from wd);
create index on pq (qid);

create temp table by_wd on commit drop as
select ln.race_id, ln.row_ord, min(pq.person_id) as person_id
from ln join pq on pq.qid = ln.qid
join core.person p on p.person_id = pq.person_id
where (p.birth_date is null or ln.games_year >= extract(year from p.birth_date) + 10)
  and (p.death_date is null or ln.games_year <= extract(year from p.death_date))
group by ln.race_id, ln.row_ord
having count(distinct pq.person_id) = 1;

-- ---- 4. Results ------------------------------------------------------------------------------------------------------------------------
insert into core.olympic_result (race_id, row_ord, lane, place, place_text, status, athlete_name, athlete_qid, wiki_title, person_id, matched_by, nation_ioc,
                                 reaction_s, time_s, time_hand_s, time_text, marks, notes, splits, source_id, source_key)
select ln.race_id, ln.row_ord, ln.lane, ln.place, ln.place_text, ln.status, ln.name, ln.qid, ln.link_title, w.person_id,
       case when w.person_id is not null then 'wikidata' end, ln.nation, ln.reaction_s, ln.time_s, ln.time_hand_s, ln.time_text, ln.marks, ln.notes, ln.splits,
       (select source_id from src), ln.source_key
from ln left join by_wd w on w.race_id = ln.race_id and w.row_ord = ln.row_ord
on conflict (race_id, row_ord) do update set lane = excluded.lane, place = excluded.place, place_text = excluded.place_text, status = excluded.status,
  athlete_name = excluded.athlete_name, athlete_qid = excluded.athlete_qid, wiki_title = excluded.wiki_title, person_id = excluded.person_id,
  matched_by = excluded.matched_by, nation_ioc = excluded.nation_ioc, reaction_s = excluded.reaction_s, time_s = excluded.time_s,
  time_hand_s = excluded.time_hand_s, time_text = excluded.time_text, marks = excluded.marks, notes = excluded.notes, splits = excluded.splits,
  source_id = excluded.source_id, source_key = excluded.source_key;

-- ---- 5. Delete only what this source wrote and the legacy tables no longer hold ---------------------------------------------------------------
delete from core.olympic_result x using core.olympic_race r, core.olympic_event e
where r.race_id = x.race_id and e.event_id = r.event_id and e.source_id = (select source_id from src)
  and not exists (select 1 from ln where ln.race_id = x.race_id and ln.row_ord = x.row_ord);
delete from core.olympic_race r using core.olympic_event e, core.olympic_games g
where e.event_id = r.event_id and g.games_id = e.games_id and e.source_id = (select source_id from src)
  and not exists (select 1 from legacy_wikipedia_olympics.race lr where lr.event_key = e.event_key and lr.games_year = g.year and lr.round_ord = r.round_ord and lr.race_no = r.race_no);
delete from core.olympic_event e using core.olympic_games g
where g.games_id = e.games_id and e.source_id = (select source_id from src)
  and not exists (select 1 from legacy_wikipedia_olympics.article a where a.event_key = e.event_key and a.games_year = g.year);

-- ---- 6. What was not placed, in meta.data_issue (rewritten each run) ----------------------------------------------------------------------
delete from meta.data_issue where source_id = (select source_id from src) and entity_kind = 'olympic_result';
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'olympic_result', 'wikipedia_olympics:' || g.year || ':' || e.event_key,
       format('%s: %s of %s athlete lines are shown as text, no Wikidata match', e.source_key, count(*) filter (where x.person_id is null), count(*)),
       'Shown as text, not linked'
from core.olympic_result x
join core.olympic_race r using (race_id)
join core.olympic_event e using (event_id)
join core.olympic_games g using (games_id)
where x.source_id = (select source_id from src)
group by g.year, e.event_key, e.source_key
having count(*) filter (where x.person_id is null) > 0;

select g.year, e.event_key, count(distinct r.race_id) as races, count(*) as lines, count(x.person_id) as linked, count(x.athlete_qid) as with_qid
from core.olympic_result x join core.olympic_race r using (race_id) join core.olympic_event e using (event_id) join core.olympic_games g using (games_id)
where x.source_id = (select source_id from src) group by rollup (g.year, e.event_key) order by 1, 2;

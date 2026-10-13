-- World soccer stadiums, after db/build/198_home_venue.sql and 199_game_venue.sql: pitch sizes, and a check that every stadium the soccer
-- matches name is a venue. Run from the repo root; rerunnable. It writes core.venue_pitch (migration 079) and meta.data_issue ('world_venue'),
-- and nothing else: the stadiums themselves are added to core.venue / core.venue_name by step 198 from legacy_game_venue.venue
-- (scripts/game_venue/ fetch.py + load.py of db/seed/soccer_venue_ids.csv; see scripts/world_stadiums/README.md), and core.soccer_match.venue_id
-- is filled by db/build/207_soccer_match_venue.sql, later.
--
-- Pitch sizes: db/seed/venue_pitch.csv (made by scripts/world_stadiums/pitch_size.py from English Wikipedia infoboxes, CC BY-SA 4.0; 42 rows are
-- the figures and revisions kyogijo read by hand). A row for a stadium that is not in core.venue is kept (the venue may arrive with a later load).
--
-- world_venue issues: one row per item of db/seed/soccer_venue_ids.csv that is not in core.venue, with the reason (no Wikidata load, no city
-- or country, country not in ref.country, an item that is not a venue: db/seed/not_a_venue.csv). Fix with db/seed/venue_city.csv, then rerun 198 and this step.

drop table if exists pg_temp.seed_ids;
create temp table seed_ids (qid text, origin text, label text);
\copy seed_ids from 'db/seed/soccer_venue_ids.csv' with (format csv, header true)
drop table if exists pg_temp.seed_pitch;
create temp table seed_pitch (wikidata_id text, length numeric, width numeric, unit text, length_m numeric, width_m numeric, international boolean,
                              wikipedia_title text, revision_id bigint, source text, infobox_text text);
\copy seed_pitch from 'db/seed/venue_pitch.csv' with (format csv, header true)
drop table if exists pg_temp.seed_not_venue;
create temp table seed_not_venue (qid text, why text);
\copy seed_not_venue from 'db/seed/not_a_venue.csv' with (format csv, header true)
drop table if exists pg_temp.seed_city;
create temp table seed_city (wikidata_id text, city text, region text, country_code text);
\copy seed_city from 'db/seed/venue_city.csv' with (format csv, header true)

insert into core.venue_pitch (wikidata_id, length_m, width_m, length_published, width_published, unit, international, wikipedia_key, source_id)
select p.wikidata_id, p.length_m, p.width_m, p.length, p.width, p.unit, p.international,
       'enwiki:' || p.wikipedia_title || '@' || p.revision_id, (select source_id from meta.source where code = 'wikipedia')
from seed_pitch p
on conflict (wikidata_id) do update set length_m = excluded.length_m, width_m = excluded.width_m, length_published = excluded.length_published,
  width_published = excluded.width_published, unit = excluded.unit, international = excluded.international, wikipedia_key = excluded.wikipedia_key,
  source_id = excluded.source_id;
delete from core.venue_pitch v where not exists (select 1 from seed_pitch p where p.wikidata_id = v.wikidata_id);

delete from meta.data_issue where entity_kind = 'world_venue';
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'wikidata'), 'world_venue', s.qid,
       coalesce(s.label, s.qid) || ' (' || s.origin || ') is not in core.venue: ' ||
       case when exists (select 1 from seed_not_venue n where n.qid = s.qid) then 'the Wikidata item is not a venue (db/seed/not_a_venue.csv)'
            when g.qid is null then 'no row in legacy_game_venue.venue (scripts/game_venue/fetch.py and load.py not run for it)'
            when coalesce(nullif(sc.city, ''), g.city) is null then 'no city (add it to db/seed/venue_city.csv)'
            when coalesce(nullif(sc.country_code, ''), g.country_code, split_part(coalesce(nullif(sc.region, ''), g.region), '-', 1)) is null then 'no country'
            when not exists (select 1 from ref.country c where c.country_code = coalesce(nullif(sc.country_code, ''), g.country_code, split_part(coalesce(nullif(sc.region, ''), g.region), '-', 1)))
              then 'country ' || coalesce(nullif(sc.country_code, ''), g.country_code) || ' is not in ref.country'
            else 'step 198 did not add it (run 198 again)' end,
       'Stadium left without a core.venue row; matches there keep venue_id null.'
from seed_ids s
left join legacy_game_venue.venue g on g.qid = s.qid
left join seed_city sc on sc.wikidata_id = s.qid
where not exists (select 1 from core.venue v where v.source_key = s.qid and v.source_id = (select source_id from meta.source where code = 'wikidata'));

select 'stadiums in the seed' as what, count(*) as n from seed_ids
union all select '  in core.venue', count(*) from seed_ids s where exists (select 1 from core.venue v where v.source_key = s.qid and v.source_id = (select source_id from meta.source where code = 'wikidata'))
union all select '  not a venue / not added (meta.data_issue world_venue)', count(*) from meta.data_issue where entity_kind = 'world_venue'
union all select 'pitch sizes', count(*) from core.venue_pitch
union all select '  international sizes', count(*) from core.venue_pitch where international
union all select '  for a stadium not in core.venue', count(*) from core.venue_pitch p where not exists (select 1 from core.venue v where v.source_key = p.wikidata_id);

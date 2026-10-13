-- Future venues (migration 074): core.future_venue and core.future_venue_club, built from legacy_future_venue.* (scripts/future_venue/, raw files in
-- ~/Projects/backups/spx-stats/raw/future_venue/). Run from the repo root, as scripts/build_core.sh does, after step 100 (franchises) and after the
-- legacy tables are loaded. Rerunnable: the two tables and this step's meta.data_issue rows are emptied and rebuilt each time. Needs nothing from
-- core.venue or core.game, and touches no table of the game-venue, spring-training or batted-ball steps.
--
-- Rules (nothing is guessed; every unknown is logged in meta.data_issue, entity_kind 'future_venue_*'):
--   * Which venues are future, and the status: the "future" tables of the five leagues' Wikipedia venue lists (CC BY-SA 4.0). A row of the table
--     "Under construction" is under_construction; a row of "Proposed" is proposed, or approved when db/seed/future_venue_status.csv holds a sentence of
--     the venue's own article that says it was approved. A list row with no club (the CFL's Halifax and Quebec City candidates) is not loaded (logged).
--   * One venue is one Wikidata item (the article's, or an item whose label is exactly the list name); a row with neither is keyed by
--     'wikipedia-list:<league>:<name>'. A shared arena (76ers and Flyers) is one venue with two club rows.
--   * Planned year, opening text, capacity: the list; else the venue's article infobox; capacity else Wikidata. Groundbreaking: the infobox as written.
--     Coordinates: Wikidata (CC0); else the infobox. City, state/province: the list's location. The venue it replaces: the article's lead, else Wikidata P1365.
--   * A tenant's franchise comes from db/seed/future_venue_club.csv: the club as the list writes it, the league, and the name of the franchise's current
--     identity in core.franchise_identity. No exact single match: the club row is loaded with a null franchise_id and logged.

drop table if exists pg_temp.seed_club;
create temp table seed_club (club_text text, league text, anchor_name text, note text);
\copy seed_club from 'db/seed/future_venue_club.csv' with (format csv, header true)
drop table if exists pg_temp.seed_status;
create temp table seed_status (wikipedia_title text, status text, evidence text);
\copy seed_status from 'db/seed/future_venue_status.csv' with (format csv, header true)

insert into meta.source (code, name, kind, licence, attribution, url, notes)
values ('wikidata', 'Wikidata', 'dataset', 'CC0 1.0', 'Wikidata (www.wikidata.org), CC0.', 'https://www.wikidata.org',
        'Venue names, coordinates, capacity and dates.')
on conflict (code) do nothing;
insert into meta.source (code, name, kind, licence, attribution, url, notes)
values ('wikipedia', 'Wikipedia', 'website', 'CC BY-SA 4.0',
        'Future stadiums and arenas from English Wikipedia''s venue lists and venue articles (en.wikipedia.org), CC BY-SA 4.0; text by the articles'' editors, see each article''s history.',
        'https://en.wikipedia.org', 'Future venues.')
on conflict (code) do update set attribution = case when meta.source.attribution ilike '%future stadiums%' then meta.source.attribution
                                                   else meta.source.attribution || ' ' || excluded.attribution end;

delete from core.future_venue_club;
delete from core.future_venue;
delete from meta.data_issue where entity_kind like 'future\_venue\_%';

create temp table src_wp as select source_id from meta.source where code = 'wikipedia';
create temp table src_wd as select source_id from meta.source where code = 'wikidata';

-- ---------------------------------------------------------------- venues
create temp table lr as
select r.*, case when r.wikidata_id is not null then 'wikidata:' || r.wikidata_id else 'wikipedia-list:' || r.league || ':' || r.name end as venue_key
from legacy_future_venue.list_row r
where exists (select 1 from legacy_future_venue.list_club c where c.row_no = r.row_no);

create temp table pick as
select venue_key,
       (array_agg(wikidata_id order by row_no) filter (where wikidata_id is not null))[1] as wikidata_id,
       (array_agg(name order by (article is null), row_no))[1] as name,
       (array_agg(resolved_article order by row_no) filter (where resolved_article is not null))[1] as resolved_article,
       bool_or(table_caption = 'Under construction') as under_construction,
       (array_agg(capacity order by row_no) filter (where capacity is not null))[1] as list_capacity,
       (array_agg(opening_year order by row_no) filter (where opening_year is not null))[1] as list_opening_year,
       (array_agg(opening_text order by row_no) filter (where opening_text is not null))[1] as list_opening_text,
       (array_agg(location_text order by row_no) filter (where location_text is not null))[1] as location_text,
       (array_agg(city order by row_no) filter (where city is not null))[1] as city,
       (array_agg(region order by row_no) filter (where region is not null))[1] as region,
       (array_agg(country_code order by row_no) filter (where country_code is not null))[1] as country_code,
       (array_agg(list_title order by row_no))[1] as list_title,
       (array_agg(list_revision order by row_no))[1] as list_revision
from lr group by venue_key;

create temp table built as
select p.*, a.revision_id as article_revision, a.title as article_title,
       a.opened_text as article_opened_text, a.capacity as article_capacity, a.groundbreaking_text,
       a.latitude as article_lat, a.longitude as article_lon,
       coalesce(a.replaces_wikidata, w.replaces[1]) as replaces_wikidata,
       coalesce(a.replaces_title, nullif(w.replaces_names[1], '')) as replaces_name,
       w.latitude as wd_lat, w.longitude as wd_lon, w.capacity as wd_capacity, w.inception_year as wd_inception, w.planned_open_year as wd_planned,
       w.city as wd_city, w.region as wd_region, w.country_code as wd_country,
       s.status as seed_status, s.evidence as seed_evidence,
       (regexp_match(a.opened_text, '\m((?:19|20)\d\d)\M'))[1]::smallint as article_open_year
from pick p
left join legacy_future_venue.article a on a.title = p.resolved_article
left join legacy_future_venue.wikidata_venue w on w.wikidata_id = p.wikidata_id
left join seed_status s on s.wikipedia_title = p.resolved_article;

insert into core.future_venue (venue_key, wikidata_id, name, status, status_note, planned_open_year, opening_text, groundbreaking_text, groundbreaking_year,
                               capacity, latitude, longitude, coordinates_source, city, region, country_code, location_text,
                               replaces_venue_wikidata, replaces_venue_name, wikipedia_title, wikipedia_revision, list_title, list_revision, as_of, source_id, source_key)
select b.venue_key, b.wikidata_id,
       case when b.article_title like b.name || ' (%' then b.article_title else b.name end,     -- Wikipedia's own qualifier: "Nissan Stadium (2027)", the new one beside the old
       case when b.under_construction then 'under_construction' when b.seed_status = 'approved' then 'approved' else 'proposed' end,
       case when not b.under_construction and b.seed_status = 'approved' then b.seed_evidence end,
       coalesce(b.list_opening_year, b.article_open_year),
       case when b.list_opening_year is not null or b.article_open_year is null then b.list_opening_text else b.article_opened_text end,
       nullif(b.groundbreaking_text, 'TBD'),
       (regexp_match(b.groundbreaking_text, '\m((?:19|20)\d\d)\M'))[1]::smallint,
       coalesce(b.list_capacity, b.article_capacity, b.wd_capacity),
       coalesce(b.wd_lat, b.article_lat), coalesce(b.wd_lon, b.article_lon),
       case when b.wd_lat is not null then 'wikidata' when b.article_lat is not null then 'wikipedia' end,
       coalesce(b.city, b.wd_city), coalesce(b.region, b.wd_region), coalesce(b.country_code, b.wd_country), b.location_text,
       b.replaces_wikidata, b.replaces_name,
       b.article_title, b.article_revision, b.list_title, b.list_revision,
       (select max(fetched_on) from legacy_future_venue.source_page),
       (select source_id from src_wp),
       'wikipedia:' || coalesce(b.article_title || '@' || b.article_revision, b.list_title || '@' || b.list_revision)
from built b;

-- ---------------------------------------------------------------- clubs
create temp table franchise_of as
select s.club_text, s.league, array_agg(distinct i.franchise_id) as ids
from seed_club s
join core.franchise_identity i on i.full_name = s.anchor_name and upper_inf(i.valid_during)
join core.franchise_league fl on fl.franchise_id = i.franchise_id and fl.league_code = s.league and upper_inf(fl.valid_during)
group by s.club_text, s.league;

insert into core.future_venue_club (venue_key, club_name, league, franchise_id, source_id, source_key)
select distinct on (r.venue_key, c.club_text)
       r.venue_key, c.club_text, r.league, case when cardinality(f.ids) = 1 then f.ids[1] end, (select source_id from src_wp),
       'wikipedia:' || r.list_title || '@' || r.list_revision
from legacy_future_venue.list_club c
join lr r using (row_no)
join core.future_venue v on v.venue_key = r.venue_key
left join franchise_of f on f.club_text = c.club_text and f.league = r.league
order by r.venue_key, c.club_text, r.row_no;

-- ---------------------------------------------------------------- unknowns and doubts
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src_wp), 'future_venue_club', r.league || ':' || r.name,
       '"' || r.name || '" (' || coalesce(r.location_text, 'no location') || ', ' || coalesce(r.status_text, 'no status') || ', opening ' || coalesce(r.opening_text, 'not given')
         || ') is in the ' || upper(r.league) || ' list''s future table with no club named.',
       'Not loaded: core.future_venue is for venues of a club of the five leagues. The row stays in legacy_future_venue.list_row.'
from legacy_future_venue.list_row r
where not exists (select 1 from legacy_future_venue.list_club c where c.row_no = r.row_no);

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src_wp), 'future_venue_club', v.venue_key || ':' || c.club_name,
       case when s.club_text is null then 'No row in db/seed/future_venue_club.csv for "' || c.club_name || '" (' || c.league || ').'
            else '"' || c.club_name || '" (' || c.league || ') does not match exactly one current franchise named "' || s.anchor_name || '".' end,
       'Club row loaded with its club name and no franchise_id.'
from core.future_venue_club c
join core.future_venue v using (venue_key)
left join seed_club s on s.club_text = c.club_name and s.league = c.league
where c.franchise_id is null;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src_wd), 'future_venue_wikidata', v.venue_key,
       '"' || v.name || '" has no Wikipedia article and no Wikidata item whose label is exactly that name.',
       'Kept as a venue keyed by the list row; coordinates, groundbreaking and the venue it replaces stay empty.'
from core.future_venue v where v.wikidata_id is null and v.wikipedia_title is null;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src_wd), 'future_venue_wikidata', r.name,
       'The article "' || r.resolved_article || '" is linked to a Wikidata item that is another thing: ' || r.wikidata_ignored || '.',
       'The item''s facts (inception, places, coordinates) are not used; the venue is keyed by its list row and the facts come from the article.'
from legacy_future_venue.list_row r where r.wikidata_ignored is not null;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src_wd), 'future_venue_coordinates', v.venue_key,
       '"' || v.name || '" has no coordinates on Wikidata or in its Wikipedia infobox' || case when v.city is null then ' (the site is not settled: list location "' || coalesce(v.location_text, 'none') || '").' else '.' end,
       'Left empty.'
from core.future_venue v where v.latitude is null;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src_wp), 'future_venue_opening', v.venue_key,
       '"' || v.name || '": the list gives opening "' || coalesce(b.list_opening_text, 'nothing') || '"' ||
         case when b.article_opened_text is not null then ' and the article''s infobox "' || b.article_opened_text || '"' else '' end || '; no year.',
       'planned_open_year left empty.'
from core.future_venue v join built b using (venue_key) where v.planned_open_year is null;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src_wd), 'future_venue_opening', v.venue_key,
       '"' || v.name || '": the list says ' || v.planned_open_year || ' but ' ||
         concat_ws(' and ', case when b.article_open_year is not null and b.article_open_year <> v.planned_open_year then 'the article''s infobox says ' || b.article_open_year end,
                            case when b.wd_planned is not null and b.wd_planned <> v.planned_open_year then 'Wikidata (opening date) says ' || b.wd_planned end,
                            case when b.wd_inception is not null and b.wd_inception <> v.planned_open_year then 'Wikidata (inception) says ' || b.wd_inception end) || '.',
       'The list''s year kept (the lists are edited as plans change; Wikidata is often stale).'
from core.future_venue v join built b using (venue_key)
where v.planned_open_year is not null
  and ((b.article_open_year is not null and b.article_open_year <> v.planned_open_year)
    or (b.wd_planned is not null and b.wd_planned <> v.planned_open_year)
    or (b.wd_inception is not null and b.wd_inception <> v.planned_open_year));

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src_wp), 'future_venue_capacity', v.venue_key,
       '"' || v.name || '" has no capacity in the list, the article or Wikidata.', 'Left empty.'
from core.future_venue v where v.capacity is null;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src_wp), 'future_venue_capacity', v.venue_key,
       '"' || v.name || '": the list says ' || v.capacity || ' seats, the article''s infobox ' || b.article_capacity || '.',
       'The list''s figure kept.'
from core.future_venue v join built b using (venue_key)
where b.list_capacity is not null and b.article_capacity is not null and b.list_capacity <> b.article_capacity;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src_wp), 'future_venue_location', v.venue_key,
       '"' || v.name || '" has no city in the list (location "' || coalesce(v.location_text, 'none') || '").', 'Left empty.'
from core.future_venue v where v.city is null;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src_wp), 'future_venue_replaces', v.venue_key,
       'Neither the article''s lead nor Wikidata says which venue "' || v.name || '" replaces.', 'Left empty (a club may keep its old home, or play elsewhere meanwhile).'
from core.future_venue v where v.replaces_venue_wikidata is null and v.replaces_venue_name is null;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src_wd), 'future_venue_replaces', v.venue_key,
       '"' || v.name || '": the article''s lead says it replaces ' || a.replaces_wikidata || ', Wikidata (P1365) says ' || array_to_string(w.replaces, ', ') || '.',
       'The article''s kept.'
from core.future_venue v
join legacy_future_venue.article a on a.title = v.wikipedia_title
join legacy_future_venue.wikidata_venue w on w.wikidata_id = v.wikidata_id
where a.replaces_wikidata is not null and w.replaces is not null and not (a.replaces_wikidata = any (w.replaces));

select 'future_venue' as t, count(*) from core.future_venue
union all select 'future_venue_club', count(*) from core.future_venue_club
union all select 'future_venue_club without franchise', count(*) from core.future_venue_club where franchise_id is null
union all select 'future_venue ' || status, count(*) from core.future_venue group by status
union all select 'data_issue future_venue_*', count(*) from meta.data_issue where entity_kind like 'future\_venue\_%';

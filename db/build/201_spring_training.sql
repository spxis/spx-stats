-- Spring training parks (migration 070): core.spring_training_venue, core.spring_training_venue_name and core.spring_training_tenant, built from
-- legacy_spring_training.* (scripts/spring_training/, raw files in ~/Projects/backups/spx-stats/raw/spring_training/). Run from the repo root,
-- as scripts/build_core.sh does, after step 100 (franchises) and after the legacy tables are loaded. Rerunnable: the three tables and this
-- step's meta.data_issue rows are emptied and rebuilt each time. Needs nothing from core.venue or core.game.
--
-- Rules (nothing is guessed; every unknown is logged in meta.data_issue, entity_kind 'spring_training_*'):
--   * A park is a Wikidata item. Two list rows that lead to one item (a ballpark rebuilt on the same site: Scottsdale Stadium old and new, HoHoKam
--     Park and Stadium, Grant Field and TD Ballpark, Waterfront Park and Al Lang Field) are one park; the row of a current table, else the one
--     last used, names it; the other names are kept as names. Logged as 'spring_training_site'.
--   * League: the list's own table (Grapefruit League Florida, Cactus League Arizona), for a former park the state of its city. Parks in other states
--     (Hot Springs, Baton Rouge, Long Beach ...) stay in legacy_spring_training and are not loaded.
--   * name, city, capacity, tenants and their years: the list article (CC BY-SA 4.0; revision in list_revision). Coordinates, opened and closed
--     year: Wikidata (CC0), opened falling back to the list. Fence distances: the park article's infobox, as it stands (current or last configuration).
--     A Wikidata closing year earlier than the last spring a club trained there is contradicted by the list and left empty (logged).
--   * A tenant's franchise comes from db/seed/spring_training_club.csv: the club as the list writes it, and a name and year that point at one
--     franchise in core.franchise_identity (open-ended major-league membership). A club that does not match exactly one franchise keeps its
--     club_name with a null franchise_id and is logged ('spring_training_club'). A club the seed marks as not major-league (empty anchor_name: a minor-league team)
--     and a tenant whose years the list does not give readably are not loaded (logged).

drop table if exists pg_temp.seed_club;
create temp table seed_club (club_text text, anchor_name text, anchor_year text, note text);
\copy seed_club from 'db/seed/spring_training_club.csv' with (format csv, header true)

insert into meta.source (code, name, kind, licence, attribution, url, notes)
values ('wikidata', 'Wikidata', 'dataset', 'CC0 1.0', 'Wikidata (www.wikidata.org), CC0.', 'https://www.wikidata.org',
        'Venue names, coordinates, capacity and dates.')
on conflict (code) do nothing;
insert into meta.source (code, name, kind, licence, attribution, url, notes)
values ('wikipedia', 'Wikipedia', 'website', 'CC BY-SA 4.0',
        'Spring training ballpark list and park articles from English Wikipedia (en.wikipedia.org), CC BY-SA 4.0; text by the articles'' editors, see each article''s history.',
        'https://en.wikipedia.org', 'Spring training ballparks and tenants.')
on conflict (code) do update set attribution = case when meta.source.attribution ilike '%spring training%' then meta.source.attribution
                                                   else meta.source.attribution || ' ' || excluded.attribution end;

delete from core.spring_training_tenant;
delete from core.spring_training_venue_name;
delete from core.spring_training_venue;
delete from meta.data_issue where entity_kind like 'spring\_training\_%';

create temp table src_wd as select source_id from meta.source where code = 'wikidata';
create temp table src_wp as select source_id from meta.source where code = 'wikipedia';

-- ---------------------------------------------------------------- parks
create temp table pr as
select r.*, regexp_replace(regexp_replace(r.name, '\s*\((?:a\.k\.a\.|new|old|\d{4})[^)]*\)', '', 'g'), '\s+', ' ', 'g') as clean_name
from legacy_spring_training.park_row r
where r.league is not null;

create temp table pick as
select distinct on (wikidata_id) wikidata_id, btrim(clean_name) as name, league,
       coalesce(nullif(btrim(split_part(city_link, ',', 1)), ''), city_text) as city, capacity, list_revision
from pr
where wikidata_id is not null
order by wikidata_id, (status = 'current') desc, last_used_year desc nulls first, row_no;

insert into core.spring_training_venue (wikidata_id, name, league, city, region, country_code, latitude, longitude, opened_year, capacity,
                                        fence_left_ft, fence_center_ft, fence_right_ft, wikipedia_title, wikipedia_revision, list_revision, source_id, source_key)
select p.wikidata_id, p.name, p.league, p.city,
       case p.league when 'grapefruit' then 'US-FL' when 'cactus' then 'US-AZ' end, 'US',
       v.latitude, v.longitude,
       coalesce(v.opened_year, (select min(r.opened_year) from pr r where r.wikidata_id = p.wikidata_id)),
       coalesce(p.capacity, v.capacity),
       f.left_ft, f.center_ft, f.right_ft,
       v.wikipedia_title, v.wikipedia_revision, p.list_revision, (select source_id from src_wd), 'wikidata:' || p.wikidata_id
from pick p
left join legacy_spring_training.venue v using (wikidata_id)
left join legacy_spring_training.fence f using (wikidata_id);

-- ---------------------------------------------------------------- names
insert into core.spring_training_venue_name (wikidata_id, name, from_year, to_year, source_id, source_key)
select distinct n.wikidata_id, n.name, n.from_year, n.to_year,
       case when n.source = 'wikidata' then (select source_id from src_wd) else (select source_id from src_wp) end,
       case when n.source = 'wikidata' then 'wikidata:' || n.wikidata_id
            else 'wikipedia:' || coalesce(v.wikipedia_title, '') || '@' || coalesce(n.wikipedia_revision::text, '') end
from legacy_spring_training.park_name n
join core.spring_training_venue c on c.wikidata_id = n.wikidata_id
left join legacy_spring_training.venue v on v.wikidata_id = n.wikidata_id
where not (n.name = c.name and n.from_year is null and n.to_year is null)
on conflict do nothing;
-- the names of the other list rows of a rebuilt site, without years
insert into core.spring_training_venue_name (wikidata_id, name, from_year, to_year, source_id, source_key)
select distinct r.wikidata_id, btrim(r.clean_name), null::smallint, null::smallint, (select source_id from src_wp),
       'wikipedia:List of Major League Baseball spring training ballparks@' || r.list_revision
from pr r
join core.spring_training_venue c on c.wikidata_id = r.wikidata_id
where btrim(r.clean_name) <> c.name
on conflict do nothing;

-- ---------------------------------------------------------------- tenants
create temp table franchise_of as
select s.club_text, array_agg(distinct i.franchise_id) as ids
from seed_club s
join core.franchise_identity i on i.full_name = s.anchor_name and i.valid_during @> make_date(nullif(s.anchor_year, '')::int, 7, 1)
join core.franchise_league fl on fl.franchise_id = i.franchise_id and fl.league_code = 'mlb' and upper_inf(fl.valid_during)
where s.anchor_name <> ''
group by s.club_text;

insert into core.spring_training_tenant (wikidata_id, club_name, franchise_id, from_year, to_year, source_id, source_key)
select distinct on (r.wikidata_id, o.club_text, o.from_year)
       r.wikidata_id, o.club_text, case when cardinality(f.ids) = 1 then f.ids[1] end, o.from_year, o.to_year,
       (select source_id from src_wp), 'wikipedia:List of Major League Baseball spring training ballparks@' || r.list_revision
from legacy_spring_training.occupant o
join pr r using (row_no)
join core.spring_training_venue c on c.wikidata_id = r.wikidata_id
left join franchise_of f on f.club_text = o.club_text
where o.from_year is not null and (o.to_year is null or o.to_year >= o.from_year)
  and not exists (select 1 from seed_club s where s.club_text = o.club_text and s.anchor_name is null)     -- a minor-league or other non-major-league club
order by r.wikidata_id, o.club_text, o.from_year, r.row_no;

-- a Wikidata closing year is kept only when no club trained there later
update core.spring_training_venue c
set closed_year = v.closed_year
from legacy_spring_training.venue v
where v.wikidata_id = c.wikidata_id and v.closed_year is not null
  and not exists (select 1 from core.spring_training_tenant t where t.wikidata_id = c.wikidata_id and (t.to_year is null or t.to_year > v.closed_year));

-- ---------------------------------------------------------------- unknowns and doubts
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src_wp), 'spring_training_site', c.wikidata_id,
       'The list has ' || count(*) || ' rows for one Wikidata item (' || string_agg('"' || r.name || '"', ', ' order by r.row_no) || '): a ballpark rebuilt on the same site.',
       'Kept as one park named "' || c.name || '"; the other names are in core.spring_training_venue_name.'
from pr r join core.spring_training_venue c using (wikidata_id)
group by c.wikidata_id, c.name having count(*) > 1;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src_wp), 'spring_training_wikidata', 'list:' || r.name,
       'The list row has no English Wikipedia article with a Wikidata item (tenants: ' ||
         coalesce((select string_agg(o.club_text || ' ' || coalesce(o.years_text, 'no years'), ', ') from legacy_spring_training.occupant o where o.row_no = r.row_no), 'none') || ').',
       'Park and tenants not loaded: a park here is a Wikidata item, and no years or place are guessed.'
from pr r where r.wikidata_id is null;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src_wd), 'spring_training_wikidata', c.wikidata_id,
       '"' || c.name || '" has no coordinates on Wikidata.', 'Left empty.'
from core.spring_training_venue c where c.latitude is null;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src_wd), 'spring_training_opened', c.wikidata_id,
       '"' || c.name || '" has no opening year on Wikidata or in the list.', 'Left empty.'
from core.spring_training_venue c where c.opened_year is null;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src_wd), 'spring_training_opened', c.wikidata_id,
       '"' || c.name || '": Wikidata says opened ' || v.opened_year || ', the list says ' || string_agg(distinct r.opened_year::text, '/') || '.',
       'Wikidata''s year kept (a rebuilt site may be dated by its first or its present ballpark).'
from core.spring_training_venue c
join legacy_spring_training.venue v using (wikidata_id)
join pr r using (wikidata_id)
where v.opened_year is not null and r.opened_year is not null and v.opened_year <> r.opened_year
group by c.wikidata_id, c.name, v.opened_year
having not (v.opened_year = any (array_agg(r.opened_year)));

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src_wd), 'spring_training_closed', c.wikidata_id,
       '"' || c.name || '": Wikidata says the park closed in ' || v.closed_year || ', but the list has a club training there in ' ||
         (select coalesce(max(t.to_year)::text, 'the present') from core.spring_training_tenant t where t.wikidata_id = c.wikidata_id) || '.',
       'Closing year left empty.'
from core.spring_training_venue c join legacy_spring_training.venue v using (wikidata_id)
where v.closed_year is not null and c.closed_year is null;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src_wd), 'spring_training_state', c.wikidata_id,
       '"' || c.name || '": Wikidata places the park in ' || v.region || ', the list in ' || c.region || '.', 'The list''s state decides the league.'
from core.spring_training_venue c join legacy_spring_training.venue v using (wikidata_id)
where v.region is not null and v.region <> c.region;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src_wp), 'spring_training_fence', c.wikidata_id,
       '"' || c.name || '" has no ' || concat_ws(' or ', case when c.fence_left_ft is null then 'left' end, case when c.fence_center_ft is null then 'center' end,
                                                 case when c.fence_right_ft is null then 'right' end) || '-field distance in its Wikipedia infobox'
         || case when f.dimensions_text is not null then ' (it reads: ' || f.dimensions_text || ')' else '' end || '.',
       'Left empty.'
from core.spring_training_venue c left join legacy_spring_training.fence f using (wikidata_id)
where c.fence_left_ft is null or c.fence_center_ft is null or c.fence_right_ft is null;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src_wp), 'spring_training_years', r.wikidata_id || ':' || o.club_text,
       'The list gives no readable years for "' || o.club_text || '" at "' || r.name || '"' || coalesce(' (it reads: ' || o.years_text || ')', '') || '.',
       'Tenant not loaded.'
from legacy_spring_training.occupant o join pr r using (row_no)
where r.wikidata_id is not null and (o.from_year is null or (o.to_year is not null and o.to_year < o.from_year));

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src_wp), 'spring_training_club', t.club_name,
       case when s.club_text is null then 'No row in db/seed/spring_training_club.csv for "' || t.club_name || '".'
            when s.anchor_name is null then '"' || t.club_name || '" is not a major-league franchise (' || coalesce(s.note, 'no franchise named') || ').'
            else '"' || t.club_name || '" does not match exactly one major-league franchise (' || s.anchor_name || ' ' || s.anchor_year || ').' end,
       case when t.skipped then 'Tenant not loaded.' else 'Tenant loaded with its club name and no franchise_id.' end
from (select club_name, false as skipped from core.spring_training_tenant where franchise_id is null
      union
      select o.club_text, true from legacy_spring_training.occupant o join pr r using (row_no)
      join seed_club s on s.club_text = o.club_text and s.anchor_name is null where r.wikidata_id is not null) t
left join seed_club s on s.club_text = t.club_name
group by t.club_name, s.club_text, s.anchor_name, s.anchor_year, s.note, t.skipped;

-- one club at two parks in the same spring
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src_wp), 'spring_training_overlap', a.wikidata_id || '/' || b.wikidata_id || ':' || a.club_name,
       'Franchise ' || a.franchise_id || ' is listed at "' || va.name || '" (' || a.from_year || '-' || coalesce(a.to_year::text, 'present') || ') and at "' || vb.name || '" ('
         || b.from_year || '-' || coalesce(b.to_year::text, 'present') || ') in overlapping years.',
       'Both kept as the list gives them (a club can split a spring between two parks); not checked against another source.'
from core.spring_training_tenant a
join core.spring_training_tenant b on b.franchise_id = a.franchise_id and b.wikidata_id > a.wikidata_id
  and int4range(a.from_year, coalesce(a.to_year, 9999) + 1) && int4range(b.from_year, coalesce(b.to_year, 9999) + 1)
join core.spring_training_venue va on va.wikidata_id = a.wikidata_id
join core.spring_training_venue vb on vb.wikidata_id = b.wikidata_id;

select 'spring_training_venue' as t, count(*) from core.spring_training_venue
union all select 'spring_training_venue_name', count(*) from core.spring_training_venue_name
union all select 'spring_training_tenant', count(*) from core.spring_training_tenant
union all select 'spring_training_tenant without franchise', count(*) from core.spring_training_tenant where franchise_id is null
union all select 'data_issue spring_training_*', count(*) from meta.data_issue where entity_kind like 'spring\_training\_%';

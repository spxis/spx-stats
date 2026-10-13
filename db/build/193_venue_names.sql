-- core.brand_venue_name and core.brand_venue_info (migration 052) from legacy_wikidata_venues (migration 051; scripts/wikidata_venues/).
-- Run from the repo root, as scripts/build_core.sh does, after 176_venue_place.sql. Rerunnable: both tables are emptied and filled again.
-- Names: Wikidata's dated names (P1448, P2561) and the infobox "former names" of the English Wikipedia article; a name both give is
-- Wikidata's. A name with no year at all cannot be placed and is left out. The name now is the English Wikidata label: it keeps its row
-- when a dated name is the same, else it is added, from the year the last former name ended. Facts come from the same items, with
-- legacy_franchise_info.place filling what the new fetch lacks; a street address from there wins over the one-line address (P6375), then Wikidata's
-- street and house number (P669, P670), then the street line of the English Wikipedia infobox (migration 059); the infobox is marked in wikipedia_fields.
-- Postal code: Wikidata P281, taken from postal_checked (migration 058; run scripts/wikidata_venues/postal_check.py after load.py first).

delete from core.brand_venue_name;
insert into core.brand_venue_name (wikidata_id, name, from_year, until_year, is_current, source_id, source_key)
with cand as (
  select distinct on (n.qid, norm.k) n.qid, n.name, n.from_year, n.until_year, n.source,
         case when n.source = 'wikidata' then n.qid else 'enwiki:' || v.wikipedia_title || '@' || v.wikipedia_revid end as source_key,
         norm.k, coalesce(norm.k = regexp_replace(lower(v.label), '[^a-z0-9]', '', 'g'), false) as now_name
  from legacy_wikidata_venues.name n
  join legacy_wikidata_venues.venue v using (qid)
  cross join lateral (select regexp_replace(lower(n.name), '[^a-z0-9]', '', 'g') as k) norm
  where (n.from_year is not null or n.until_year is not null)
    and coalesce(n.from_year, n.until_year) between 1850 and 2100
    and (n.from_year is null or n.until_year is null or n.from_year <= n.until_year)
  order by n.qid, norm.k, (n.source = 'wikidata') desc, n.from_year nulls last
), cur as (
  select v.qid, v.label, regexp_replace(lower(v.label), '[^a-z0-9]', '', 'g') as k,
         (select max(c.until_year) from cand c where c.qid = v.qid and not c.now_name) as last_until
  from legacy_wikidata_venues.venue v where v.label is not null
)
select c.qid, c.name, c.from_year, case when c.now_name then null else c.until_year end, c.now_name,
       (select source_id from meta.source where code = c.source), c.source_key
from cand c
union all
select u.qid, u.label, u.last_until, null, true, (select source_id from meta.source where code = 'wikidata'), u.qid
from cur u where not exists (select 1 from cand c where c.qid = u.qid and c.now_name);

delete from core.brand_venue_info;
insert into core.brand_venue_info (wikidata_id, capacity, opened_year, closed_year, owner, surface, roof, address, postal_code, source_id, source_key, wikipedia_key, wikipedia_fields)
select v.qid, coalesce(v.capacity, p.capacity), extract(year from coalesce(v.opened_on, p.opened_on))::smallint,
       extract(year from coalesce(v.closed_on, p.closed_on))::smallint, v.owner, coalesce(v.surface, p.surface, v.wp_surface), coalesce(v.roof, p.roof, v.wp_roof),
       coalesce(p.address_street, v.address, v.street_address, v.wp_address), v.postal_checked, (select source_id from meta.source where code = 'wikidata'), v.qid,
       case when (coalesce(v.surface, p.surface) is null and v.wp_surface is not null) or (coalesce(v.roof, p.roof) is null and v.wp_roof is not null)
              or (coalesce(p.address_street, v.address, v.street_address) is null and v.wp_address is not null)
            then 'enwiki:' || v.wikipedia_title || '@' || v.wikipedia_revid end,
       nullif(concat_ws(',', case when coalesce(v.surface, p.surface) is null and v.wp_surface is not null then 'surface' end,
                                 case when coalesce(v.roof, p.roof) is null and v.wp_roof is not null then 'roof' end,
                                 case when coalesce(p.address_street, v.address, v.street_address) is null and v.wp_address is not null then 'address' end), '')
from legacy_wikidata_venues.venue v
left join legacy_franchise_info.place p on p.qid = v.qid
where coalesce(v.capacity, p.capacity) is not null or coalesce(v.opened_on, p.opened_on) is not null or v.owner is not null
   or coalesce(v.surface, p.surface, v.wp_surface) is not null or coalesce(v.roof, p.roof, v.wp_roof) is not null or coalesce(p.address_street, v.address, v.street_address, v.wp_address) is not null
   or v.postal_checked is not null;

-- Postal codes (P281) that scripts/wikidata_venues/postal_check.py refused (wrong shape, another country, another state or province, two codes,
-- or no region to check against) are logged and left empty; one that was never checked is logged too. Rerunnable: last run's rows are replaced.
delete from meta.data_issue where entity_kind = 'venue_postal_code';
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'wikidata'), 'venue_postal_code', v.qid,
       'Wikidata P281 of ' || coalesce(v.label, v.qid) || ' not used: ' || coalesce(v.postal_problem, 'not checked yet (run postal_check.py)'),
       'Postal code left empty; Wikidata is not changed and no code is guessed.'
from legacy_wikidata_venues.venue v
where v.postal_code is not null and v.postal_checked is null;

select 'venues in brand_venue' as what, count(distinct source_key) as n from core.brand_venue
union all select 'with a name row', count(distinct wikidata_id) from core.brand_venue_name
union all select 'with a former name', count(distinct wikidata_id) from core.brand_venue_name where not is_current
union all select 'name rows', count(*) from core.brand_venue_name
union all select 'with facts', count(*) from core.brand_venue_info
union all select 'with capacity', count(capacity) from core.brand_venue_info
union all select 'with opened year', count(opened_year) from core.brand_venue_info
union all select 'with owner', count(owner) from core.brand_venue_info
union all select 'with surface', count(surface) from core.brand_venue_info
union all select 'with roof', count(roof) from core.brand_venue_info
union all select 'with address', count(address) from core.brand_venue_info
union all select 'address from the Wikipedia infobox', count(*) from core.brand_venue_info where wikipedia_fields like '%address%'
union all select 'with postal code', count(postal_code) from core.brand_venue_info
union all select 'postal codes refused', count(*) from meta.data_issue where entity_kind = 'venue_postal_code';

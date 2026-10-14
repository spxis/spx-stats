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

-- ---------------------------------------------------------------- surface, roof, opening and closing (migration 089)
-- Surface: the text a source gives is mapped to the fixed list ref.venue_surface by ref.venue_surface_rule (db/seed/venue_surface_rule.csv; the lowest
-- rank whose pattern matches wins, a text with several statements joined by ';' that map to different values is 'multi', one no rule covers is logged
-- and gets no value). Periods (core.brand_venue_period): the statements that carry years, from the English Wikipedia infobox when it dates any
-- ("AstroTurf (1989-2004)<br>FieldTurf (2005-2010)"), else Wikidata's P765 with start and end time; db/seed/venue_period.csv, checked by hand against a
-- cited article revision, replaces the computed rows of its venue and kind. The surface now (core.brand_venue_info.surface) is the open-ended or latest
-- period, else the infobox's first undated line, else Wikidata's undated statement. Roof: the periods, else Wikidata's type, else the infobox, else the roof the
-- first paragraph of the article names.
-- Closing: Wikidata P3999 else P576 (core.venue_info.closed_year), else the infobox |closed= when it is one clean date (not a renovation, not a range),
-- else the first year of |demolished=. status: closed (a year is known), demolished (a source says the building is gone, no year; logged), open (no closing
-- or demolition is recorded in either source). db/seed/venue_fact.csv, checked by hand, sets capacity, opening or closing year the sources lack or get wrong.
drop table if exists pg_temp.seed_rule, pg_temp.seed_fact, pg_temp.seed_period;
create temp table seed_rule (rank smallint, pattern text, surface text, note text);
\copy seed_rule from 'db/seed/venue_surface_rule.csv' with (format csv, header true)
create temp table seed_fact (wikidata_id text, field text, value text, wikipedia_title text, revision_id bigint, note text);
\copy seed_fact from 'db/seed/venue_fact.csv' with (format csv, header true)
create temp table seed_period (wikidata_id text, kind text, value text, raw text, from_year smallint, until_year smallint, sport text, wikipedia_title text, revision_id bigint, note text);
\copy seed_period from 'db/seed/venue_period.csv' with (format csv, header true)

delete from ref.venue_surface_rule;
insert into ref.venue_surface_rule (rank, pattern, surface, note) select rank, pattern, surface, note from seed_rule;

create or replace function pg_temp.surf(t text) returns text language sql stable as $$
  with parts as (select btrim(x) as p from unnest(string_to_array(t, ';')) x where btrim(x) <> ''),
       m as (select p, (select r.surface from ref.venue_surface_rule r where p ~* r.pattern order by r.rank limit 1) as s from parts)
  select case when count(*) = 0 or bool_or(s is null) then null when count(distinct s) = 1 then min(s) else 'multi' end from m $$;
create or replace function pg_temp.roofv(t text) returns text language sql immutable as $$
  select case when lower(t) ~ 'retract' then 'retractable'
              when lower(t) ~ 'fixed|dome|enclosed|teflon|inflat|air-supported|cable' then 'dome'
              when lower(t) ~ '\yopen\y|\ynone\y|^\s*no\y' then 'open' end $$;

-- the statements that carry years, mapped; the source is Wikipedia when its infobox dates any statement of that kind, else Wikidata
create temp table per_raw as
select f.qid, f.kind, f.source, f.ord, f.raw, f.from_year, f.until_year,
       case f.kind when 'surface' then pg_temp.surf(f.raw) else pg_temp.roofv(f.raw) end as val
from legacy_wikidata_venues.fact f
where f.dated and (f.from_year is null or f.until_year is null or f.from_year <= f.until_year);
create temp table per_all as
select r.qid, r.kind, r.source, r.val, r.raw, r.from_year, r.until_year, r.ord, null::text as sport
from per_raw r
where r.val is not null
  and r.source = (select case when bool_or(x.source = 'wikipedia') then 'wikipedia' else 'wikidata' end from per_raw x where x.qid = r.qid and x.kind = r.kind)
  and not exists (select 1 from seed_period sp where sp.wikidata_id = r.qid and sp.kind = r.kind)
union all
select sp.wikidata_id, sp.kind, 'wikipedia', sp.value, sp.raw, sp.from_year, sp.until_year, 1000, sp.sport from seed_period sp
where exists (select 1 from legacy_wikidata_venues.venue v where v.qid = sp.wikidata_id);

delete from core.brand_venue_period;
insert into core.brand_venue_period (wikidata_id, kind, seq, value, raw, from_year, until_year, sport, source_id, source_key)
select a.qid, a.kind, row_number() over (partition by a.qid, a.kind order by a.from_year nulls first, a.until_year nulls last, a.ord), a.val, a.raw, a.from_year, a.until_year, a.sport,
       (select source_id from meta.source where code = a.source),
       case a.source when 'wikidata' then a.qid else 'enwiki:' || v.wikipedia_title || '@' || v.wikipedia_revid end
from per_all a join legacy_wikidata_venues.venue v on v.qid = a.qid;

-- the surface and roof now, per venue: the open-ended period, else the latest; else the infobox's first undated statement (Wikidata's carry no years and
-- list old surfaces too: Oakland Coliseum, Lambeau Field), else Wikidata's
create temp table cur as
select distinct on (qid, kind) qid, kind, val, raw, source
from per_all
order by qid, kind, (until_year is null) desc, coalesce(until_year, from_year) desc nulls last, from_year desc nulls last, ord desc;

create temp table vbase as
select v.qid, v.wikipedia_title, v.wikipedia_revid, v.owner, v.postal_checked, v.label,
       coalesce(v.capacity, p.capacity) as capacity,
       extract(year from coalesce(v.opened_on, p.opened_on))::smallint as opened_year,
       extract(year from coalesce(v.closed_on, p.closed_on))::smallint as wd_closed,
       v.wp_closed_year, v.wp_demolished_year, v.destroyed, v.wp_status, v.wp_closed_raw, v.wp_demolished_raw,
       -- surface: a period, else Wikidata, else the infobox; the first that maps
       cs.val as p_surface, cs.raw as p_surface_raw, cs.source as p_surface_src,
       coalesce(v.surface, p.surface) as wd_surface, v.wp_surface,
       -- roof
       cr.val as p_roof, v.roof as wd_roof, p.roof as pl_roof, v.wp_roof, v.wp_roof_lead,
       coalesce(p.address_street, v.address, v.street_address) as wd_address, v.wp_address
from legacy_wikidata_venues.venue v
left join legacy_franchise_info.place p on p.qid = v.qid
left join cur cs on cs.qid = v.qid and cs.kind = 'surface'
left join cur cr on cr.qid = v.qid and cr.kind = 'roof';

create temp table vpick as
select b.*,
       case when b.p_surface is not null then b.p_surface when pg_temp.surf(b.wp_surface) is not null then pg_temp.surf(b.wp_surface) else pg_temp.surf(b.wd_surface) end as surface,
       case when b.p_surface is not null then b.p_surface_raw when pg_temp.surf(b.wp_surface) is not null then b.wp_surface
            when pg_temp.surf(b.wd_surface) is not null then b.wd_surface else coalesce(b.wp_surface, b.wd_surface) end as surface_raw,
       case when b.p_surface is not null then b.p_surface_src when pg_temp.surf(b.wp_surface) is not null then 'wikipedia'
            when pg_temp.surf(b.wd_surface) is not null then 'wikidata' end as surface_src,
       coalesce(b.p_roof, b.wd_roof, b.pl_roof, b.wp_roof, b.wp_roof_lead) as roof,
       case when b.p_roof is not null then (select source from cur c where c.qid = b.qid and c.kind = 'roof')
            when coalesce(b.wd_roof, b.pl_roof) is not null then 'wikidata' when coalesce(b.wp_roof, b.wp_roof_lead) is not null then 'wikipedia' end as roof_src,
       (select value::int from seed_fact f where f.wikidata_id = b.qid and f.field = 'capacity') as seed_capacity,
       (select value::smallint from seed_fact f where f.wikidata_id = b.qid and f.field = 'opened_year') as seed_opened,
       (select value::smallint from seed_fact f where f.wikidata_id = b.qid and f.field = 'closed_year') as seed_closed
from vbase b;

delete from core.brand_venue_info;
insert into core.brand_venue_info (wikidata_id, capacity, opened_year, closed_year, owner, surface, surface_raw, roof, address, postal_code, status,
                                   source_id, source_key, wikipedia_key, wikipedia_fields)
select x.qid, x.cap, x.opened, x.closed, x.owner, x.surface, x.surface_raw, x.roof, coalesce(x.wd_address, x.wp_address), x.postal_checked,
       case when x.closed is not null then 'closed' when x.destroyed or x.wp_demolished_raw is not null or lower(x.wp_status) like '%demolish%' then 'demolished' else 'open' end,
       (select source_id from meta.source where code = 'wikidata'), x.qid,
       case when x.flds is not null then 'enwiki:' || x.wikipedia_title || '@' || x.wikipedia_revid end, x.flds
from (
  select y.*,
         nullif(concat_ws(',', case when y.surface_src = 'wikipedia' then 'surface' end, case when y.roof_src = 'wikipedia' then 'roof' end,
                                case when y.wd_address is null and y.wp_address is not null then 'address' end,
                                case when y.closed_src = 'wikipedia' then 'closed' end, case when y.cap_src = 'wikipedia' then 'capacity' end,
                                case when y.opened_src = 'wikipedia' then 'opened' end), '') as flds
  from (
    select z.*,
           coalesce(z.seed_capacity, z.capacity) as cap, case when z.seed_capacity is not null then 'wikipedia' end as cap_src,
           coalesce(z.seed_opened, z.opened_year) as opened, case when z.seed_opened is not null then 'wikipedia' end as opened_src,
           case when z.seed_closed is not null then z.seed_closed
                when z.wd_closed is not null then z.wd_closed
                when z.wp_closed_year is not null and (z.opened_year is null or z.wp_closed_year >= z.opened_year) then z.wp_closed_year
                when z.wp_demolished_year is not null and (z.opened_year is null or z.wp_demolished_year >= z.opened_year) then z.wp_demolished_year end as closed,
           case when z.seed_closed is not null then 'wikipedia' when z.wd_closed is not null then 'wikidata'
                when z.wp_closed_year is not null and (z.opened_year is null or z.wp_closed_year >= z.opened_year) then 'wikipedia'
                when z.wp_demolished_year is not null and (z.opened_year is null or z.wp_demolished_year >= z.opened_year) then 'wikipedia' end as closed_src
    from vpick z
  ) y
) x;

-- Holes and corrections, logged (rerunnable: last run's rows are replaced). Nothing is guessed.
delete from meta.data_issue where entity_kind in ('venue_surface', 'venue_closed', 'venue_fact');
-- a surface text no rule of ref.venue_surface_rule covers, in the statements the venue's surface was read from
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'wikidata'), 'venue_surface', v.qid,
       'Surface of ' || coalesce(v.label, v.qid) || ' not in the fixed list: "' || v.surface_raw || '"',
       'surface left empty and the text kept in surface_raw; add a rule to db/seed/venue_surface_rule.csv if it is a surface.'
from vpick v where v.surface is null and v.surface_raw is not null;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'wikidata'), 'venue_surface', r.qid,
       'A dated surface statement of ' || coalesce(v.label, r.qid) || ' not in the fixed list: "' || r.raw || '" (' || coalesce(r.from_year::text, '?') || '-' || coalesce(r.until_year::text, '') || ')',
       'That period is left out of core.brand_venue_period; add a rule to db/seed/venue_surface_rule.csv if it is a surface.'
from per_raw r join legacy_wikidata_venues.venue v on v.qid = r.qid
where r.val is null and r.kind = 'surface' and r.source = (select case when bool_or(x.source = 'wikipedia') then 'wikipedia' else 'wikidata' end from per_raw x where x.qid = r.qid and x.kind = r.kind);
-- Wikidata and the infobox disagree about the surface now
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'wikipedia'), 'venue_surface', v.qid,
       'Surface of ' || coalesce(v.label, v.qid) || ': Wikidata says "' || v.wd_surface || '" (' || pg_temp.surf(v.wd_surface) || '), the English Wikipedia infobox "' || v.wp_surface || '" (' || pg_temp.surf(v.wp_surface) || ')',
       case when v.p_surface is not null then 'The dated statements of ' || v.p_surface_src || ' are used (' || v.p_surface || ' now).' else 'The infobox is used: Wikidata''s statements carry no years and list old surfaces too.' end
from vpick v where pg_temp.surf(v.wd_surface) is not null and pg_temp.surf(v.wp_surface) is not null and pg_temp.surf(v.wd_surface) <> pg_temp.surf(v.wp_surface);
-- gone, with no year; or a closing the infobox gives that was refused (a renovation, a range, several dates)
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'wikidata'), 'venue_closed', i.wikidata_id,
       coalesce(v.label, i.wikidata_id) || ' is gone (' ||
         concat_ws('; ', case when v.destroyed then 'Wikidata: destroyed building or structure' end, case when v.wp_demolished_raw is not null then 'infobox demolished: ' || v.wp_demolished_raw end,
                         case when lower(v.wp_status) like '%demolish%' then 'infobox status: ' || v.wp_status end) || ') but no source gives a year',
       'closed_year left empty, status demolished; Wikidata and Wikipedia are not changed.'
from core.brand_venue_info i join legacy_wikidata_venues.venue v on v.qid = i.wikidata_id
where i.status = 'demolished';
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'wikipedia'), 'venue_closed', i.wikidata_id,
       'The infobox of ' || coalesce(v.label, i.wikidata_id) || ' gives a closing that is not one clean date: "' || v.wp_closed_raw || '"',
       'Not used as a closing year' || case when i.closed_year is not null then ' (closed_year ' || i.closed_year || ' comes from another source).' else '.' end
from core.brand_venue_info i join legacy_wikidata_venues.venue v on v.qid = i.wikidata_id
where v.wp_closed_raw is not null and v.wp_closed_year is null and nullif(btrim(regexp_replace(v.wp_closed_raw, '<!--.*?-->', '', 'g')), '') is not null;
-- hand-checked corrections and the claims no source supports (db/seed/venue_fact.csv); a seed checked against another revision than the one loaded is flagged
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'wikipedia'), 'venue_fact', f.wikidata_id || ':' || f.field,
       coalesce(v.label, f.wikidata_id) || ' ' || f.field || ': ' || f.value || '. ' || f.note
         || case when f.revision_id is not null and v.wikipedia_revid is distinct from f.revision_id then ' (checked against revision ' || f.revision_id || '; the load has ' || coalesce(v.wikipedia_revid::text, 'none') || ')' else '' end,
       case when f.field = 'unsourced' then 'Not used: no citable source.' else 'Used instead of the value the sources give (db/seed/venue_fact.csv, English Wikipedia ' || f.wikipedia_title || ' revision ' || f.revision_id || ', CC BY-SA 4.0).' end
from seed_fact f left join legacy_wikidata_venues.venue v on v.qid = f.wikidata_id;

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
union all select '  surface text not in the list', count(*) from core.brand_venue_info where surface is null and surface_raw is not null
union all select 'surface/roof periods', count(*) from core.brand_venue_period
union all select '  venues with a dated surface', count(distinct wikidata_id) from core.brand_venue_period where kind = 'surface'
union all select 'with closed year', count(closed_year) from core.brand_venue_info
union all select '  status closed', count(*) from core.brand_venue_info where status = 'closed'
union all select '  status demolished (no year)', count(*) from core.brand_venue_info where status = 'demolished'
union all select '  status open', count(*) from core.brand_venue_info where status = 'open'
union all select 'with roof', count(roof) from core.brand_venue_info
union all select 'with address', count(address) from core.brand_venue_info
union all select 'address from the Wikipedia infobox', count(*) from core.brand_venue_info where wikipedia_fields like '%address%'
union all select 'with postal code', count(postal_code) from core.brand_venue_info
union all select 'postal codes refused', count(*) from meta.data_issue where entity_kind = 'venue_postal_code';

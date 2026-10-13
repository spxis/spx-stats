-- core.franchise_home_venue: where each club played its home games, as one chain of periods with no overlap and no hole that a source can fill.
-- Run from the repo root (scripts/build_core.sh does), after 175, 176 and 193, and always before 199_game_venue.sql, which adds the periods the
-- games themselves show (basis 'games') and places every home game. Rerunnable: the table, the venues this step made and its data_issue rows
-- are rebuilt each time; the chain as built here is kept in legacy_game_venue.home_prelim.
--
-- Where a period comes from, best first (a better source wins every day it covers; inside one source the earlier start wins, so a
-- venue a club also used now and then, like the Celtics at Hartford from 1975, never hides the club's real home):
--   0 games  (step 199) the venue most of a club's home games had in a season, from the Retrosheet park, nflverse stadium or NHL API venue.
--   1 seed   db/seed/home_venue.csv: periods read from English Wikipedia (CC BY-SA 4.0) or dated Wikidata statements (CC0), checked by hand.
--            They correct what the next two get wrong (Whalers, Celtics, the Nets 1977-2010, Oilers 1997-98, Panthers 1995-96 ...).
--   2 brand  core.franchise_brand.home_venue (step 175), month precision.
--   3 wikidata core.franchise_venue (step 176), year precision (a move in mid-season shows a season early or late).
-- Wikidata dates a club's home venue by the club's whole name, so today's park covered years it did not exist. Every brand and franchise_venue
-- period is therefore cut to the days its venue stood (core.venue.opened_on to closed_on; dates Wikidata lacks are filled from
-- legacy_game_venue.venue, wrong ones corrected in db/seed/venue_dates.csv); what is cut off is logged ('home_venue_clipped') and left as a
-- gap rather than an anachronism. Seed rows are not cut.
-- A venue item that is a city (San Diego, Houston, Los Angeles, Miami: Wikidata's home venue for a few old teams) is not a venue: it is
-- left out here, logged in meta.data_issue as 'home_venue_city', and the next source fills the days it would have covered.
-- A venue Wikidata names that core.venue lacks (United Center, Meadowlands Arena ...: step 176 drops a venue with no city) is added to
-- core.venue from core.brand_venue (city, region, country, coordinates) or from legacy_game_venue.venue (scripts/game_venue/).

drop table if exists pg_temp.seed_home;
create temp table seed_home (league text, franchise text, qid text, from_d date, until_d date, source text, source_url text, note text);
\copy seed_home from 'db/seed/home_venue.csv' with (format csv, header true)
drop table if exists pg_temp.seed_not_venue;
create temp table seed_not_venue (qid text, why text);
\copy seed_not_venue from 'db/seed/not_a_venue.csv' with (format csv, header true)
drop table if exists pg_temp.seed_park;
create temp table seed_park (park_id text, qid text, label text, confidence text, note text);
\copy seed_park from 'db/seed/retrosheet_park.csv' with (format csv, header true)
drop table if exists pg_temp.seed_venue_dates;
create temp table seed_venue_dates (qid text, opened_on date, closed_on date, why text);
\copy seed_venue_dates from 'db/seed/venue_dates.csv' with (format csv, header true)
drop table if exists pg_temp.seed_city;
create temp table seed_city (wikidata_id text, city text, region text, country_code text);
\copy seed_city from 'db/seed/venue_city.csv' with (format csv, header true)

create or replace function pg_temp.norm(t text) returns text language sql immutable as $$
  select regexp_replace(translate(lower(t), 'éèêëáàâäóôöíîïúûüçñ', 'eeeeaaaaoooiiiuuucn'), '[^a-z0-9]', '', 'g') $$;

delete from meta.data_issue where entity_kind in ('home_venue_city', 'home_venue_fix', 'home_venue_seed', 'home_venue_clipped');

-- ---------------------------------------------------------------- items that are cities, not venues
create temp table notv as
select qid, why from seed_not_venue
union
select source_key, 'the venue label is the name of the city' from core.brand_venue where pg_temp.norm(venue_label) = pg_temp.norm(city);

-- ---------------------------------------------------------------- venues missing from core.venue
create temp table wd as select source_id from meta.source where code = 'wikidata';
create temp table vsrc as
select b.source_key as qid, b.venue_label as label, b.city, b.region, b.country_code, b.latitude::numeric(9, 6) as latitude, b.longitude::numeric(9, 6) as longitude,
       i.capacity, make_date(i.opened_year, 1, 1) as opened_on, make_date(i.closed_year, 12, 31) as closed_on, i.surface, i.roof, i.address, i.postal_code, null::text as kind, 1 as rank
from core.brand_venue b left join core.brand_venue_info i on i.wikidata_id = b.source_key
where b.source_key not in (select qid from notv)
union all
select g.qid, g.label, coalesce(nullif(sc.city, ''), g.city, rp.city),
       coalesce(nullif(sc.region, ''), g.region, rp.region),
       coalesce(nullif(sc.country_code, ''), g.country_code, split_part(coalesce(nullif(sc.region, ''), g.region, rp.region), '-', 1), rp.country),
       g.latitude, g.longitude, g.capacity, g.opened_on, g.closed_on, null, null, null, null,
       case when exists (select 1 from unnest(g.instance_of) t where t ilike '%baseball%' or t ilike '%ballpark%') then 'ballpark'
            when exists (select 1 from unnest(g.instance_of) t where t ilike '%arena%') then 'arena'
            when exists (select 1 from unnest(g.instance_of) t where t ilike '%stadium%') then 'stadium' end, 2
from legacy_game_venue.venue g
left join seed_city sc on sc.wikidata_id = g.qid
left join lateral (   -- the city and state Retrosheet's park list gives, for a park Wikidata gives no usable city
  select p.city,
         case when p.state ~ '^[A-Z]{2}$' and p.state not in ('MX', 'PR') then 'US-' || p.state when p.state = 'ONT' then 'CA-ON' when p.state = 'QUE' then 'CA-QC'
              when p.state = 'England' then 'GB-ENG' end as region,
         case p.state when 'MX' then 'MX' when 'MEX' then 'MX' when 'PR' then 'PR' when 'Australia' then 'AU' when 'JAP' then 'JP' when 'South Korea' then 'KR' end as country
  from seed_park sp join legacy_retrosheet.park p on p.park_id = sp.park_id
  where sp.qid = g.qid order by sp.park_id limit 1) rp on true
where g.qid not in (select qid from notv);
create temp table vpick as
select distinct on (qid) * from vsrc order by qid, rank, (city is null), (latitude is null);

insert into core.venue (city, region, country_code, opened_on, closed_on, capacity, latitude, longitude, source_id, source_key, kind, surface, roof, address, postal_code)
select p.city, p.region, p.country_code, p.opened_on, p.closed_on, p.capacity, p.latitude, p.longitude, (select source_id from wd), p.qid, p.kind, p.surface, p.roof, p.address, p.postal_code
from vpick p
join ref.country rc on rc.country_code = p.country_code
where p.city is not null
  and not exists (select 1 from core.venue v where v.source_id = (select source_id from wd) and v.source_key = p.qid)
on conflict (source_id, source_key) do nothing;

-- the names of a venue made here (or by 176 with no name): brand_venue_name with its years, else the label for all years
create temp table vn_src as
select v.venue_id, n.name, daterange(make_date(n.from_year, 1, 1), make_date(n.until_year, 1, 1)) as rng
from core.venue v join core.brand_venue_name n on n.wikidata_id = v.source_key
where v.source_id = (select source_id from wd) and not exists (select 1 from core.venue_name x where x.venue_id = v.venue_id)
  and (n.from_year is not null or n.until_year is not null) and (n.from_year is null or n.until_year is null or n.from_year < n.until_year)
union all
select v.venue_id, p.label, daterange(null, null)
from core.venue v join vpick p on p.qid = v.source_key
where v.source_id = (select source_id from wd) and not exists (select 1 from core.venue_name x where x.venue_id = v.venue_id)
  and p.label is not null
  and not exists (select 1 from core.brand_venue_name n where n.wikidata_id = v.source_key and (n.from_year is not null or n.until_year is not null));
insert into core.venue_name (venue_id, valid_during, name)
with d as (
  select distinct on (venue_id, lower(rng)) venue_id, name, rng from vn_src where not isempty(rng) order by venue_id, lower(rng) nulls first, upper(rng) nulls last, name
), t as (
  select venue_id, name, unnest(datemultirange(rng) - coalesce(
           (select range_agg(o.rng) from d o where o.venue_id = d.venue_id
               and lower(o.rng) is not null and (lower(d.rng) is null or lower(o.rng) > lower(d.rng))), '{}'::datemultirange)) as rng
  from d
)
select venue_id, rng, name from t where not isempty(rng);

-- ---------------------------------------------------------------- when each venue stood
-- core.venue.opened_on and closed_on come from step 176 (Wikidata, only a statement with a day) and, for a venue this step made, from
-- Wikidata or the brand tables. Fill what is empty from legacy_game_venue.venue (P1619 else P571 for the opening, P3999 else P576 for
-- the closing; a month or year counts as its first day for an opening and its last for a closing), then from core.brand_venue_info
-- (years), then apply db/seed/venue_dates.csv, which corrects a date Wikidata gets wrong (the old Yankee Stadium is dated closed in
-- 1973, when it was shut for rebuilding, but was used until 2008). 'Closed' may be a demolition date, so it can only be too late.
update core.venue v set opened_on = coalesce(g.opened_on, v.opened_on), closed_on = coalesce(g.closed_on, v.closed_on)   -- the load is the better source: a month or year counts at its right end
from legacy_game_venue.venue g
where v.source_id = (select source_id from wd) and v.source_key = g.qid
  and (v.opened_on is distinct from coalesce(g.opened_on, v.opened_on) or v.closed_on is distinct from coalesce(g.closed_on, v.closed_on));
update core.venue v set opened_on = coalesce(v.opened_on, make_date(i.opened_year, 1, 1)), closed_on = coalesce(v.closed_on, make_date(i.closed_year, 12, 31))
from core.brand_venue_info i
where v.source_id = (select source_id from wd) and v.source_key = i.wikidata_id
  and ((v.opened_on is null and i.opened_year is not null) or (v.closed_on is null and i.closed_year is not null));
-- an earlier run of this step wrote the first day of the closing year; a closing year means its last day
update core.venue v set closed_on = make_date(i.closed_year, 12, 31)
from core.brand_venue_info i
where v.source_id = (select source_id from wd) and v.source_key = i.wikidata_id and v.closed_on = make_date(i.closed_year, 1, 1) and not exists (select 1 from legacy_game_venue.venue g where g.qid = v.source_key and g.closed_on is not null);
update core.venue v set opened_on = coalesce(d.opened_on, v.opened_on), closed_on = coalesce(d.closed_on, v.closed_on)
from seed_venue_dates d where v.source_id = (select source_id from wd) and v.source_key = d.qid;

-- ---------------------------------------------------------------- which franchise each seed row is
create temp table fn as
select fl.league_code, i.franchise_id, i.full_name, i.valid_during
from core.franchise_identity i join (select distinct franchise_id, league_code from core.franchise_league) fl using (franchise_id);
create temp table sh as
select s.*, daterange(s.from_d, s.until_d) as rng,
       (select min(fn.franchise_id) from fn where fn.league_code = s.league and fn.full_name = s.franchise and fn.valid_during && daterange(s.from_d, s.until_d)) as franchise_id,
       (select count(distinct fn.franchise_id) from fn where fn.league_code = s.league and fn.full_name = s.franchise and fn.valid_during && daterange(s.from_d, s.until_d)) as n_franchise,
       (select v.venue_id from core.venue v where v.source_id = (select source_id from wd) and v.source_key = s.qid) as venue_id,
       (select source_id from meta.source where code = s.source) as source_id
from seed_home s;

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wd), 'home_venue_seed', h.league || ':' || h.franchise || ':' || coalesce(h.from_d::text, ''),
       case when h.n_franchise = 0 then 'No franchise of ' || h.league || ' called "' || h.franchise || '" in those years'
            when h.n_franchise > 1 then 'More than one franchise of ' || h.league || ' called "' || h.franchise || '" in those years'
            when h.venue_id is null then 'Venue ' || h.qid || ' is not in core.venue (no city or country known; load it with scripts/game_venue/)'
            when h.source_id is null then 'Unknown source ' || h.source
            else 'Period is empty or reversed' end,
       'Seed row not used (db/seed/home_venue.csv).'
from sh h where h.n_franchise <> 1 or h.venue_id is null or h.source_id is null or h.rng is null or isempty(h.rng);

-- ---------------------------------------------------------------- every candidate period
create temp table cand (rowid serial, franchise_id integer, venue_id integer, rng daterange, prio smallint, source_id smallint);
insert into cand (franchise_id, venue_id, rng, prio, source_id)
select franchise_id, venue_id, rng, 1, source_id from sh
where n_franchise = 1 and venue_id is not null and source_id is not null and rng is not null and not isempty(rng);
-- A brand or franchise_venue period is cut to the days its venue stood (opened_on to closed_on): Wikidata dates a club's home venue by the
-- club's whole name, so today's park would otherwise cover years it did not exist. What is cut off is logged ('home_venue_clipped').
create temp table raw_cand (franchise_id integer, venue_id integer, rng daterange, prio smallint, source_id smallint);
insert into raw_cand
select b.franchise_id, v.venue_id, b.valid_during, 2, (select source_id from wd)
from core.franchise_brand b
join core.brand_venue bv on bv.venue_label = b.home_venue and bv.latitude = b.latitude and bv.longitude = b.longitude
join core.venue v on v.source_id = (select source_id from wd) and v.source_key = bv.source_key
where bv.source_key not in (select qid from notv) and not isempty(b.valid_during);
insert into raw_cand
select franchise_id, venue_id, valid_during, 3, source_id from core.franchise_venue where not isempty(valid_during);
insert into cand (franchise_id, venue_id, rng, prio, source_id)
select r.franchise_id, r.venue_id, r.rng * daterange(v.opened_on, case when v.closed_on is not null then v.closed_on + 1 end), r.prio, r.source_id
from raw_cand r join core.venue v using (venue_id)
where not isempty(r.rng * daterange(v.opened_on, case when v.closed_on is not null then v.closed_on + 1 end));
delete from meta.data_issue where entity_kind = 'home_venue_clipped';
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wd), 'home_venue_clipped', 'franchise:' || r.franchise_id || ':' || v.source_key || ':' || r.rng::text,
       case r.prio when 2 then 'franchise_brand' else 'franchise_venue' end || ' gives ' || coalesce((select min(i.full_name) from core.franchise_identity i where i.franchise_id = r.franchise_id and i.valid_during && r.rng), 'franchise ' || r.franchise_id)
         || ' the venue ' || v.source_key || ' for ' || r.rng::text || ', but it stood ' || coalesce(v.opened_on::text, '?') || ' to ' || coalesce(v.closed_on::text, 'now'),
       'Period cut to the days the venue stood; the rest is covered by another source or left without a venue.'
from raw_cand r join core.venue v using (venue_id)
where r.rng <> r.rng * daterange(v.opened_on, case when v.closed_on is not null then v.closed_on + 1 end);

-- a brand period that names a city is logged and left out
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from wd), 'home_venue_city', 'franchise:' || b.franchise_id || ':' || b.valid_during::text,
       'Home venue ' || bv.venue_label || ' (' || bv.source_key || ') of ' || coalesce((select min(i.full_name) from core.franchise_identity i where i.franchise_id = b.franchise_id and i.valid_during && b.valid_during), 'franchise ' || b.franchise_id)
         || ' is a city item, not a venue',
       'Left out of core.franchise_home_venue; the days come from core.franchise_venue or a seed row. Wikidata is not changed.'
from core.franchise_brand b
join core.brand_venue bv on bv.venue_label = b.home_venue and bv.latitude = b.latitude and bv.longitude = b.longitude
where bv.source_key in (select qid from notv);

-- a seed period that replaces another source's venue for some of its days
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select distinct h.source_id, 'home_venue_fix', 'franchise:' || h.franchise_id || ':' || h.rng::text || ':' || ov.source_key,
       'Seed ' || h.source || ' says ' || sv.source_key || ' for ' || h.rng::text || '; core.' ||
         case o.prio when 2 then 'franchise_brand' else 'franchise_venue' end || ' has ' || ov.source_key || ' for ' || o.rng::text,
       'Seed row used (db/seed/home_venue.csv: ' || coalesce(h.note, h.source_url) || ').'
from sh h
join cand o on o.franchise_id = h.franchise_id and o.prio > 1 and o.rng && h.rng and o.venue_id <> h.venue_id
join core.venue sv on sv.venue_id = h.venue_id
join core.venue ov on ov.venue_id = o.venue_id
where h.n_franchise = 1 and h.venue_id is not null and h.source_id is not null and h.rng is not null and not isempty(h.rng);

-- ---------------------------------------------------------------- resolve: best source first, earlier start first, no overlap
delete from core.franchise_home_venue;
insert into core.franchise_home_venue (franchise_id, venue_id, valid_during, basis, source_id)
with ordered as (
  select c.*, coalesce(lower(c.rng), '-infinity'::date) as lo from cand c where not isempty(c.rng)
), cut as (
  select c.rowid, c.franchise_id, c.venue_id, c.prio, c.source_id,
         datemultirange(c.rng) - coalesce((select range_agg(o.rng) from ordered o
              where o.franchise_id = c.franchise_id and o.rowid <> c.rowid
                and (o.prio < c.prio or (o.prio = c.prio and (o.lo < c.lo or (o.lo = c.lo and o.rowid < c.rowid))))), '{}'::datemultirange) as left_over
  from ordered c
)
select franchise_id, venue_id, piece, case prio when 1 then 'seed' when 2 then 'brand' else 'wikidata' end, source_id
from cut, lateral unnest(left_over) as piece
where not isempty(piece);

delete from legacy_game_venue.home_prelim;
insert into legacy_game_venue.home_prelim select franchise_id, venue_id, valid_during, basis, source_id from core.franchise_home_venue;

select 'home venue periods' as what, count(*) as n from core.franchise_home_venue
union all select '  from seed rows', count(*) from core.franchise_home_venue where basis = 'seed'
union all select '  from franchise_brand', count(*) from core.franchise_home_venue where basis = 'brand'
union all select '  from franchise_venue', count(*) from core.franchise_home_venue where basis = 'wikidata'
union all select 'seed rows not used', count(*) from meta.data_issue where entity_kind = 'home_venue_seed'
union all select 'city items left out', count(*) from meta.data_issue where entity_kind = 'home_venue_city'
union all select 'seed fixes of another source', count(*) from meta.data_issue where entity_kind = 'home_venue_fix'
union all select 'periods cut to the venue''s own dates', count(*) from meta.data_issue where entity_kind = 'home_venue_clipped'
union all select 'venues in core.venue', count(*) from core.venue;

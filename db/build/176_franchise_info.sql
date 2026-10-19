-- Fill franchise facts from legacy_franchise_info (Wikidata, CC0): founded and
-- folded dates, identity region, home venues over time (core.venue with address,
-- coordinates, capacity, time zone, kind, surface, roof; core.venue_name;
-- core.venue_feature; core.franchise_venue) and owners over time.
-- Run after the franchises exist (step 100); rerunnable: its own rows are removed first.
--
-- A Wikidata team item is matched to a franchise of the same league when the
-- item's label, official name or alias equals one of the franchise's identity names
-- and the item's years overlap that identity's years. Then:
--  * a dated home venue (P115 with start/end) becomes a franchise_venue period;
--    an undated one covers the matched identities' years, and only when the item has no dated venue;
--  * where periods overlap the later start wins and the rest of the earlier one is kept (the table forbids overlap);
--  * year-precision dates become that year's January 1 in a period bound, but scalar
--    dates (founded_on, folded_on, opened_on, closed_on) take day precision only;
--  * owners (P127) need a start or an end date to be written, with the share (P1107) in share_note;
--  * an identity's region (ISO 3166-2) is the region of the home venue it overlaps most,
--    else of the team's headquarters, else of the one city that name belongs to elsewhere in the build.
-- Street address, postal code, city, region and country of a venue are what
-- scripts/franchise_info/address_normalise.py made with @johnmorrisdotca/address-plus.

create or replace function pg_temp.norm(t text) returns text language sql immutable as $$
  select regexp_replace(translate(lower(t), 'éèêëáàâäóôöíîïúûüçñ', 'eeeeaaaaoooiiiuuucn'), '[^a-z0-9]', '', 'g') $$;

-- ---------------------------------------------------------------- remove what this step wrote
-- An owner row keeps its id on a rerun: remembered by its values before the delete, given back on insert.
create temp table old_owner as
select franchise_id, owner_name, valid_during, share_note, min(franchise_owner_id) as franchise_owner_id
from core.franchise_owner where source_id = (select source_id from meta.source where code = 'wikidata') group by 1, 2, 3, 4;
delete from core.franchise_owner where source_id = (select source_id from meta.source where code = 'wikidata');
delete from core.franchise_venue where source_id = (select source_id from meta.source where code = 'wikidata');
delete from core.venue_feature where source_id = (select source_id from meta.source where code = 'wikidata');
delete from core.venue_name where venue_id in (select venue_id from core.venue where source_id = (select source_id from meta.source where code = 'wikidata'));

-- ---------------------------------------------------------------- match franchises to team items
create temp table ident as
select i.franchise_id, fl.league_code, i.franchise_identity_id, i.location, i.country_code, i.valid_during as vd,
       pg_temp.norm(i.full_name) n,
       row_number() over w = 1 as is_first,
       lead(i.valid_during) over w is null as is_last
from core.franchise_identity i
join (select distinct franchise_id, league_code from core.franchise_league) fl using (franchise_id)
window w as (partition by i.franchise_id order by lower(i.valid_during) nulls first);

create temp table team_names as
select league_code, qid, pg_temp.norm(label) n from legacy_franchise_info.team where label is not null
union
select t.league_code, t.qid, pg_temp.norm(n.name) from legacy_franchise_info.team t
  join legacy_franchise_info.team_name n using (qid) where pg_temp.norm(n.name) <> '';

create temp table match_all as
select distinct i.franchise_id, i.league_code, t.qid, i.franchise_identity_id, i.vd, i.is_first, i.is_last,
       greatest(0, least(coalesce(upper(i.vd), current_date), coalesce(t.dissolved, current_date))
                 - greatest(coalesce(lower(i.vd), '1800-01-01'), coalesce(t.inception, '1800-01-01'))) as days
from ident i
join team_names tn on tn.league_code = i.league_code and tn.n = i.n
join legacy_franchise_info.team t on t.league_code = tn.league_code and t.qid = tn.qid
where coalesce(extract(year from t.inception), -9999) <= coalesce(extract(year from upper(i.vd)), 9999)
  and coalesce(extract(year from lower(i.vd)), -9999) <= coalesce(extract(year from t.dissolved), 9999);

-- an item is one franchise: when its name fits several, keep the one it overlaps for the most days
-- (the Orioles item also fits the 1901-02 Baltimore Orioles, who became the Yankees)
create temp table match as
select m.franchise_id, m.league_code, m.qid, m.franchise_identity_id, m.vd, m.is_first, m.is_last
from match_all m
join (select qid, franchise_id, sum(days) d, rank() over (partition by qid order by sum(days) desc) r
        from match_all group by qid, franchise_id) k on k.qid = m.qid and k.franchise_id = m.franchise_id and k.r = 1;

-- years a matched item covers on a franchise: the matched identities together
create temp table cover as
select franchise_id, qid,
       daterange(min(lower(vd)), case when bool_or(upper_inf(vd)) then null else max(upper(vd)) end) as rng
from match group by franchise_id, qid;

-- ---------------------------------------------------------------- founded / folded
with f as (
  select m.franchise_id,
         min(t.inception) filter (where m.is_first and t.inception_prec >= 11) as inc,
         max(t.dissolved) filter (where m.is_last and t.dissolved_prec >= 11) as dis
  from match m join legacy_franchise_info.team t using (league_code, qid)
  group by m.franchise_id
)
update core.franchise c
   set founded_on = coalesce(c.founded_on, f.inc),
       folded_on  = coalesce(c.folded_on, case when exists (
                       select 1 from core.franchise_identity i where i.franchise_id = c.franchise_id and upper(i.valid_during) is not null
                         and not exists (select 1 from core.franchise_identity j where j.franchise_id = c.franchise_id and upper_inf(j.valid_during)))
                     then f.dis end),
       updated_at = now()
  from f
 where c.franchise_id = f.franchise_id
   and (c.founded_on is null or c.folded_on is null)
   and (coalesce(c.founded_on, f.inc) is null or case when exists (
                       select 1 from core.franchise_identity i where i.franchise_id = c.franchise_id and upper(i.valid_during) is not null
                         and not exists (select 1 from core.franchise_identity j where j.franchise_id = c.franchise_id and upper_inf(j.valid_during)))
                     then coalesce(c.folded_on, f.dis) end is null
       or coalesce(c.founded_on, f.inc) <= coalesce(c.folded_on, f.dis))
   and (f.inc is not null or f.dis is not null);

-- ---------------------------------------------------------------- home venue periods
create temp table fv_raw as
with tp as (
  select m.franchise_id, tp.place_qid, tp.starts_on, tp.ends_on, c.rng,
         exists (select 1 from legacy_franchise_info.team_place d
                  where d.qid = tp.qid and d.kind = 'home_venue' and (d.starts_on is not null or d.ends_on is not null)) as team_has_dated
  from (select distinct franchise_id, qid from match) m
  join cover c using (franchise_id, qid)
  join legacy_franchise_info.team_place tp on tp.qid = m.qid and tp.kind = 'home_venue' and tp.rank <> 'deprecated'
  join legacy_franchise_info.place p on p.qid = tp.place_qid
)
select distinct franchise_id, place_qid,
       case when starts_on is null and ends_on is null then rng else daterange(starts_on, ends_on) end as rng
from tp
where (starts_on is not null or ends_on is not null or not team_has_dated);

-- a period that starts later wins over an earlier one it overlaps; what is left of the earlier one stays
-- (Yankee Stadium 1923-2008 keeps its years either side of Shea Stadium's 1974)
create temp table fv_trim as
with d as (
  select distinct on (franchise_id, lower(rng)) franchise_id, place_qid, rng
  from fv_raw where not isempty(rng)
  order by franchise_id, lower(rng) nulls first, upper(rng) nulls last, place_qid
)
select franchise_id, place_qid, unnest(datemultirange(rng) - coalesce(
         (select range_agg(o.rng) from d o where o.franchise_id = d.franchise_id
             and lower(o.rng) is not null and (lower(d.rng) is null or lower(o.rng) > lower(d.rng))), '{}'::datemultirange)) as rng
from d;
delete from fv_trim where isempty(rng);

-- ---------------------------------------------------------------- venues
create temp table venue_src as
select p.*, p.address_city as city
from legacy_franchise_info.place p
where p.qid in (select place_qid from fv_trim);

create temp table venue_new as
select v.qid from venue_src v join ref.country rc on rc.country_code = v.address_country where v.city is not null;

insert into core.venue (city, region, country_code, opened_on, closed_on, capacity, latitude, longitude, source_id, source_key,
                        time_zone, kind, address, postal_code, surface, roof, is_indoor, architect, cost_usd)
select v.city, v.address_region, v.address_country,
       case when v.opened_prec >= 11 then v.opened_on end, case when v.closed_prec >= 11 then v.closed_on end,
       v.capacity, v.latitude, v.longitude, (select source_id from meta.source where code = 'wikidata'), v.qid,
       v.time_zone,
       case when exists (select 1 from unnest(v.instance_of) t where t ilike '%baseball%' or t ilike '%ballpark%') then 'ballpark'
            when exists (select 1 from unnest(v.instance_of) t where t ilike '%arena%') then 'arena'
            when exists (select 1 from unnest(v.instance_of) t where t ilike '%stadium%') then 'stadium' end,
       v.address_street, v.address_postal,
       case when v.surface !~ ';' then v.surface end, v.roof,
       case when v.roof in ('dome', 'retractable') or exists (select 1 from unnest(v.instance_of) t where t ilike '%indoor arena%') then true end,
       v.architect, case when v.cost_unit = 'Q4917' then round(v.cost) end
from venue_src v
join ref.country rc on rc.country_code = v.address_country
where v.city is not null
on conflict (source_id, source_key) do update set
  city = excluded.city, region = excluded.region, country_code = excluded.country_code, opened_on = excluded.opened_on,
  closed_on = excluded.closed_on, capacity = excluded.capacity, latitude = excluded.latitude, longitude = excluded.longitude,
  time_zone = excluded.time_zone, kind = excluded.kind, address = excluded.address, postal_code = excluded.postal_code,
  surface = excluded.surface, roof = excluded.roof, is_indoor = excluded.is_indoor, architect = excluded.architect, cost_usd = excluded.cost_usd;

-- A venue keeps its venue_id from run to run (the insert above updates it in place); one Wikidata no longer gives a home to is deleted when nothing points at it.
delete from core.venue v where v.source_id = (select source_id from meta.source where code = 'wikidata')
  and v.source_key not in (select qid from venue_new)
  and not exists (select 1 from core.game g where g.venue_id = v.venue_id)
  and not exists (select 1 from core.team_season t where t.home_venue_id = v.venue_id)
  and not exists (select 1 from core.franchise_home_venue h where h.venue_id = v.venue_id)   -- steps 198 and 199 (rerun them after this one)
  and not exists (select 1 from core.game_venue gv where gv.venue_id = v.venue_id)
  and not exists (select 1 from core.soccer_match m where m.venue_id = v.venue_id)
  and not exists (select 1 from core.venue_final_game f where f.venue_id = v.venue_id)
  and not exists (select 1 from core.venue_game_season q where q.venue_id = v.venue_id);

create temp table vmap as
select venue_id, source_key as qid from core.venue where source_id = (select source_id from meta.source where code = 'wikidata');

insert into core.franchise_venue (franchise_id, venue_id, valid_during, source_id)
select f.franchise_id, vm.venue_id, f.rng, (select source_id from meta.source where code = 'wikidata')
from fv_trim f join vmap vm on vm.qid = f.place_qid;

-- names: dated names as given; the label fills the open end (or the whole range when nothing is dated)
create temp table vn_raw as
with named as (
  select qid, name, daterange(starts_on, ends_on) as rng from legacy_franchise_info.place_name
   where kind in ('official', 'name') and (starts_on is not null or ends_on is not null)
), cur as (
  select p.qid, p.label as name,
         daterange((select max(upper(n.rng)) from named n where n.qid = p.qid), null) as rng
  from legacy_franchise_info.place p
  where p.label is not null and p.qid in (select qid from vmap)
    and not exists (select 1 from named n where n.qid = p.qid and pg_temp.norm(n.name) = pg_temp.norm(p.label))
    and not exists (select 1 from named n where n.qid = p.qid and upper_inf(n.rng))
)
select qid, name, rng from named where qid in (select qid from vmap) and not isempty(rng)
union all
select qid, name, rng from cur where not isempty(rng)
union all   -- a label that is also a dated name keeps its dates; one with no dated names at all covers every year
select p.qid, p.label, daterange(null, null) from legacy_franchise_info.place p
 where p.qid in (select qid from vmap) and p.label is not null
   and not exists (select 1 from legacy_franchise_info.place_name n where n.qid = p.qid and n.kind in ('official', 'name') and (n.starts_on is not null or n.ends_on is not null));

insert into core.venue_name (venue_id, valid_during, name)
with d as (
  select distinct on (qid, lower(rng)) qid, name, rng from vn_raw order by qid, lower(rng) nulls first, upper(rng) nulls last, name
), t as (
  select qid, name, unnest(datemultirange(rng) - coalesce(
           (select range_agg(o.rng) from d o where o.qid = d.qid
               and lower(o.rng) is not null and (lower(d.rng) is null or lower(o.rng) > lower(d.rng))), '{}'::datemultirange)) as rng
  from d
)
select vm.venue_id, t.rng, t.name from t join vmap vm using (qid) where not isempty(t.rng);

insert into core.venue_feature (venue_id, valid_during, surface, roof, capacity, source_id)
select vm.venue_id, daterange(null, null), case when p.surface !~ ';' then p.surface end, p.roof, p.capacity,
       (select source_id from meta.source where code = 'wikidata')
from vmap vm join legacy_franchise_info.place p on p.qid = vm.qid
where p.roof is not null or (p.surface is not null and p.surface !~ ';');

-- ---------------------------------------------------------------- owners
insert into core.franchise_owner (franchise_owner_id, franchise_id, owner_name, valid_during, share_note, source_id)
overriding system value
select coalesce(oo.franchise_owner_id, nextval(pg_get_serial_sequence('core.franchise_owner', 'franchise_owner_id'))), n.*
from (
select distinct c.franchise_id, o.owner_name,
       daterange(o.starts_on, o.ends_on) as valid_during,
       case when o.share is not null then round(o.share * 100, 1)::text || '% share' end as share_note,
       (select source_id from meta.source where code = 'wikidata') as source_id
from cover c
join legacy_franchise_info.team_owner o on o.qid = c.qid and o.rank <> 'deprecated'
where o.owner_name is not null
  and (o.starts_on is not null or o.ends_on is not null)       -- an owner with no dates is left out: unbounded would claim years nobody gave
  and not isempty(daterange(o.starts_on, o.ends_on))
  and (o.starts_on is null or o.ends_on is null or o.starts_on <= o.ends_on)) n
left join old_owner oo on oo.franchise_id = n.franchise_id and oo.owner_name = n.owner_name and oo.valid_during = n.valid_during
                      and oo.share_note is not distinct from n.share_note;

-- ---------------------------------------------------------------- identity region
create temp table id_region as
with by_venue as (
  select i.franchise_identity_id, v.region, v.country_code,
         row_number() over (partition by i.franchise_identity_id
           order by (least(coalesce(upper(i.vd), '2100-01-01'), coalesce(upper(f.valid_during), '2100-01-01'))
                    - greatest(coalesce(lower(i.vd), '1800-01-01'), coalesce(lower(f.valid_during), '1800-01-01'))) desc, lower(f.valid_during)) rn
  from ident i
  join core.franchise_venue f on f.franchise_id = i.franchise_id and f.valid_during && i.vd
  join core.venue v on v.venue_id = f.venue_id
  where v.region is not null
), by_hq as (
  select m.franchise_identity_id, p.address_region as region, p.address_country as country_code,
         row_number() over (partition by m.franchise_identity_id order by (tp.starts_on is null), tp.starts_on desc nulls last) rn
  from match m
  join legacy_franchise_info.team_place tp on tp.qid = m.qid and tp.kind = 'headquarters' and tp.rank <> 'deprecated'
       and (daterange(tp.starts_on, tp.ends_on) && m.vd)
  join legacy_franchise_info.place p on p.qid = tp.place_qid
  where p.address_region is not null
)
select franchise_identity_id, region, country_code from by_venue where rn = 1
union all
select franchise_identity_id, region, country_code from by_hq where rn = 1
  and franchise_identity_id not in (select franchise_identity_id from by_venue where rn = 1);

-- a name that belongs to exactly one region wherever a venue or headquarters stands in a city of that name
insert into id_region
select i.franchise_identity_id, x.region, x.country_code
from ident i
join (select pg_temp.norm(city) n, min(region) region, min(country_code) country_code
        from legacy_franchise_info.city_region
       group by pg_temp.norm(city) having count(distinct region) = 1) x on x.n = pg_temp.norm(i.location)
where i.franchise_identity_id not in (select franchise_identity_id from id_region);

update core.franchise_identity i
   set region = r.region
  from id_region r
 where r.franchise_identity_id = i.franchise_identity_id and r.country_code = i.country_code;

-- ---------------------------------------------------------------- what this step did
select 'franchises matched' as what, count(distinct franchise_id) from match
union all select 'team items matched', count(distinct qid) from match
union all select 'team items not matched', count(*) from legacy_franchise_info.team t where not exists (select 1 from match m where m.qid = t.qid)
union all select 'venues', count(*) from vmap
union all select 'franchise_venue rows', count(*) from core.franchise_venue
union all select 'franchise_owner rows', count(*) from core.franchise_owner
union all select 'identities with region', count(*) from core.franchise_identity where region is not null;

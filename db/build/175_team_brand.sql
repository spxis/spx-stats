-- Fill core.franchise_brand from legacy_team_brand (Wikidata, CC0; logo files on
-- Wikimedia Commons). Run after the franchises exist (step 100). A Wikidata team
-- is matched to a franchise identity of the same league by its name; the brand
-- row covers that identity's years, open at the franchise's first and last
-- identity, and split where the team's dated home venues (P115) change. A team with
-- no colour, no Commons logo and no venue coordinate gets no row.
--
-- Colours also come from Wikipedia's colour modules (legacy_team_brand.wikipedia_colour,
-- CC BY-SA 4.0, source 'wikipedia'): see the last statement. Those rows carry the
-- colours for the years the module dates them, one row per colour period of an identity.
delete from core.franchise_brand where source_id = (select source_id from meta.source where code = 'wikidata');
delete from core.franchise_brand where source_id = (select source_id from meta.source where code = 'wikipedia');

create or replace function pg_temp.norm(t text) returns text language sql immutable as $$
  select regexp_replace(translate(lower(t), 'éèêëáàâäóôöíîïúûüçñ', 'eeeeaaaaoooiiiuuucn'), '[^a-z0-9]', '', 'g') $$;

with ident as (
  select i.franchise_id, fl.league_code, pg_temp.norm(i.full_name) n, i.valid_during,
         i.valid_during = first_value(i.valid_during) over w as is_first,
         i.valid_during = last_value(i.valid_during) over w as is_last
  from core.franchise_identity i
  join (select distinct franchise_id, league_code from core.franchise_league) fl using (franchise_id)
  window w as (partition by i.franchise_id order by lower(i.valid_during) nulls first
               rows between unbounded preceding and unbounded following)
), colours as (
  select qid, (array_agg(hex order by ordinal))[1] p, (array_agg(hex order by ordinal))[2] s
  from legacy_team_brand.team_colour where hex is not null and rank <> 'deprecated' group by qid
), logo as (
  select distinct on (qid) qid, thumb_url, page_url,
         licence || case when restrictions ilike '%trademark%' then ' (trademark)' else '' end as licence
  from legacy_team_brand.team_logo where thumb_url is not null
  order by qid, (rank = 'preferred') desc, ends_on is null desc, starts_on desc nulls last, file
), pl as (
  select p.*, (latitude is not null) as has_xy,
         (starts_on is not null or ends_on is not null) as dated
  from legacy_team_brand.team_place p where coalesce(rank, '') <> 'deprecated'
), pick as (   -- the venue periods a team is given: dated home venues, else one undated home venue, else headquarters, else located-in
  select qid, label, latitude, longitude, daterange(starts_on, ends_on) as vr from pl
   where kind = 'home_venue' and dated
  union all
  select * from (
    select distinct on (qid) qid, label, latitude, longitude, daterange(null, null)
    from pl where kind = 'home_venue' and not dated
      and not exists (select 1 from pl d where d.qid = pl.qid and d.kind = 'home_venue' and d.dated)
    order by qid, has_xy desc, place_qid) h
  union all
  select * from (
    select distinct on (qid) qid, label, latitude, longitude, daterange(null, null)
    from pl where kind in ('headquarters', 'located_in')
      and not exists (select 1 from pl d where d.qid = pl.qid and d.kind = 'home_venue')
    order by qid, has_xy desc, (kind = 'headquarters') desc, place_qid) f
), cand as (
  select distinct on (i.franchise_id, rng)
         i.franchise_id, rng, c.p, c.s, l.thumb_url, l.licence, l.page_url, t.qid,
         v.label as venue, v.latitude, v.longitude
  from legacy_team_brand.team t
  join ident i on i.league_code = t.league_code and i.n = pg_temp.norm(t.label)
  cross join lateral (select daterange(case when i.is_first then null else lower(i.valid_during) end,
                                        case when i.is_last then null else upper(i.valid_during) end) as vd) x
  left join pick v on v.qid = t.qid and not isempty(x.vd * v.vr)
  cross join lateral (select case when v.qid is null then x.vd else x.vd * v.vr end as rng) r
  left join colours c on c.qid = t.qid
  left join logo l on l.qid = t.qid
  where c.p is not null or l.thumb_url is not null or v.latitude is not null
  order by i.franchise_id, rng, (c.p is not null) desc, (l.thumb_url is not null) desc, (v.latitude is not null) desc, t.qid
)
insert into core.franchise_brand (franchise_id, valid_during, primary_hex, secondary_hex, logo_url, logo_licence, logo_page,
                                  home_venue, latitude, longitude, source_id, source_key)
select franchise_id, rng, p, s, thumb_url, licence, page_url, venue, latitude, longitude,
       (select source_id from meta.source where code = 'wikidata'), qid
from cand
on conflict (franchise_id, valid_during, source_id) do nothing;

-- Team colours from Wikipedia's Lua colour modules. An identity (a name and its years)
-- takes the entries of its league whose name matches: an undated entry fills the years no
-- dated entry of that identity covers (slivers under 180 days are dropped when dated entries
-- exist), a dated entry ('Name XXXXthruYYYY', calendar years inclusive) covers its years, the
-- later start winning an overlap. An entry that only points at another (Phoenix Coyotes ->
-- Arizona Coyotes) carries the colours it points at; a dated one matches the name it points at
-- too, because the modules write history in both directions.
with ident as (
  select i.franchise_id fid, fl.league_code, pg_temp.norm(i.full_name) n, i.valid_during vd
  from core.franchise_identity i
  join (select distinct franchise_id, league_code from core.franchise_league) fl using (franchise_id)
), entry as (
  select w.*, pg_temp.norm(team_name) n_key, pg_temp.norm(resolved_name) n_res,
         case when start_year is not null
              then daterange(make_date(start_year, 1, 1), make_date(coalesce(end_year, start_year) + 1, 1, 1)) end as yr
  from legacy_team_brand.wikipedia_colour w where primary_hex is not null
), m as (
  select i.fid, i.vd, e.module_page, e.seq, e.entry_key, e.start_year, e.alias_of, e.primary_hex, e.secondary_hex,
         e.yr is not null as dated, coalesce(e.yr * i.vd, i.vd) as rng0
  from ident i
  join entry e on e.league_code = i.league_code
              and (e.n_key = i.n or (e.yr is not null and e.n_res = i.n))
  where e.yr is null or not isempty(e.yr * i.vd)
), ranged as (
  select * from m where dated
), ranged_cut as (
  select r.fid, r.vd, r.entry_key, r.primary_hex, r.secondary_hex,
         unnest(datemultirange(r.rng0) - coalesce(
           (select range_agg(o.rng0) from ranged o
             where o.fid = r.fid and o.vd = r.vd and (o.start_year, o.seq) > (r.start_year, r.seq)),
           '{}'::datemultirange)) as rng
  from ranged r
), sliver as (   -- what dated entries leave of an identity, when under 180 days (a season starts in April, a year in January)
  select d.fid, d.vd, unnest(datemultirange(d.vd) - (select range_agg(o.rng0) from ranged o where o.fid = d.fid and o.vd = d.vd)) as rng
  from (select distinct fid, vd from ranged) d
), ranged_piece as (   -- a sliver touching a dated piece joins it
  select c.fid, c.vd, c.entry_key, c.primary_hex, c.secondary_hex,
         daterange(
           coalesce((select min(lower(s.rng)) from sliver s where s.fid = c.fid and s.vd = c.vd
                      and upper(s.rng) = lower(c.rng) and upper(s.rng) - lower(s.rng) < 180), lower(c.rng)),
           case when upper(c.rng) is null then null else
             coalesce((select max(upper(s.rng)) from sliver s where s.fid = c.fid and s.vd = c.vd
                        and lower(s.rng) = upper(c.rng) and upper(s.rng) - lower(s.rng) < 180), upper(c.rng)) end) as rng
  from ranged_cut c
), base as (
  select distinct on (fid, vd) * from m where not dated
  order by fid, vd, (alias_of is null) desc, seq
), base_piece as (
  select b.fid, b.vd, b.entry_key, b.primary_hex, b.secondary_hex,
         unnest(datemultirange(b.vd) - coalesce(
           (select range_agg(o.rng0) from ranged o where o.fid = b.fid and o.vd = b.vd),
           '{}'::datemultirange)) as rng,
         exists (select 1 from ranged o where o.fid = b.fid and o.vd = b.vd) as has_dated
  from base b
), piece as (
  select fid, entry_key, primary_hex, secondary_hex, rng from ranged_piece where not isempty(rng)
  union all
  select fid, entry_key, primary_hex, secondary_hex, rng from base_piece
   where not isempty(rng) and not (has_dated and coalesce(upper(rng) - lower(rng), 9999) < 180)
)
insert into core.franchise_brand (franchise_id, valid_during, primary_hex, secondary_hex, source_id, source_key)
select fid, rng, primary_hex, secondary_hex, (select source_id from meta.source where code = 'wikipedia'), entry_key
from piece
on conflict (franchise_id, valid_during, source_id) do nothing;

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
-- Home venue statements known to be wrong in Wikidata (db/seed/venue_fix.csv: team item, venue item, why) are left out, and logged below.
-- A team's home venues that carry no dates take the years of the venue itself, from its opening to its closing (legacy_franchise_info.place),
-- preferred rank first, the later opening next; so a stadium is never shown before it opened or after it closed.
drop table if exists pg_temp.seed_venue_fix;
create temp table seed_venue_fix (team_qid text, place_qid text, reason text);
\copy seed_venue_fix from 'db/seed/venue_fix.csv' with (format csv, header true)
-- A statement the seed leaves out is also taken off rows an earlier run already wrote (a city that stood in for the venue): the row keeps its colours and logo.
update core.franchise_brand b set home_venue = null, latitude = null, longitude = null
from seed_venue_fix x join legacy_franchise_info.place pl on pl.qid = x.place_qid
where b.source_key = x.team_qid and b.home_venue = pl.label;
-- A club item Wikidata gives no home venue (only its headquarters city: the Houston Oilers, Los Angeles Raiders, San Diego Chargers and Florida Marlins items)
-- takes the venues of db/seed/home_venue.csv (English Wikipedia or dated Wikidata, checked by hand) for the club of that name; a city is not a venue.
drop table if exists pg_temp.seed_home;
create temp table seed_home (league text, franchise text, qid text, from_d date, until_d date, source text, source_url text, note text);
\copy seed_home from 'db/seed/home_venue.csv' with (format csv, header true)

-- Insert missing brand rows only (on conflict do nothing below). Do not delete all wikidata/wikipedia
-- brands: a WNBA load must not rewrite other leagues' franchise_brand ids.

create or replace function pg_temp.norm(t text) returns text language sql immutable as $$
  select regexp_replace(translate(lower(t), 'éèêëáàâäóôöíîïúûüçñ', 'eeeeaaaaoooiiiuuucn'), '[^a-z0-9]', '', 'g') $$;

with ident as (
  select i.franchise_id, fl.league_code, pg_temp.norm(i.full_name) n, i.valid_during,
         i.valid_during = first_value(i.valid_during) over w as is_first,
         i.valid_during = last_value(i.valid_during) over w as is_last,
         pg_temp.norm(i.full_name) = last_value(pg_temp.norm(i.full_name)) over w as is_last_name
  from core.franchise_identity i
  join (select distinct franchise_id, league_code from core.franchise_league) fl using (franchise_id)
  window w as (partition by i.franchise_id order by lower(i.valid_during) nulls first
               rows between unbounded preceding and unbounded following)
), colours as (
  select qid, (array_agg(hex order by ordinal))[1] p, (array_agg(hex order by ordinal))[2] s
  from legacy_team_brand.team_colour where hex is not null and rank <> 'deprecated' group by qid
), logo as (
  select distinct on (qid) qid, thumb_url, page_url, licence, fallback from (
    select qid, thumb_url, page_url,
           licence || case when restrictions ilike '%trademark%' then ' (trademark)' else '' end as licence,
           false as fallback, (rank = 'preferred') as pref, ends_on, starts_on, file
    from legacy_team_brand.team_logo where thumb_url is not null
    union all   -- a team Wikidata has no logo for: the picture in its English Wikipedia article (the current logo)
    select qid, thumb_url, page_url, licence, true, false, null, null, file
    from legacy_team_brand.wikipedia_logo
  ) x
  order by qid, fallback, pref desc, ends_on is null desc, starts_on desc nulls last, file
), pl as (
  select p.*, (latitude is not null) as has_xy,
         (starts_on is not null or ends_on is not null) as dated
  from legacy_team_brand.team_place p where coalesce(rank, '') <> 'deprecated'
    and not exists (select 1 from seed_venue_fix x where x.team_qid = p.qid and x.place_qid = p.place_qid)
), seedpl as (   -- the seed venues of a club item with no home venue statement of its own, with the coordinates of the venue item
  select t.qid, v.label, v.latitude, v.longitude, true as has_xy, daterange(h.from_d, h.until_d) as vr
  from legacy_team_brand.team t
  join seed_home h on h.league = t.league_code and pg_temp.norm(h.franchise) = pg_temp.norm(t.label)
  join lateral (select p.label, p.latitude, p.longitude from legacy_franchise_info.place p where p.qid = h.qid and p.latitude is not null
                union all select g.label, g.latitude, g.longitude from legacy_game_venue.venue g where g.qid = h.qid and g.latitude is not null limit 1) v on true
  where not exists (select 1 from legacy_team_brand.team_place d where d.qid = t.qid and d.kind = 'home_venue' and coalesce(d.rank, '') <> 'deprecated')
    and exists (select 1 from legacy_team_brand.team_place d where d.qid = t.qid and d.kind in ('headquarters', 'located_in'))   -- only where a city would otherwise stand in for the venue
), und as (   -- undated home venues of a team with no dated one, with the years of the venue item itself (opened, closed)
  select pl.qid, pl.place_qid, pl.label, pl.latitude, pl.longitude, pl.has_xy, (pl.rank = 'preferred') as pref,
         p.opened_on as lo, p.closed_on as hi
  from pl left join legacy_franchise_info.place p on p.qid = pl.place_qid
  where pl.kind = 'home_venue' and not pl.dated
    and not exists (select 1 from pl d where d.qid = pl.qid and d.kind = 'home_venue' and d.dated)
), cuts as (   -- the dates at which a team's set of open venues changes
  select qid, array_remove(array_agg(distinct d order by d), null) as b
  from (select qid, lo as d from und union all select qid, hi from und) x group by qid
), seg as (   -- the stretches between them, the first and the last open
  select c.qid, case when i = 0 then null else c.b[i] end as s, case when i = coalesce(cardinality(c.b), 0) then null else c.b[i + 1] end as e
  from cuts c cross join lateral generate_series(0, coalesce(cardinality(c.b), 0)) i
), seg_venue as (   -- the venue of each stretch: one that was open for all of it, with coordinates, preferred, the latest opened
  select distinct on (g.qid, g.s) g.qid, g.s, g.e, u.place_qid, u.label, u.latitude, u.longitude
  from seg g join und u on u.qid = g.qid
     and (u.lo is null or (g.s is not null and u.lo <= g.s))
     and (u.hi is null or (g.e is not null and u.hi >= g.e))
  order by g.qid, g.s nulls first, u.has_xy desc, u.pref desc, u.lo desc nulls last, u.place_qid
), island as (   -- neighbouring stretches with the same venue become one period
  select *, sum(case when place_qid is not distinct from lag_p and s is not distinct from lag_e then 0 else 1 end)
              over (partition by qid order by s nulls first) as grp
  from (select *, lag(place_qid) over w as lag_p, lag(e) over w as lag_e
        from seg_venue window w as (partition by qid order by s nulls first)) y
), pick as (   -- the venue periods a team is given: dated home venues, else its undated home venues by their own years, else headquarters, else located-in
  select qid, label, latitude, longitude, daterange(starts_on, ends_on) as vr from pl
   where kind = 'home_venue' and dated
  union all
  select qid, label, latitude, longitude,
         daterange(case when bool_or(s is null) then null else min(s) end, case when bool_or(e is null) then null else max(e) end)
  from island group by qid, place_qid, label, latitude, longitude, grp
  union all
  select qid, label, latitude, longitude, vr from seedpl
  union all
  select * from (
    select distinct on (qid) qid, label, latitude, longitude, daterange(null, null)
    from pl where kind in ('headquarters', 'located_in')
      and not exists (select 1 from pl d where d.qid = pl.qid and d.kind = 'home_venue')
      and not exists (select 1 from seedpl s where s.qid = pl.qid)
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
                  and (t.inception is null and t.dissolved is null or daterange(date_trunc('year', t.inception)::date, (date_trunc('year', t.dissolved) + interval '1 year')::date) && i.valid_during)
                  -- a club item of another era (Milwaukee Brewers 1901 and 1970) gives that identity no venue; whole years, Wikidata dates are often a year
  cross join lateral (select case when v.qid is null then x.vd else x.vd * v.vr end as rng) r
  left join colours c on c.qid = t.qid
  left join logo l on l.qid = t.qid and (not l.fallback or i.is_last_name)   -- the Wikipedia picture is the current logo: only for the years the club has borne its current name
  where c.p is not null or l.thumb_url is not null or v.latitude is not null
  order by i.franchise_id, rng, (c.p is not null) desc, (l.thumb_url is not null) desc, (v.latitude is not null) desc, t.qid
)
, spans as (   -- every identity a team with a logo matches, with the logo it would wear
  select i.franchise_id, t.qid, x.vd, l.thumb_url, l.licence, l.page_url
  from legacy_team_brand.team t
  join ident i on i.league_code = t.league_code and i.n = pg_temp.norm(t.label)
  cross join lateral (select daterange(case when i.is_first then null else lower(i.valid_during) end,
                                        case when i.is_last then null else upper(i.valid_during) end) as vd) x
  join logo l on l.qid = t.qid and (not l.fallback or i.is_last_name)
), ins as (
  insert into core.franchise_brand (franchise_id, valid_during, primary_hex, secondary_hex, logo_url, logo_licence, logo_page,
                                    home_venue, latitude, longitude, source_id, source_key)
  select franchise_id, rng, p, s, thumb_url, licence, page_url, venue, latitude, longitude,
         (select source_id from meta.source where code = 'wikidata'), qid
  from cand
  on conflict (franchise_id, valid_during, source_id) do nothing
  returning 1
)
-- A venue period only covers the years a dated home venue does; the logo of an identity belongs to all its years, so the years
-- the venue periods leave are given the logo alone. A season is then shown the logo of its own name, or none.
insert into core.franchise_brand (franchise_id, valid_during, logo_url, logo_licence, logo_page, source_id, source_key)
select s.franchise_id, u.rng, s.thumb_url, s.licence, s.page_url, (select source_id from meta.source where code = 'wikidata'), s.qid
from spans s
left join lateral (select range_agg(c.rng) a from cand c where c.franchise_id = s.franchise_id and c.qid = s.qid and c.thumb_url is not null) g on true
cross join lateral unnest(datemultirange(s.vd) - coalesce(g.a, '{}'::datemultirange)) u(rng)
where not isempty(u.rng)
on conflict (franchise_id, valid_during, source_id) do nothing;

-- A club whose name has no Wikidata item of its own (the Atlanta Thrashers and the Phoenix Coyotes are the one item of the Jets and the Coyotes of today)
-- gets its seed venues (db/seed/home_venue.csv) for the years of that name, where no brand row has a venue already.
insert into core.franchise_brand (franchise_id, valid_during, home_venue, latitude, longitude, source_id, source_key)
select i.franchise_id, r.rng, v.label, v.latitude, v.longitude, (select source_id from meta.source where code = 'wikipedia'), h.qid
from seed_home h
join (select distinct i.franchise_id, fl.league_code, i.full_name, i.valid_during
      from core.franchise_identity i join core.franchise_league fl using (franchise_id)) i
  on i.league_code = h.league and pg_temp.norm(i.full_name) = pg_temp.norm(h.franchise)
cross join lateral (select daterange(h.from_d, h.until_d) * i.valid_during as rng) r
join lateral (select p.label, p.latitude, p.longitude from legacy_franchise_info.place p where p.qid = h.qid and p.latitude is not null
              union all select g.label, g.latitude, g.longitude from legacy_game_venue.venue g where g.qid = h.qid and g.latitude is not null limit 1) v on true
where not isempty(r.rng)
  and not exists (select 1 from legacy_team_brand.team t where t.league_code = h.league and pg_temp.norm(t.label) = pg_temp.norm(h.franchise))
  and not exists (select 1 from core.franchise_brand b where b.franchise_id = i.franchise_id and b.latitude is not null and b.valid_during && r.rng)
on conflict (franchise_id, valid_during, source_id) do nothing;

-- Team colours from Wikipedia's Lua colour modules. An identity (a name and its years)
-- takes the entries of its league whose name matches: an undated entry fills the years no
-- dated entry of that identity covers (slivers under 180 days are dropped when dated entries
-- exist), a dated entry ('Name XXXXthruYYYY', calendar years inclusive) covers its years, the
-- later start winning an overlap. An entry that only points at another (Phoenix Coyotes ->
-- Arizona Coyotes) carries the colours it points at; a dated one matches the name it points at
-- too, because the modules write history in both directions.
with ident as (
  select i.franchise_id fid, fl.league_code, pg_temp.norm(i.full_name) n, pg_temp.norm(i.nickname) nk,
         upper(i.valid_during) is null as is_current, i.valid_during vd
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
              and (e.n_key = i.n or (e.yr is not null and e.n_res = i.n)
                   or (e.yr is null and i.is_current and e.n_key = i.nk))   -- the module's bare nickname, e.g. 'Athletics'
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

-- Home venue fixes, logged (rerunnable: last run's rows are replaced). A statement left out through db/seed/venue_fix.csv, and a team whose
-- several home venues Wikidata gives no dates for, so that each is used only from its opening to its closing.
delete from meta.data_issue where entity_kind = 'team_home_venue';
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'wikidata'), 'team_home_venue', x.team_qid,
       'Wikidata home venue ' || coalesce(p.label, x.place_qid) || ' (' || x.place_qid || ') of ' || coalesce(t.label, x.team_qid) || ': ' || x.reason,
       'Statement left out of core.franchise_brand (db/seed/venue_fix.csv); Wikidata is not changed.'
from seed_venue_fix x
left join legacy_team_brand.team t on t.qid = x.team_qid
left join legacy_team_brand.team_place p on p.qid = x.team_qid and p.place_qid = x.place_qid and p.kind = 'home_venue';
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'wikidata'), 'team_home_venue', t.qid,
       'Wikidata gives ' || t.label || ' ' || count(*) || ' home venue' || case when count(*) > 1 then 's' else '' end || ' with no dates (' ||
       string_agg(p.label, ', ' order by pl.opened_on nulls first, p.label) || ')',
       'Each is used only from its opening to its closing, the preferred one first, so no stadium is shown before it opened or after it closed.'
from legacy_team_brand.team t
join legacy_team_brand.team_place p on p.qid = t.qid and p.kind = 'home_venue' and coalesce(p.rank, '') <> 'deprecated'
left join legacy_franchise_info.place pl on pl.qid = p.place_qid
where p.starts_on is null and p.ends_on is null
  and not exists (select 1 from legacy_team_brand.team_place d where d.qid = t.qid and d.kind = 'home_venue' and coalesce(d.rank, '') <> 'deprecated'
                  and (d.starts_on is not null or d.ends_on is not null))
  and not exists (select 1 from seed_venue_fix x where x.team_qid = p.qid and x.place_qid = p.place_qid)
group by t.qid, t.label
having count(*) > 1 and bool_or(pl.opened_on is not null or pl.closed_on is not null);
-- A club item of another era that has the name of an identity of the franchise (the 1970 Milwaukee Brewers and the 1901 ones) gives that identity no venue.
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from meta.source where code = 'wikidata'), 'team_home_venue', t.qid,
       'Wikidata club item ' || t.label || ' (' || coalesce(extract(year from t.inception)::int::text, '?') || '-' || coalesce(extract(year from t.dissolved)::int::text, '') ||
       ') has the name of identity ' || i.full_name || ' ' || i.valid_during || ' of franchise ' || i.franchise_id || ', which it does not overlap',
       'The home venues of that club item are not given to this identity.'
from legacy_team_brand.team t
join core.franchise_identity i on pg_temp.norm(i.full_name) = pg_temp.norm(t.label)
join (select distinct franchise_id, league_code from core.franchise_league) fl on fl.franchise_id = i.franchise_id and fl.league_code = t.league_code
where (t.inception is not null or t.dissolved is not null)
  and exists (select 1 from legacy_team_brand.team_place p where p.qid = t.qid and p.kind = 'home_venue' and coalesce(p.rank, '') <> 'deprecated')
  and not daterange(date_trunc('year', t.inception)::date, (date_trunc('year', t.dissolved) + interval '1 year')::date) && i.valid_during;

-- An NBA identity is one run under a name (step 147_nba_identity_merge), but brand rows written while SPX's identities still stopped at its first and
-- last game were cut there (the Wizards at 2002-10-10 and 2012-04-27), and a rerun on the merged identity adds the whole run beside them. Every NBA brand
-- row of one source that carries the same values into a touching or overlapping one becomes the row with the lowest id, over the years of them all.
create temp table nba_brand_key as
select b.franchise_brand_id, b.franchise_id, b.source_id, b.valid_during,
       row(b.franchise_id, b.source_id, b.primary_hex, b.secondary_hex, b.logo_url, b.logo_licence, b.logo_page, b.home_venue, b.latitude, b.longitude, b.source_key)::text as k
from core.franchise_brand b
where b.franchise_id in (select franchise_id from core.franchise_league where league_code = 'nba');

create temp table nba_brand_run as
select franchise_brand_id, franchise_id, source_id, k, min(franchise_brand_id) over p as keep_id, count(*) over p as n,
       daterange(lower(range_agg(valid_during) over p), upper(range_agg(valid_during) over p)) as merged
from (
  select *, sum(new_run::int) over (partition by k order by lower(valid_during) nulls first, franchise_brand_id) as run
  from (
    select *, coalesce(coalesce(lower(valid_during), '-infinity'::date)
                       > max(coalesce(upper(valid_during), 'infinity'::date)) over (partition by k order by lower(valid_during) nulls first, franchise_brand_id
                                                                                      rows between unbounded preceding and 1 preceding), true) as new_run
    from nba_brand_key
  ) x
) y
window p as (partition by k, run);

-- A row whose joined years another row of different values already holds keeps its cut (check 099 lists it).
delete from nba_brand_run r where r.n > 1 and exists (
  select 1 from nba_brand_key o where o.franchise_id = r.franchise_id and o.source_id = r.source_id and o.valid_during = r.merged and o.k <> r.k);

delete from core.franchise_brand b
using nba_brand_run r
where b.franchise_brand_id = r.franchise_brand_id and r.n > 1 and r.franchise_brand_id <> r.keep_id;

update core.franchise_brand b set valid_during = r.merged
from nba_brand_run r
where b.franchise_brand_id = r.franchise_brand_id and r.n > 1 and r.franchise_brand_id = r.keep_id and b.valid_during is distinct from r.merged;

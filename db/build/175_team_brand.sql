-- Fill core.franchise_brand from legacy_team_brand (Wikidata, CC0; logo files on
-- Wikimedia Commons). Run after the franchises exist (step 100). A Wikidata team
-- is matched to a franchise identity of the same league by its name; the brand
-- row covers that identity's years, open at the franchise's first and last
-- identity, and split where the team's dated home venues (P115) change. A team with
-- no colour, no Commons logo and no venue coordinate gets no row.
delete from core.franchise_brand where source_id = (select source_id from meta.source where code = 'wikidata');

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

-- Last of the 175 steps (after 175_team_brand.sql and 175_team_logo_extra.sql): join the NBA brand rows that were cut in two. Rerunnable; changes
-- nothing when no row is split. It runs after the logo step because that step, and the brand step, write rows for the years of each identity,
-- and an identity that step 147 joined has a longer run than the rows they were first written for. The logo step adds only the years no row of
-- the same file holds, so the rows joined here are not written again.
--
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

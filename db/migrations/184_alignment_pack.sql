-- Cold reads, part 11. Add-only: one new materialized view. Apply to DS1 first, then production. The site reads it and, while it is
-- missing (a 404), falls back on the reads it made before, so the site works before and after.
--   api.alignment_pack   one row for each league: every club's conference and division in each season as six numbers, the names once
-- Every league page and every standings page read the league's rows of api.alignment whole (5,116 rows in the largest league, a request for every 1,000 rows, nine
-- columns of names on every row). This is the same facts in one request of the numbers alone.
-- Precomputed because it reads a view; api.refresh() rebuilds it after a release (it is found from the catalog).

create materialized view api.alignment_pack as
with cf as (
  select league, conference, conference_short, row_number() over (partition by league order by conference, conference_short) - 1 as ci
  from (select distinct league, conference, conference_short from api.alignment where conference is not null or conference_short is not null) d),
dv as (
  select league, division, division_short, row_number() over (partition by league order by division, division_short) - 1 as di
  from (select distinct league, division, division_short from api.alignment where division is not null or division_short is not null) d),
tm as (
  select league, team, row_number() over (partition by league order by team) - 1 as ti
  from (select distinct league, team from api.alignment where team is not null) d),
r as (
  select a.league, a.year, a.conference, a.division, a.team, a.team_id, a.franchise_id, cf.ci, dv.di, tm.ti
  from api.alignment a
  left join cf on cf.league = a.league and cf.conference is not distinct from a.conference and cf.conference_short is not distinct from a.conference_short
  left join dv on dv.league = a.league and dv.division is not distinct from a.division and dv.division_short is not distinct from a.division_short
  left join tm on tm.league = a.league and tm.team = a.team),
rows_ as (
  select r.league, array_agg(u.v order by r.year, r.conference, r.division, r.team, r.team_id, u.k) as seasons
  from r cross join lateral unnest(array[r.year::int, r.ci::int, r.di::int, r.franchise_id, r.ti::int, r.team_id]) with ordinality as u(v, k)
  group by r.league)
select rows_.league,
       coalesce((select array_agg(cf.conference order by cf.ci) from cf where cf.league = rows_.league), '{}'::text[]) as conferences,
       coalesce((select array_agg(cf.conference_short order by cf.ci) from cf where cf.league = rows_.league), '{}'::text[]) as conference_shorts,
       coalesce((select array_agg(dv.division order by dv.di) from dv where dv.league = rows_.league), '{}'::text[]) as divisions,
       coalesce((select array_agg(dv.division_short order by dv.di) from dv where dv.league = rows_.league), '{}'::text[]) as division_shorts,
       coalesce((select array_agg(tm.team order by tm.ti) from tm where tm.league = rows_.league), '{}'::text[]) as teams,
       rows_.seasons
from rows_;
create unique index alignment_pack_key on api.alignment_pack (league);
comment on materialized view api.alignment_pack is
  'The rows of api.alignment of one league, ordered by year, conference, division, team and team_id, as one flat list of six numbers each: year, index into conferences (null for none), index into divisions (null for none), franchise_id, index into teams (null for none), team_id; conference_shorts and division_shorts are the short names of the same indexes. Refreshed by api.refresh() (migration 184).';
analyze api.alignment_pack;
grant select on api.alignment_pack to anon, authenticated;

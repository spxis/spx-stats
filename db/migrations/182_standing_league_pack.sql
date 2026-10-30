-- Cold reads, part 9. Add-only: one new materialized view. Apply to DS1 first, then production. The site reads it and, while it is
-- missing (a 404), falls back on the reads it made before, so the site works before and after.
--   api.standing_league_pack   one row for each league: every club season of api.standing_index as 13 numbers, the club names and conferences once
-- The all-time page, the leaders page and the series pages of a league each read the league's rows of api.standing_index whole (5,116 rows in the largest league,
-- a request for every 1,000 rows, the column names on every row). This is the columns they take in one request of the numbers alone.
-- Precomputed because it reads a materialized view; api.refresh() rebuilds it after a release (it is found from the catalog, after api.standing_index).

create materialized view api.standing_league_pack as
with names as (
  select league, team, row_number() over (partition by league order by team) - 1 as ti
  from (select distinct league, team from api.standing_index where team is not null) d),
confs as (
  select league, conference, row_number() over (partition by league order by conference) - 1 as ci
  from (select distinct league, conference from api.standing_index where conference is not null) d),
r as (
  select s.league, s.year, s.team_id, s.franchise_id, n.ti, s.gp, s.w, s.l, s.t, s.otl, s.pts, s.pf, s.pa, c.ci
  from api.standing_index s
  left join names n on n.league = s.league and n.team = s.team
  left join confs c on c.league = s.league and c.conference = s.conference),
rows_ as (
  select r.league, array_agg(u.v order by r.year, r.team_id, u.k) as standings
  from r cross join lateral unnest(array[r.year::int, r.team_id, r.franchise_id, r.ti::int, r.gp::int, r.w::int, r.l::int, r.t::int, r.otl::int, r.pts::int, r.pf::int, r.pa::int, r.ci::int])
       with ordinality as u(v, k)
  group by r.league)
select rows_.league,
       coalesce((select array_agg(n.team order by n.ti) from names n where n.league = rows_.league), '{}'::text[]) as teams,
       coalesce((select array_agg(c.conference order by c.ci) from confs c where c.league = rows_.league), '{}'::text[]) as conferences,
       rows_.standings
from rows_;
create unique index standing_league_pack_key on api.standing_league_pack (league);
comment on materialized view api.standing_league_pack is
  'The rows of api.standing_index of one league, ordered by year then team_id, as one flat list of 13 numbers each: year, team_id, franchise_id, index into teams (null for no name), gp, w, l, t, otl, pts, pf, pa, index into conferences (null for none); teams and conferences are the distinct names in order. Refreshed by api.refresh() (migration 182).';
analyze api.standing_league_pack;
grant select on api.standing_league_pack to anon, authenticated;

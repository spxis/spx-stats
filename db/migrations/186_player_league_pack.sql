-- Cold reads, part 13. Add-only: one new materialized view. Apply to DS1 first, then production. The site reads it and, while it is
-- missing (a 404), falls back on the reads it made before, so the site works before and after.
--   api.player_league_pack   one row (id 1): each person who played in more than one league, the leagues, and for each league the seasons they played in it and the last of them
-- Almost every page that links a player asked which league a person with several is filed under: api.player_multi_league whole (1,833 people, two requests, 87 KB) and then
-- api.person_season_teams for every one of them, 150 people to a request (12,114 seasons, ~0.6 MB), to count each person's seasons in each league. This is the count, worked
-- out once: the people, their leagues (as numbers into `leagues`), and the seasons played and the newest, in one request.
-- Precomputed because it reads two views, one of ~358,000 rows; api.refresh() rebuilds it after a release (it is found from the catalog).

create materialized view api.player_league_pack as
with m as (select person_id, leagues from api.player_multi_league),
l as (
  select m.person_id, e.lg, e.n, count(distinct s.year)::int as seasons, coalesce(max(s.year), 0)::int as last
  from m
  cross join lateral unnest(m.leagues) with ordinality as e(lg, n)
  left join api.person_season_teams s on s.person_id = m.person_id and s.league = e.lg
  group by m.person_id, e.lg, e.n),
lg as (select lg, row_number() over (order by lg) - 1 as i from (select distinct lg from l) d),
p as (select person_id, count(*)::int as k, array_agg(lg.i order by l.n) as leagues, array_agg(l.seasons order by l.n) as seasons, array_agg(l.last order by l.n) as last
      from l join lg using (lg) group by person_id)
select 1 as id,
       coalesce((select array_agg(lg order by i) from lg), '{}') as leagues,
       coalesce((select array_agg(person_id order by person_id) from p), '{}') as person_id,
       coalesce((select array_agg(k order by person_id) from p), '{}') as league_count,
       coalesce((select array_agg(x order by person_id, ord) from p, unnest(p.leagues) with ordinality as u(x, ord)), '{}') as league,
       coalesce((select array_agg(x order by person_id, ord) from p, unnest(p.seasons) with ordinality as u(x, ord)), '{}') as seasons,
       coalesce((select array_agg(x order by person_id, ord) from p, unnest(p.last) with ordinality as u(x, ord)), '{}') as last;
create unique index player_league_pack_key on api.player_league_pack (id);
comment on materialized view api.player_league_pack is
  'One row. person_id lists the people of api.player_multi_league in order; league_count is how many leagues each has; league, seasons and last are flat lists with one entry for each of those leagues of each person in order: the league as an index into leagues, how many different seasons the person has in api.person_season_teams for it, and the newest of them (0 for none). Refreshed by api.refresh() (migration 186).';
analyze api.player_league_pack;
grant select on api.player_league_pack to anon, authenticated;

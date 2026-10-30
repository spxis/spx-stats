-- Cold reads, part 15. Add-only: one new materialized view. Apply to DS1 first, then production. The site reads it and, while it is
-- missing (a 404), falls back on the reads it made before, so the site works before and after.
--   api.playoff_franchise_pack   one row for each league: each franchise's playoff record as 8 numbers
-- A league's all-time page read every playoff game of the league (5,123 in the NHL: 6 requests of 1,000 rows, 375 KB) only to add up, for each franchise, its playoff games,
-- wins, losses, ties, goals or points for and against, and the number of seasons it played in the playoffs. This is those sums.
-- Precomputed because it reads a view; api.refresh() rebuilds it after a release (it is found from the catalog, after api.games).

create materialized view api.playoff_franchise_pack as
with s as (
  select league, year, away_f as f, away_score as mine, home_score as theirs
  from api.games where phase = 'playoffs' and away_score is not null and home_score is not null and away_f is not null
  union all
  select league, year, home_f, home_score, away_score
  from api.games where phase = 'playoffs' and away_score is not null and home_score is not null and home_f is not null),
t as (
  select league, f, count(*)::int as gp, (count(*) filter (where mine > theirs))::int as w, (count(*) filter (where mine < theirs))::int as l,
         (count(*) filter (where mine = theirs))::int as tie, sum(mine)::int as pf, sum(theirs)::int as pa, count(distinct year)::int as yrs
  from s group by league, f)
select t.league, array_agg(u.v order by t.f, u.k) as franchises
from t cross join lateral unnest(array[t.f, t.gp, t.w, t.l, t.tie, t.pf, t.pa, t.yrs]) with ordinality as u(v, k)
group by t.league;
create unique index playoff_franchise_pack_key on api.playoff_franchise_pack (league);
comment on materialized view api.playoff_franchise_pack is
  'The playoff games of api.games added up for each franchise of one league, ordered by franchise_id, as one flat list of 8 numbers each: franchise_id, games, wins, losses, ties, for, against, seasons played. A game with no score, and a side with no franchise, is not counted. Refreshed by api.refresh() (migration 188).';
analyze api.playoff_franchise_pack;
grant select on api.playoff_franchise_pack to anon, authenticated;

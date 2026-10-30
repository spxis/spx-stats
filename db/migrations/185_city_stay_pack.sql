-- Cold reads, part 12. Add-only: one new materialized view. Apply to DS1 first, then production. The site reads it and, while it is
-- missing (a 404), falls back on api.city_stay, so the site works before and after.
--   api.city_stay_pack   one row (id 1): api.city_stay as columns of plain arrays; each club's seasons there are flat lists of numbers
-- Every city page and /cities read api.city_stay whole (611 rows, ~0.44 MB), two thirds of it the seasons as [year, champion, w, l, t, otl] with a space after every
-- comma and the thirteen column names on every row. This is the same stays in about a third of the bytes.
-- Precomputed because it reads a materialized view; api.refresh() rebuilds it after a release (it is found from the catalog, after api.city_stay).

create materialized view api.city_stay_pack as
with c as (select *, row_number() over (order by league, franchise_id, city_slug) as n from api.city_stay),
s as (
  select c.n, e.sn, (e.v->>0)::int as y, (e.v->>1)::int as champ, (e.v->>2)::int as w, (e.v->>3)::int as l, (e.v->>4)::int as t, (e.v->>5)::int as o
  from c cross join lateral jsonb_array_elements(c.rows) with ordinality as e(v, sn)),
d as (
  select n, sn, champ, w, l, t, o,
         y - coalesce(lag(y) over (partition by n order by sn), y) as dy,
         bool_or(t <> 0) over (partition by n) as has_t,
         bool_or(o <> 0) over (partition by n) as has_o
  from s),
q as (
  select d.n, bool_or(d.has_t) as has_t, bool_or(d.has_o) as has_o,
         array_agg(u.v order by d.sn, u.k) as seasons
  from d cross join lateral unnest(
         array[d.dy * 2 + d.champ, d.w, d.l] || case when d.has_t then array[d.t] else '{}'::int[] end || case when d.has_o then array[d.o] else '{}'::int[] end)
       with ordinality as u(v, k)
  group by d.n),
x as (
  select c.n, c.league, c.franchise_id, c.city_slug, c.name, c.names, c.first_year, c.last_year, c.active,
         array(select (p.x)::int from jsonb_array_elements(c.runs) with ordinality r(run, rn), jsonb_array_elements_text(r.run) with ordinality p(x, k) order by r.rn, p.k) as runs,
         array(select jsonb_array_elements_text(c.title_teams)) as title_teams,
         coalesce(q.has_t, false) as has_t, coalesce(q.has_o, false) as has_o, coalesce(q.seasons, '{}'::int[]) as seasons
  from c left join q on q.n = c.n)
select 1 as id,
  coalesce(array_agg(league order by n), '{}') as league,
  coalesce(array_agg(franchise_id order by n), '{}') as franchise_id,
  coalesce(array_agg(city_slug order by n), '{}') as city_slug,
  coalesce(array_agg(name order by n), '{}') as name,
  coalesce(array_agg(first_year order by n), '{}') as first_year,
  coalesce(array_agg(last_year order by n), '{}') as last_year,
  coalesce(array_agg(active order by n), '{}') as active,
  coalesce(array_agg((has_t::int + 2 * has_o::int) order by n), '{}') as columns,
  coalesce(array_agg(cardinality(names) order by n), '{}') as names_n,
  coalesce(array_agg(cardinality(runs) order by n), '{}') as runs_n,
  coalesce(array_agg(cardinality(seasons) order by n), '{}') as seasons_n,
  coalesce(array_agg(cardinality(title_teams) order by n), '{}') as title_teams_n,
  coalesce((select array_agg(v order by y.n, y.k) from (select x.n, u.v, u.k from x, unnest(x.names) with ordinality as u(v, k)) y), '{}') as names,
  coalesce((select array_agg(v order by y.n, y.k) from (select x.n, u.v, u.k from x, unnest(x.runs) with ordinality as u(v, k)) y), '{}') as runs,
  coalesce((select array_agg(v order by y.n, y.k) from (select x.n, u.v, u.k from x, unnest(x.seasons) with ordinality as u(v, k)) y), '{}') as seasons,
  coalesce((select array_agg(v order by y.n, y.k) from (select x.n, u.v, u.k from x, unnest(x.title_teams) with ordinality as u(v, k)) y), '{}') as title_teams
from x;
create unique index city_stay_pack_key on api.city_stay_pack (id);
comment on materialized view api.city_stay_pack is
  'One row. The columns league to title_teams_n have one entry for each row of api.city_stay in the order of league, franchise_id, city_slug (name, first_year, last_year and active as there); columns is 1 if the club has any ties there, plus 2 if it has any overtime losses; names_n, runs_n, seasons_n and title_teams_n say how many entries of the flat lists names, runs, seasons and title_teams belong to each. runs is the [from, to] pairs of api.city_stay.runs flat; seasons is, for each season in year order, twice the years since the season before (0 for the first, from first_year) plus 1 if the club won the title, then wins and losses (-1 for a missing count), then ties if columns has 1 and overtime losses if it has 2; title_teams is the club''s name in each title season in order. Refreshed by api.refresh() (migration 185).';
analyze api.city_stay_pack;
grant select on api.city_stay_pack to anon, authenticated;

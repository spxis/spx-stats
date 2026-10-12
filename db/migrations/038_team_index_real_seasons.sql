-- api.team_index (037) counted and dated the empty team seasons step 172 adds for pre-1999 champions (no games, no standings): the Raiders
-- showed first season 1983 and 29 seasons. A season now counts, and dates a franchise, only when it has games or standings
-- (w + l + t + otl > 0 in api.team_season_index, or in api.standing_index). The champion link is unchanged: the title still counts through
-- the team season's champion flag. Same columns, indexes, grants and comment as 037. Needs 036 and 037. Rerunnable.

drop materialized view if exists api.team_index;

create materialized view api.team_index as
with tsi as (
  select t.* from api.team_season_index t
  where coalesce(t.w, 0) + coalesce(t.l, 0) + coalesce(t.t, 0) + coalesce(t.otl, 0) > 0
     or exists (select 1 from api.standing_index s where s.league = t.league and s.year = t.year and s.franchise_id = t.franchise_id
                and coalesce(s.w, 0) + coalesce(s.l, 0) + coalesce(s.t, 0) + coalesce(s.otl, 0) > 0)),
ids as (
  select league, franchise_id from api.franchise_names
  union
  select league, franchise_id from tsi),
sp as (
  select league, franchise_id, count(distinct year)::int as seasons, min(year) as first_season, max(year) as last_season,
         sum(coalesce(w, 0))::int as w, sum(coalesce(l, 0))::int as l, sum(coalesce(t, 0))::int as t, sum(coalesce(otl, 0))::int as otl
  from tsi group by league, franchise_id),
ti as (
  select league, franchise_id, count(distinct year)::int as titles from api.team_season_index where champion group by league, franchise_id),
nm as (
  select distinct league, franchise_id, name, coalesce(name_to, 'infinity'::date) as name_to, name_from from api.franchise_names),
cur as (
  select distinct on (league, franchise_id) league, franchise_id, name from nm order by league, franchise_id, name_to desc, name_from desc nulls last),
lastname as (
  select distinct on (league, franchise_id) league, franchise_id, team as name from tsi where team is not null order by league, franchise_id, year desc),
every as (
  select league, franchise_id, array_agg(distinct name order by name) as names from (
    select league, franchise_id, name from nm
    union
    select league, franchise_id, team from tsi where team is not null) u
  group by league, franchise_id),
latest as (select league, max(year) as year from tsi group by league)
select i.league, i.franchise_id,
       coalesce(c.name, ln.name, 'Team ' || i.franchise_id) as name,
       array(select n from unnest(coalesce(e.names, '{}'::text[])) n where n is distinct from coalesce(c.name, ln.name) order by n) as former_names,
       core.fold_text(array_to_string(coalesce(e.names, '{}'::text[]), ' ')) as search,
       sp.first_season, sp.last_season, coalesce(sp.seasons, 0) as seasons, coalesce(ti.titles, 0) as titles,
       round((sp.w + sp.t / 2.0) / nullif(sp.w + sp.l + sp.t + sp.otl, 0), 3) as share,
       coalesce(sp.last_season = latest.year, false) as active
from ids i
left join cur c using (league, franchise_id)
left join lastname ln using (league, franchise_id)
left join every e using (league, franchise_id)
left join sp using (league, franchise_id)
left join ti using (league, franchise_id)
left join latest on latest.league = i.league;

comment on materialized view api.team_index is 'One row per franchise for the teams index page and API: latest name, former names, search text, first and last season, seasons, titles, win share, active (has a season in the league''s latest year). Refreshed by api.refresh().';

create unique index if not exists team_index_franchise_idx on api.team_index (league, franchise_id);
create index if not exists team_index_name_idx on api.team_index (name, league, franchise_id);
create index if not exists team_index_active_idx on api.team_index (active, name);
create index if not exists team_index_last_idx on api.team_index (last_season desc nulls last, name);
create index if not exists team_index_first_idx on api.team_index (first_season, name);
analyze api.team_index;
grant select on api.team_index to anon, authenticated;


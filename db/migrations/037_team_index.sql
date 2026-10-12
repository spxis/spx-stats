-- The lists behind the teams page (/teams), the players and teams list APIs (/api/players, /api/teams) and their autocomplete.
-- api.team_index: one row per franchise in a league (about 270 rows), narrow and indexed: current or last name, every other name it has had,
-- first and last season, seasons, titles, win share and whether it still plays. A materialized view like api.player_index (034): api.refresh()
-- refreshes it, db/build/192_team_index.sql refreshes it after a core rebuild. It reads api.team_season_index (036) and api.franchise_names.
-- core.fold_text turns a name into what a search compares: no accents, lower case, no dots or apostrophes, other marks as a space ("Montréal"
-- -> "montreal", "St. Louis" -> "st louis"). api.team_index.search holds it for all of a franchise's names; api.player_search is api.player_index
-- with the same column, so a search is accent-insensitive; two expression indexes on the players keep it fast (a trigram index for "contains",
-- a pattern index for "starts with"). Teams are too few to need either. Needs 034 and 036. Rerunnable.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

create or replace function core.fold_text(t text) returns text language sql immutable parallel safe as $$
  select btrim(regexp_replace(replace(replace(replace(translate(
    regexp_replace(lower(normalize(t, nfd)), '[̀-ͯ.''’]', '', 'g'),
    'øłđðı', 'olddi'), 'æ', 'ae'), 'œ', 'oe'), 'ß', 'ss'), '[^[:alnum:]]+', ' ', 'g'))
$$;

create materialized view if not exists api.team_index as
with ids as (
  select league, franchise_id from api.franchise_names
  union
  select league, franchise_id from api.team_season_index),
sp as (
  select league, franchise_id, count(distinct year)::int as seasons, min(year) as first_season, max(year) as last_season,
         count(distinct year) filter (where champion)::int as titles,
         sum(coalesce(w, 0))::int as w, sum(coalesce(l, 0))::int as l, sum(coalesce(t, 0))::int as t, sum(coalesce(otl, 0))::int as otl
  from api.team_season_index group by league, franchise_id),
nm as (
  select distinct league, franchise_id, name, coalesce(name_to, 'infinity'::date) as name_to, name_from from api.franchise_names),
cur as (
  select distinct on (league, franchise_id) league, franchise_id, name from nm order by league, franchise_id, name_to desc, name_from desc nulls last),
lastname as (
  select distinct on (league, franchise_id) league, franchise_id, team as name from api.team_season_index where team is not null order by league, franchise_id, year desc),
every as (
  select league, franchise_id, array_agg(distinct name order by name) as names from (
    select league, franchise_id, name from nm
    union
    select league, franchise_id, team from api.team_season_index where team is not null) u
  group by league, franchise_id),
latest as (select league, max(year) as year from api.team_season_index group by league)
select i.league, i.franchise_id,
       coalesce(c.name, ln.name, 'Team ' || i.franchise_id) as name,
       array(select n from unnest(coalesce(e.names, '{}'::text[])) n where n is distinct from coalesce(c.name, ln.name) order by n) as former_names,
       core.fold_text(array_to_string(coalesce(e.names, '{}'::text[]), ' ')) as search,
       sp.first_season, sp.last_season, coalesce(sp.seasons, 0) as seasons, coalesce(sp.titles, 0) as titles,
       round((sp.w + sp.t / 2.0) / nullif(sp.w + sp.l + sp.t + sp.otl, 0), 3) as share,
       coalesce(sp.last_season = latest.year, false) as active
from ids i
left join cur c using (league, franchise_id)
left join lastname ln using (league, franchise_id)
left join every e using (league, franchise_id)
left join sp using (league, franchise_id)
left join latest on latest.league = i.league;

comment on materialized view api.team_index is 'One row per franchise for the teams index page and API: latest name, former names, search text, first and last season, seasons, titles, win share, active (has a season in the league''s latest year). Refreshed by api.refresh().';

create unique index if not exists team_index_franchise_idx on api.team_index (league, franchise_id);
create index if not exists team_index_name_idx on api.team_index (name, league, franchise_id);
create index if not exists team_index_active_idx on api.team_index (active, name);
create index if not exists team_index_last_idx on api.team_index (last_season desc nulls last, name);
create index if not exists team_index_first_idx on api.team_index (first_season, name);
analyze api.team_index;
grant select on api.team_index to anon, authenticated;

create index if not exists player_index_fold_idx on api.player_index (core.fold_text(name) text_pattern_ops);
do $$
declare s text;
begin
  select n.nspname into s from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm';
  execute format('create index if not exists player_index_trgm_idx on api.player_index using gin (core.fold_text(name) %I.gin_trgm_ops)', s);
end $$;
analyze api.player_index;

create or replace view api.player_search as
select person_id, name, position, leagues, first_season, last_season, seasons_played, award_count, core.fold_text(name) as search
from api.player_index;
comment on view api.player_search is 'api.player_index with the folded name (no accents, lower case) to search; uses the indexes on api.player_index.';
grant select on api.player_search to anon, authenticated;

create or replace function api.refresh() returns void language sql security definer as $$
  refresh materialized view api.season_summary; refresh materialized view api.totals;
  refresh materialized view api.games_by_source; refresh materialized view api.quality;
  refresh materialized view api.player_index;
  refresh materialized view api.team_season_index; refresh materialized view api.standing_index;
  refresh materialized view api.team_index;
$$;
revoke all on function api.refresh() from public;

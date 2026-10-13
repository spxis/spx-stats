-- api.player_index (034, 050) and api.player_search gain `country` (text, an ISO 3166 alpha-2 code in capitals, or null): the country the
-- player was born in, else the country of their nationality, so the players list and the API can show a flag and filter by country.
-- The other columns, indexes and meaning are unchanged from 050 (needs 050's shape; if a later migration changed player_index, rebuild
-- from that one). A materialized view cannot be altered, so it is dropped and made again, then refilled here inside one transaction
-- (readers wait a moment, they do not see it missing). api.refresh() repopulates it after any later core load. Rerunnable.
-- Until this runs the site works: the players page draws no country column and /api/players gives `country: null`.
begin;

drop view if exists api.player_search;
drop materialized view if exists api.player_index;

create materialized view api.player_index as
with seen as (
  select person_id, team_season_id from core.roster_stint where role = 'player'
  union
  select person_id, team_season_id from core.player_season_stat),
spans as (
  select t.person_id, count(distinct s.season_id)::int as seasons_played, min(s.start_year) as first_season, max(s.start_year) as last_season
  from seen t join core.team_season ts using (team_season_id) join core.season s using (season_id)
  group by t.person_id),
lg as (
  select person_id, array_agg(distinct league order by league) as leagues from (
    select rs.person_id, s.league_code as league from core.roster_stint rs join core.team_season ts using (team_season_id) join core.season s using (season_id)
    union
    select x.person_id, s.league_code from core.player_season_stat x join core.team_season ts using (team_season_id) join core.season s using (season_id)
    union
    select w.person_id, s.league_code from core.award_winner w join core.season s using (season_id) where w.person_id is not null) u
  group by person_id),
aw as (
  select w.person_id, count(*)::int as award_count
  from core.award_winner w join core.award a using (award_id)
  where a.kind = 'person_award' and w.person_id is not null
  group by w.person_id)
select p.person_id, p.full_name as name, p.primary_position as position, lg.leagues,
       sp.first_season, sp.last_season, coalesce(sp.seasons_played, 0) as seasons_played, coalesce(aw.award_count, 0) as award_count,
       coalesce(p.positions, case when p.primary_position is not null then array[lower(p.primary_position)] end) as positions,
       coalesce(p.birth_country_code, p.nationality_code) as country
from core.person p
left join lg using (person_id)
left join spans sp using (person_id)
left join aw using (person_id)
where p.kind = 'player';

comment on materialized view api.player_index is 'One row per player for the players index page: name, main position, leagues, first and last season, seasons played, person awards, every position, country. Refreshed by api.refresh().';

create unique index player_index_person_idx on api.player_index (person_id);
create index player_index_name_idx on api.player_index (name, person_id);
create index player_index_leagues_idx on api.player_index using gin (leagues);
create index player_index_positions_idx on api.player_index using gin (positions);
create index player_index_country_idx on api.player_index (country, name, person_id);
create index player_index_seasons_idx on api.player_index (seasons_played desc, name);
create index player_index_awards_idx on api.player_index (award_count desc, name);
create index player_index_last_idx on api.player_index (last_season desc nulls last, name);
create index player_index_fold_idx on api.player_index (core.fold_text(name) text_pattern_ops);
do $$
declare s text;
begin
  select n.nspname into s from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm';
  execute format('create index player_index_trgm_idx on api.player_index using gin (core.fold_text(name) %I.gin_trgm_ops)', s);
end $$;
analyze api.player_index;
grant select on api.player_index to anon, authenticated;

create view api.player_search as
select person_id, name, position, leagues, first_season, last_season, seasons_played, award_count, core.fold_text(name) as search, positions, country
from api.player_index;
comment on view api.player_search is 'api.player_index with the folded name (no accents, lower case) to search; uses the indexes on api.player_index.';
grant select on api.player_search to anon, authenticated;

commit;

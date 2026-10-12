-- The list behind the players index page (/players): one row per player, narrow and indexed, so the page can filter by
-- league, search by name, sort and page in well under a second. api.people answers one person at a time but is far too
-- slow to filter and sort as a whole (it works out each person's seasons and leagues row by row).
-- A materialized view, like the other summaries in 015_api.sql: api.refresh() refreshes it, and db/build/190_player_index.sql
-- refreshes it after a core rebuild. Same meaning as the api.people columns of the same name (032): seasons and leagues
-- come from the rosters and the stats both, awards are person awards only.

create materialized view if not exists api.player_index as
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
       sp.first_season, sp.last_season, coalesce(sp.seasons_played, 0) as seasons_played, coalesce(aw.award_count, 0) as award_count
from core.person p
left join lg using (person_id)
left join spans sp using (person_id)
left join aw using (person_id)
where p.kind = 'player';

comment on materialized view api.player_index is 'One row per player for the players index page: name, position, leagues, first and last season, seasons played, person awards. Refreshed by api.refresh().';

create unique index if not exists player_index_person_idx on api.player_index (person_id);
create index if not exists player_index_name_idx on api.player_index (name, person_id);
create index if not exists player_index_leagues_idx on api.player_index using gin (leagues);
create index if not exists player_index_seasons_idx on api.player_index (seasons_played desc, name);
create index if not exists player_index_awards_idx on api.player_index (award_count desc, name);
create index if not exists player_index_last_idx on api.player_index (last_season desc nulls last, name);

analyze api.player_index;

create or replace function api.refresh() returns void language sql security definer as $$
  refresh materialized view api.season_summary; refresh materialized view api.totals;
  refresh materialized view api.games_by_source; refresh materialized view api.quality;
  refresh materialized view api.player_index;
$$;
revoke all on function api.refresh() from public;

grant select on api.player_index to anon, authenticated;

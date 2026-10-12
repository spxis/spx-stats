-- api.team_seasons and api.standings add up every final game (core.standing_from_games, about 720,000 rows) on each request, and the
-- database cannot push a league or season filter into that sum, so every read cost a full scan (1 to 4 s in production, sometimes past
-- the 3 s statement timeout). A full read of team_seasons is nine pages of 1,000 rows, so the site paid for nine scans.
-- api.team_season_index and api.standing_index keep the same rows, worked out once: materialized views like the other summaries in
-- 015_api.sql, refreshed by api.refresh() and db/build/191_team_season_index.sql. The site reads them and falls back to the live
-- views while they do not exist.
-- api.person_stats looked rows up by team season with a scan of all 267,000 stat rows; core.player_season_stat had no index on it.
-- Needs 034_player_index.sql (api.refresh() below refreshes api.player_index). Rerunnable.

create materialized view if not exists api.team_season_index as
select league, year, franchise_id, team, w, l, t, otl, champion, conference, conference_short, division, division_short
from api.team_seasons;
comment on materialized view api.team_season_index is 'api.team_seasons worked out once. Refreshed by api.refresh().';
create index if not exists team_season_index_order_idx on api.team_season_index (league, year, franchise_id);
create index if not exists team_season_index_franchise_idx on api.team_season_index (league, franchise_id, year);
analyze api.team_season_index;
grant select on api.team_season_index to anon, authenticated;

create materialized view if not exists api.standing_index as
select league, year, team_id, franchise_id, team, gp, w, l, t, otl, pts, pf, pa, home, road, pct, basis, source,
       conference, conference_short, division, division_short
from api.standings;
comment on materialized view api.standing_index is 'api.standings worked out once. Refreshed by api.refresh().';
create index if not exists standing_index_season_idx on api.standing_index (league, year, team_id);
create index if not exists standing_index_franchise_idx on api.standing_index (league, franchise_id, year);
analyze api.standing_index;
grant select on api.standing_index to anon, authenticated;

create index if not exists player_season_stat_team_season_idx on core.player_season_stat (team_season_id);
analyze core.player_season_stat;

create or replace function api.refresh() returns void language sql security definer as $$
  refresh materialized view api.season_summary; refresh materialized view api.totals;
  refresh materialized view api.games_by_source; refresh materialized view api.quality;
  refresh materialized view api.player_index;
  refresh materialized view api.team_season_index; refresh materialized view api.standing_index;
$$;
revoke all on function api.refresh() from public;

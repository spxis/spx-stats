-- What spx-stats holds, by league and season: one row per league-season with
-- a count of each kind of data and where it came from. Rerun after every import.
with season as (
  select s.season_id, case s.sport_id when 1 then 'nhl' when 2 then 'nba' when 3 then 'mlb' when 4 then 'nfl' when 5 then 'cfl' end as league,
         s.season_start_year as start_year
  from legacy_spx.lk_sport_seasons s where s.sport_id between 1 and 5
),
spx_player as (
  select season_id, count(*) n from (
    select season_id from legacy_spx.tbl_nhl_player_games union all select season_id from legacy_spx.tbl_nhl_goalie_games
    union all select season_id from legacy_spx.tbl_nba_player_games union all select season_id from legacy_spx.tbl_mlb_batting_games
    union all select season_id from legacy_spx.tbl_mlb_pitching_games union all select season_id from legacy_spx.tbl_nfl_player_games) x
  group by 1
),
spx_team as (
  select season_id, count(*) n from (
    select season_id from legacy_spx.tbl_nhl_team_games union all select season_id from legacy_spx.tbl_nba_team_games
    union all select season_id from legacy_spx.tbl_mlb_team_games union all select season_id from legacy_spx.tbl_nfl_team_games
    union all select season_id from legacy_spx.tbl_cfl_team_games) x
  group by 1
),
spx_hist as (
  select season_id, count(*) n from (
    select season_id from legacy_spx.tbl_nhl_team_game_history union all select season_id from legacy_spx.tbl_nba_team_game_history
    union all select season_id from legacy_spx.tbl_mlb_team_game_history) x
  group by 1
),
by_season as (
  select league, start_year,
         sum(p.n) filter (where p.n is not null) as spx_player_season_lines,
         sum(t.n) filter (where t.n is not null) as spx_team_standings,
         sum(h.n) filter (where h.n is not null) as spx_standings_history
  from season left join spx_player p using (season_id) left join spx_team t using (season_id) left join spx_hist h using (season_id)
  group by 1, 2
),
games as (
  select s.league_code as league, s.start_year, count(*) as games, count(*) filter (where g.status = 'final') as finals,
         count(distinct bl.game_id) as games_with_lines
  from core.game g join core.season s using (season_id) left join core.betting_line bl using (game_id)
  group by 1, 2
),
mongo_games as (
  select sport as league, left(season, 4)::int as start_year, count(*) as spxn_games from legacy_mongo.game group by 1, 2
),
mongo_box as (
  select sport as league, left(season, 4)::int as start_year, count(*) as spxn_player_game_lines from legacy_mongo.player_game_stat group by 1, 2
),
mongo_season as (
  select sport as league, season_year as start_year, count(*) as spxstats_player_season_lines from legacy_mongo.player_season_stat group by 1, 2
)
select league, start_year,
       coalesce(g.games, 0) games, coalesce(g.finals, 0) finals, coalesce(g.games_with_lines, 0) with_lines,
       coalesce(b.spx_team_standings, 0) standings, coalesce(b.spx_standings_history, 0) standings_hist,
       coalesce(b.spx_player_season_lines, 0) + coalesce(ms.spxstats_player_season_lines, 0) player_season_lines,
       coalesce(mb.spxn_player_game_lines, 0) player_game_lines, coalesce(mg.spxn_games, 0) spxn_games
from by_season b
full join games g using (league, start_year)
full join mongo_games mg using (league, start_year)
full join mongo_box mb using (league, start_year)
full join mongo_season ms using (league, start_year)
where coalesce(g.games, 0) + coalesce(b.spx_team_standings, 0) + coalesce(b.spx_player_season_lines, 0) + coalesce(mg.spxn_games, 0)
      + coalesce(mb.spxn_player_game_lines, 0) + coalesce(ms.spxstats_player_season_lines, 0) + coalesce(b.spx_standings_history, 0) > 0
order by league, start_year;

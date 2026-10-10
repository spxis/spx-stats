-- Games, scores and standings by league and season, regular season and
-- playoffs, against what a complete season holds. Rerun after every import.
-- expected_regular is teams x games per team / 2 for that season.
with expected(league, from_year, to_year, regular) as (values
  ('nhl', 2000, 2003, 1230), ('nhl', 2004, 2004, 0), ('nhl', 2005, 2011, 1230), ('nhl', 2012, 2012, 720),
  ('nba', 2002, 2003, 1189), ('nba', 2004, 2010, 1230), ('nba', 2011, 2011, 990), ('nba', 2012, 2012, 1230),
  ('mlb', 2002, 2012, 2430),
  ('nfl', 2002, 2012, 256),
  ('cfl', 2002, 2005, 81), ('cfl', 2006, 2012, 72)
),
g as (
  select s.league_code league, s.start_year,
         count(*) filter (where g.phase = 'regular') reg_games,
         count(*) filter (where g.phase = 'regular' and g.status = 'final') reg_final,
         count(*) filter (where g.phase = 'playoffs') po_games,
         count(*) filter (where g.phase = 'playoffs' and g.status = 'final') po_final
  from core.game g join core.season s using (season_id) group by 1, 2
),
seasons as (
  select season_id, case sport_id when 1 then 'nhl' when 2 then 'nba' when 3 then 'mlb' when 4 then 'nfl' when 5 then 'cfl' end league,
         season_start_year start_year, season_type_id
  from legacy_spx.lk_sport_seasons where sport_id between 1 and 5
),
st as (
  select s.league, s.start_year, count(*) standings_rows
  from (select season_id from legacy_spx.tbl_nhl_team_games union all select season_id from legacy_spx.tbl_nba_team_games
        union all select season_id from legacy_spx.tbl_mlb_team_games union all select season_id from legacy_spx.tbl_nfl_team_games
        union all select season_id from legacy_spx.tbl_cfl_team_games
        union all select season_id from legacy_spx.tbl_nhl_team_game_history union all select season_id from legacy_spx.tbl_nba_team_game_history
        union all select season_id from legacy_spx.tbl_mlb_team_game_history) t
  join seasons s using (season_id) group by 1, 2
)
select coalesce(g.league, st.league) league, coalesce(g.start_year, st.start_year) season,
       e.regular expected_regular, coalesce(g.reg_games, 0) regular_games, coalesce(g.reg_final, 0) regular_final,
       coalesce(g.po_games, 0) playoff_games, coalesce(g.po_final, 0) playoff_final,
       coalesce(st.standings_rows, 0) standings_rows,
       case when e.regular is null then '' when coalesce(g.reg_final, 0) >= e.regular then 'complete'
            else 'missing ' || (e.regular - coalesce(g.reg_final, 0)) end regular_status
from g full join st using (league, start_year)
left join expected e on e.league = coalesce(g.league, st.league) and coalesce(g.start_year, st.start_year) between e.from_year and e.to_year
order by 1, 2;

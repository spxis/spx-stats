-- SPX's standings tables -> core.standing, for the five leagues, regular
-- season and playoffs. Seasons and team seasons that have standings but no
-- games (before 2002) are created here. Safe to re-run; runs after 100.
begin;

delete from core.standing where source_id = (select source_id from meta.source where code = 'spx_database');

create temp table spx_season as
select s.season_id as spx_season_id,
       case s.sport_id when 1 then 'nhl' when 2 then 'nba' when 3 then 'mlb' when 4 then 'nfl' when 5 then 'cfl' end as league_code,
       s.season_start_year::smallint as start_year,
       case s.season_type_id when 1 then 'preseason' when 3 then 'playoffs' when 4 then 'all_star' else 'regular' end::core.season_phase as phase
from legacy_spx.lk_sport_seasons s where s.season_start_year is not null;
-- SPX season 31 is labelled "Reserved" but holds the 2002 MLB regular-season
-- standings (Yankees 103-58, as the season ended).
insert into spx_season values (31, 'mlb', 2002, 'regular');

-- Every SPX standings row, current tables and history alike, in one shape.
create temp table spx_standing as
select season_id, team_id, gp, w, l, t, rt as otl, pts, gf as pf, ga as pa, home, road, last as l10, streak, null::numeric as gb,
       team_game_timestamp as ts, 'current' as kind from legacy_spx.tbl_nhl_team_games
union all select season_id, team_id, gp, w, l, t, rt, pts, gf, ga, home, road, last, streak, null, team_game_history_timestamp, 'history'
  from legacy_spx.tbl_nhl_team_game_history
union all select season_id, team_id, gp, w, l, null, null, null, pf, pa, home, road, last, streak, gb, team_game_timestamp, 'current'
  from legacy_spx.tbl_nba_team_games
union all select season_id, team_id, gp, w, l, null, null, null, pf, pa, home, road, last, streak, gb, team_game_timestamp, 'history'
  from legacy_spx.tbl_nba_team_game_history
union all select season_id, team_id, gp, w, l, null, null, null, rs, ra, home, road, l10, strk, gb, team_game_timestamp, 'current'
  from legacy_spx.tbl_mlb_team_games
union all select season_id, team_id, gp, w, l, null, null, null, rs, ra, home, road, l10, strk, gb, team_game_timestamp, 'history'
  from legacy_spx.tbl_mlb_team_game_history
union all select season_id, team_id, gp, w, l, t, null, null, pf, pa, home, road, l10, strk, null, team_game_timestamp, 'current'
  from legacy_spx.tbl_nfl_team_games
union all select season_id, team_id, gp, w, l, t, null, null, pf, pa, home, road, l10, strk, null, team_game_timestamp, 'current'
  from legacy_spx.tbl_cfl_team_games;

-- One row per team per date: where SPX loaded several weeks under one
-- timestamp, the furthest-along line (most games played) stands for that date.
create temp table fmap as
select distinct on (team_id) x.entity_id as franchise_id, substring(x.external_key from 'team:(\d+)')::integer as team_id, fl.league_code
from core.external_id x join core.franchise_league fl on fl.franchise_id = x.entity_id
where x.entity_kind = 'franchise' and x.source_id = (select source_id from meta.source where code = 'spx_database')
order by team_id, upper(fl.valid_during) desc nulls first;

-- A season's league is the team's league: some SPX seasons carry no sport
-- (MLB 2000 and 2001), and a team of another league filed under a season
-- (MLB teams in NHL standings history) is left out.
create temp table spx_st as
select distinct on (m.league_code, ss.team_id, s.start_year, s.phase, ss.ts::date)
       m.league_code, s.start_year, s.phase, ss.*, ss.ts::date as as_of
from spx_standing ss join spx_season s on s.spx_season_id = ss.season_id
join fmap m on m.team_id = ss.team_id
where ss.ts is not null and (s.league_code is null or s.league_code = m.league_code)
order by m.league_code, ss.team_id, s.start_year, s.phase, ss.ts::date, ss.gp desc nulls last, ss.ts desc;

insert into core.season (league_code, start_year, end_year, label, source_id)
select distinct st.league_code, st.start_year,
       case when st.league_code in ('mlb', 'cfl') then st.start_year else st.start_year + 1 end,
       case when st.league_code in ('nhl', 'nba') then st.start_year || '-' || right((st.start_year + 1)::text, 2) else st.start_year::text end,
       (select source_id from meta.source where code = 'spx_database')
from spx_st st join fmap using (team_id)
on conflict (league_code, start_year) do nothing;

insert into core.team_season (franchise_id, season_id, source_id)
select distinct m.franchise_id, s.season_id, (select source_id from meta.source where code = 'spx_database')
from spx_st st join fmap m using (team_id) join core.season s on s.league_code = st.league_code and s.start_year = st.start_year
on conflict (franchise_id, season_id) do nothing;

insert into core.standing (team_season_id, phase, as_of, source_id, games_played, wins, losses, ties, ot_losses, points,
                           points_for, points_against, home_record, road_record, last_ten, streak, games_behind, source_key)
select distinct on (ts.team_season_id, st.phase, st.as_of)
       ts.team_season_id, st.phase, st.as_of, (select source_id from meta.source where code = 'spx_database'),
       st.gp, st.w, st.l, st.t, st.otl, st.pts, st.pf, st.pa, nullif(trim(st.home), ''), nullif(trim(st.road), ''),
       nullif(trim(st.l10), ''), nullif(trim(st.streak), ''), st.gb, 'spx:' || st.kind || ':' || st.season_id || ':' || st.team_id
from spx_st st join fmap m using (team_id)
join core.season s on s.league_code = st.league_code and s.start_year = st.start_year
join core.team_season ts on ts.franchise_id = m.franchise_id and ts.season_id = s.season_id
order by ts.team_season_id, st.phase, st.as_of, st.gp desc nulls last;

commit;

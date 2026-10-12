-- Season-level team statistics into core.team_season_stat (regular season), one row per team season and source.
--  * NHL: the NHL API's team summary and penalties (legacy_team_stats.nhl_team_season; scripts/team_stats/). A club is found by its name that
--    season (api.team_name), accents and punctuation ignored, and the API's "(1979)" tag dropped. pp_pct, pk_pct, pim, shots_for_pg, shots_against_pg.
--  * MLB: Lahman's Teams table (legacy_lahman.teams): batting average (avg), runs, home runs, ERA, saves and so on. A club is found as in
--    db/build/181_players_lahman.sql: Lahman's retrosheet team code and year, then the franchise's names.
--  * NFL: nflverse weekly team stats (legacy_team_stats.nflverse_team_week), regular season: pass_yds, rush_yds, yds (pass + rush) and
--    yds_against (what the opponents of the club's games gained). A game is found through its nflverse game id.
-- NBA and CFL have no source here that allows automated use. Rerunnable: the rows of these three sources are deleted and written again.
create temp table sid on commit drop as
select (select source_id from meta.source where code = 'nhl_api') as nhl, (select source_id from meta.source where code = 'lahman') as lahman,
       (select source_id from meta.source where code = 'nflverse') as nfl;

update meta.source set notes = coalesce(notes, '') || ' Team season totals: api.nhle.com/stats/rest/en/team/summary and /penalties, regular season, 1917-18 on.'
where code = 'nhl_api' and coalesce(notes, '') not like '%Team season totals%';
update meta.source set notes = coalesce(notes, '') || ' Team season totals: the Teams table.'
where code = 'lahman' and coalesce(notes, '') not like '%Team season totals%';
update meta.source set notes = coalesce(notes, '') || ' Team season totals: stats_team_week_<year>.csv from nflverse-data (stats_team release), regular season.'
where code = 'nflverse' and coalesce(notes, '') not like '%Team season totals%';

delete from core.team_season_stat where source_id in (select nhl from sid union select lahman from sid union select nfl from sid);

-- ---- NHL
create temp table nhl_ts on commit drop as
select ts.team_season_id, s.start_year as y, core.fold_text(api.team_name(ts.team_season_id)) as nm
from core.team_season ts join core.season s using (season_id) where s.league_code = 'nhl';

insert into core.team_season_stat (team_season_id, phase, games_played, stats, source_id)
select n.team_season_id, 'regular', (a.row->>'gamesPlayed')::int,
       jsonb_strip_nulls(jsonb_build_object(
         'pp_pct', round((a.row->>'powerPlayPct')::numeric * 100, 1),
         'pk_pct', round((a.row->>'penaltyKillPct')::numeric * 100, 1),
         'pim', (p.row->>'penaltyMinutes')::int,
         'shots_for_pg', round((a.row->>'shotsForPerGame')::numeric, 1),
         'shots_against_pg', round((a.row->>'shotsAgainstPerGame')::numeric, 1))),
       (select nhl from sid)
from legacy_team_stats.nhl_team_season a
join nhl_ts n on n.y = a.season_id / 10000 and n.nm = core.fold_text(regexp_replace(a.team_name, '\s*\(\d{4}\)$', ''))
left join legacy_team_stats.nhl_team_season p on p.season_id = a.season_id and p.team_id = a.team_id and p.endpoint = 'penalties'
where a.endpoint = 'summary'
on conflict do nothing;

-- ---- MLB
create temp table retro_ts on commit drop as
select distinct y, c, ts from (
  select substr(source_key, 7, 4)::int y, split_part(source_key, ':', 3) c, home_team_season_id ts from core.game where source_id = (select source_id from meta.source where code = 'retrosheet')
  union select substr(source_key, 7, 4)::int, split_part(source_key, ':', 4), away_team_season_id from core.game where source_id = (select source_id from meta.source where code = 'retrosheet')) x;
create temp table fr on commit drop as
select entity_id as franchise_id, substr(external_key, 11) as code from core.external_id
where entity_kind = 'franchise' and source_id = (select source_id from meta.source where code = 'retrosheet');
create temp table lteam on commit drop as
select t.yearid::int as y, t.teamid, t.teamidretro, coalesce(
         (select min(r.ts) from retro_ts r where r.y = t.yearid::int and r.c = t.teamidretro),
         (select min(ts.team_season_id) from legacy_retrosheet.current_name cn join fr on fr.code = cn.franchise_id
            join core.season s on s.league_code = 'mlb' and s.start_year = t.yearid::int
            join core.team_season ts on ts.season_id = s.season_id and ts.franchise_id = fr.franchise_id
           where cn.team_id = t.teamidretro and t.yearid::int between extract(year from cn.first_game)::int
                                                              and extract(year from coalesce(cn.last_game, '9999-01-01'))::int)) as team_season_id,
       t.g, t.ab, t.h, t.hr, t.bb, t.so, t.r, t.ra, t.er, t.era, t.sv, t.e, t.soa
from legacy_lahman.teams t;

insert into core.team_season_stat (team_season_id, phase, games_played, stats, source_id)
select team_season_id, 'regular', max(nullif(g, '')::int),
       jsonb_strip_nulls(jsonb_build_object(
         'ab', sum(nullif(ab, '')::int), 'h', sum(nullif(h, '')::int),
         'avg', case when sum(nullif(ab, '')::int) > 0 then round(sum(nullif(h, '')::int)::numeric / sum(nullif(ab, '')::int), 3) end,
         'hr', sum(nullif(hr, '')::int), 'bb', sum(nullif(bb, '')::int), 'so', sum(nullif(so, '')::int),
         'r', sum(nullif(r, '')::int), 'ra', sum(nullif(ra, '')::int), 'er', sum(nullif(er, '')::int),
         'era', max(nullif(era, '')::numeric), 'sv', sum(nullif(sv, '')::int), 'e', sum(nullif(e, '')::int), 'soa', sum(nullif(soa, '')::int))),
       (select lahman from sid)
from lteam where team_season_id is not null
group by team_season_id
on conflict do nothing;

-- ---- NFL
create temp table nfl_game on commit drop as
select x.external_key as game_id, g.home_team_season_id, g.away_team_season_id
from core.external_id x join core.game g on g.game_id = x.entity_id
where x.entity_kind = 'game' and x.source_id = (select nfl from sid);

-- The game id names the teams as they were then (STL, SD, OAK); the weekly rows use today's. A row that matches neither side is the other
-- side of the game whenever its opponent's row matches one.
create temp table nfl_week on commit drop as
select w.*, g.home_team_season_id, g.away_team_season_id,
       case when w.team = split_part(w.game_id, '_', 4) then 'home' when w.team = split_part(w.game_id, '_', 3) then 'away' end as side
from legacy_team_stats.nflverse_team_week w join nfl_game g using (game_id)
where w.season_type = 'REG';
alter table nfl_week add column team_season_id integer;
update nfl_week w set side = case o.side when 'home' then 'away' when 'away' then 'home' end
from nfl_week o where w.side is null and o.game_id = w.game_id and o.team <> w.team and o.side is not null;
update nfl_week set team_season_id = case side when 'home' then home_team_season_id when 'away' then away_team_season_id end;

insert into core.team_season_stat (team_season_id, phase, games_played, stats, source_id)
select m.team_season_id, 'regular', count(*),
       jsonb_build_object('pass_yds', sum(m.passing_yards), 'rush_yds', sum(m.rushing_yards), 'yds', sum(m.passing_yards + m.rushing_yards),
                          'yds_against', (select sum(o.passing_yards + o.rushing_yards) from nfl_week o
                                          where o.game_id in (select game_id from nfl_week where team_season_id = m.team_season_id) and o.team_season_id <> m.team_season_id)),
       (select nfl from sid)
from nfl_week m where m.team_season_id is not null
group by m.team_season_id
on conflict do nothing;

select s.league_code, count(*) as team_seasons from core.team_season_stat t join core.team_season ts using (team_season_id) join core.season s using (season_id) group by 1 order by 1;

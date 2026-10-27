-- Season length for MLB and the NFL: core.season.games_per_team, regular_starts_on and regular_ends_on. Fills a null only, never overwrites;
-- core.season is updated in place, so ids stay. Run from the repo root after the games of the league are built (140, 150, 151) and again after any new season.
--  * games_per_team (MLB): the length each league announced, read from English Wikipedia's "Major League Baseball schedule" (CC BY-SA 4.0) by
--    scripts/mlb_schedule/parse.py into db/seed/mlb_season_length.csv. A season of two lengths (1884, 1886, 1887, 1961) or of a league the article does
--    not list (1871-75, the Federal League 1914-15) has no row and stays empty. 1995 is the revised 144, 2020 the 60-game season.
--  * dates (MLB and NFL): the first and last day of the regular season's games, taken from the games of core.game (playoffs_end_on is not touched: a playoff in progress has no end).
--    A season gets dates only when it is finished (no regular game scheduled, in progress or suspended from the last two weeks on: an old game left scheduled is a game never reported, not a season still running) and the games are whole: at least two
--    clubs, and every club has at least 90 percent of the games the busiest club has. A short season (a strike, a war, 1981, 1994, 2020) passes, because every
--    club is short alike; a season built from part of the games (a club with 9 games beside one with 116) does not.
begin;

create temp table mlb_len (start_year smallint, games_per_team smallint);
\copy mlb_len from 'db/seed/mlb_season_length.csv' with (format csv, header true)

update core.season s set games_per_team = l.games_per_team
from mlb_len l
where s.league_code = 'mlb' and s.start_year = l.start_year and s.games_per_team is null;

create temp table club_games as
select g.season_id, t.team_season_id, count(*) as n
from core.game g
join lateral (values (g.home_team_season_id), (g.away_team_season_id)) t(team_season_id) on true
where g.phase = 'regular' and g.status in ('final', 'forfeit')
group by g.season_id, t.team_season_id;

create temp table whole as
select c.season_id
from club_games c
join core.season s on s.season_id = c.season_id and s.league_code in ('mlb', 'na', 'aa', 'ua', 'pl', 'fl', 'nfl')
group by c.season_id
having count(*) >= 2 and min(c.n) >= 0.9 * max(c.n)
   and not exists (select 1 from core.game g where g.season_id = c.season_id and g.phase = 'regular' and g.status in ('scheduled', 'in_progress', 'suspended') and g.game_date >= current_date - 14);

update core.season s set
  regular_starts_on = coalesce(s.regular_starts_on, d.rs),
  regular_ends_on = coalesce(s.regular_ends_on, d.re)
from (
  select g.season_id,
         min(g.game_date) filter (where g.phase = 'regular' and g.status in ('final', 'forfeit')) as rs,
         max(g.game_date) filter (where g.phase = 'regular' and g.status in ('final', 'forfeit')) as re
  from core.game g where g.season_id in (select season_id from whole) group by g.season_id
) d
where s.season_id = d.season_id and (s.regular_starts_on is null or s.regular_ends_on is null);

select s.league_code, count(*) as seasons,
       count(*) filter (where s.games_per_team is null) as no_games_per_team,
       count(*) filter (where s.regular_ends_on is null) as no_regular_end
from core.season s where s.league_code in ('mlb', 'na', 'aa', 'ua', 'pl', 'fl', 'nfl') group by s.league_code order by 1;
commit;

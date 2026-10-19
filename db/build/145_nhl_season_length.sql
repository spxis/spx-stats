-- Scheduled regular-season games per NHL club for a season whose games_per_team step 145 left empty (the season in progress:
-- 145 takes the final standings' games played and skips the newest season). The number is what the schedule itself gives:
-- every club has the same count of regular-season games on the calendar, played or not. A season whose clubs differ (or a schedule of fewer than 80 games a club, still being loaded) stays empty.
-- Why: 2026-27 is an 84-game season (the 2025 CBA; English Wikipedia "2026-27 NHL season"), not an 82-game season with two
-- preseason games mixed in: the NHL API numbers all 1,344 games 2026020001 to 2026021344 (regular-season type) and every club has 84.
-- Only fills a null, never overwrites. Rerunnable, ids untouched (core.season is updated in place). Run after 145_nhl_from_nhlapi.
update core.season s set games_per_team = x.n
from (
  select season_id, min(n) as n
  from (
    select season_id, team, count(*) as n
    from (
      select g.season_id, g.home_team_season_id as team from core.game g where g.phase = 'regular' and g.status <> 'cancelled'
      union all
      select g.season_id, g.away_team_season_id from core.game g where g.phase = 'regular' and g.status <> 'cancelled'
    ) t group by season_id, team
  ) c group by season_id having min(n) = max(n) and min(n) >= 80   -- a schedule still being loaded is not a season length
) x
where s.season_id = x.season_id and s.league_code = 'nhl' and s.games_per_team is null;

select s.start_year, s.games_per_team from core.season s where s.league_code = 'nhl' and s.start_year >= 2024 order by 1;

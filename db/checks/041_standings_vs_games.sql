-- what: final regular-season standings whose wins differ from the wins counted in core.game, when both cover the same number of games
-- baseline: 53
with g as (
  select ts, count(*) as gp, sum(w) as w
  from (
    select home_team_season_id as ts, (home_score > away_score)::int as w from core.game
      where status = 'final' and phase = 'regular' and home_score is not null and away_score is not null
    union all
    select away_team_season_id, (away_score > home_score)::int from core.game
      where status = 'final' and phase = 'regular' and home_score is not null and away_score is not null
  ) x
  group by ts
)
select s.team_season_id, s.games_played, s.wins as standing_wins, g.w as game_wins
from core.standing s join g on g.ts = s.team_season_id
where s.is_final and s.phase = 'regular' and s.wins is not null and g.gp = s.games_played and g.w <> s.wins

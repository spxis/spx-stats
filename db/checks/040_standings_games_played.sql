-- what: final standings whose wins, losses, ties and overtime losses do not add up to games played
-- baseline: 0
select team_season_id, phase, games_played, wins, losses, ties, ot_losses
from core.standing
where is_final and wins is not null and losses is not null and games_played is not null
  and wins + losses + coalesce(ties, 0) + coalesce(ot_losses, 0) <> games_played

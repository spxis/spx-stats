-- what: MLS matches whose clubs are not in the season, seasons without exactly one MLS Cup final, a shootout without a score, a level match with a winner and no
--       shootout, more regular-season matches than the season's table, and (2005-2024, where openfootball is complete) fewer. The early seasons (1996-2004), 2025 and
--       2026 hold fewer results than their tables say; that is recorded per club in meta.data_issue and is not a problem row.
-- baseline: 0
select 'club not in season: ' || m.source_key as problem
from core.soccer_match m join core.soccer_tournament t on t.tournament_id = m.tournament_id and t.league_code = 'mls'
where not exists (select 1 from core.soccer_tournament_team x where x.tournament_id = m.tournament_id and x.team_id = m.home_team_id)
   or not exists (select 1 from core.soccer_tournament_team x where x.tournament_id = m.tournament_id and x.team_id = m.away_team_id)
union all
select 'finals in a finished season: ' || t.tournament_id || ' has ' || (select count(*) from core.soccer_match f where f.tournament_id = t.tournament_id and f.stage_key = 'final')
from core.soccer_tournament t
where t.league_code = 'mls' and t.complete
  and (select count(*) from core.soccer_match f where f.tournament_id = t.tournament_id and f.stage_key = 'final') <> 1
union all
select 'no champion or shield: ' || t.tournament_id
from core.soccer_tournament t
where t.league_code = 'mls' and t.complete and (t.winner_team_id is null or t.shield_team_id is null or t.runner_up_team_id is null)
union all
select 'shootout without a score: ' || m.source_key
from core.soccer_match m
where m.tournament_id like 'mls%' and m.shootout and (m.home_penalties is null or m.home_penalties = m.away_penalties)
union all
select 'winner on a level score without a shootout: ' || m.source_key
from core.soccer_match m
where m.tournament_id like 'mls%' and m.home_goals = m.away_goals and m.winner_team_id is not null and not m.shootout and m.shootout_style is distinct from 'mls'
union all
select 'more results than the table: ' || t.tournament_id
from core.soccer_tournament t
where t.league_code = 'mls' and t.complete
  and (select count(*) from core.soccer_match m where m.tournament_id = t.tournament_id and m.stage_key = 'regular')
    > (select sum(g.played) / 2 from core.soccer_group_standing g where g.tournament_id = t.tournament_id and g.stage_key = 'overall')
union all
select 'fewer results than the table: ' || t.tournament_id
from core.soccer_tournament t
where t.league_code = 'mls' and t.year between 2005 and 2024
  and (select count(*) from core.soccer_match m where m.tournament_id = t.tournament_id and m.stage_key = 'regular')
    < (select sum(g.played) / 2 from core.soccer_group_standing g where g.tournament_id = t.tournament_id and g.stage_key = 'overall')
union all
select 'club without a name for the season: ' || tt.tournament_id || '/' || tt.team_id
from core.soccer_tournament_team tt join core.soccer_tournament t on t.tournament_id = tt.tournament_id and t.league_code = 'mls'
where tt.team_name is null

-- what: World Cup matches whose goal rows do not add up to the score, whose teams are not in the tournament, or whose openfootball check disagrees
-- baseline: 0
select 'goals/score: ' || m.source_key as problem
from core.soccer_match m
where (select count(*) from core.soccer_goal g where g.match_id = m.match_id) <> m.home_goals + m.away_goals
   or (select count(*) from core.soccer_goal g where g.match_id = m.match_id and g.team_id = m.home_team_id) <> m.home_goals
union all
select 'team not in tournament: ' || m.source_key
from core.soccer_match m
where not exists (select 1 from core.soccer_tournament_team t where t.tournament_id = m.tournament_id and t.team_id = m.home_team_id)
   or not exists (select 1 from core.soccer_tournament_team t where t.tournament_id = m.tournament_id and t.team_id = m.away_team_id)
union all
select 'shootout without penalties: ' || m.source_key
from core.soccer_match m
where m.shootout and (m.home_penalties is null or m.home_penalties = m.away_penalties)
union all
select 'second check disputed: ' || m.source_key
from meta.verification v join core.soccer_match m on m.match_id = v.entity_id
where v.entity_kind = 'soccer_match' and v.status = 'disputed'
union all
select 'squad player without team entry: ' || q.tournament_id || '/' || q.team_id
from core.soccer_squad q
where not exists (select 1 from core.soccer_tournament_team t where t.tournament_id = q.tournament_id and t.team_id = q.team_id)
group by q.tournament_id, q.team_id

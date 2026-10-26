-- what: European club leagues built from openfootball (build step 227): a regular-season fixture twice in one season, a match whose club is not a member of the
--       season, a club in two divisions of one country in one season, a season marked complete without every pairing home and away, a shootout without a score,
--       a winner that does not follow the score, and a club row that no season uses. Rows of the SPX step (220) are left to its own data issues.
-- baseline: 0
select 'fixture twice: ' || m.tournament_id || ' ' || m.home_team_id || ' v ' || m.away_team_id as problem
from core.soccer_match m
where m.stage_key = 'regular' and m.source_id = (select source_id from meta.source where code = 'openfootball_europe')
group by m.tournament_id, m.home_team_id, m.away_team_id having count(*) > 1
union all
select 'match club not in the season: ' || m.source_key
from core.soccer_match m
where m.stage_key = 'regular' and m.source_id = (select source_id from meta.source where code = 'openfootball_europe')
  and (not exists (select 1 from core.soccer_tournament_team x where x.tournament_id = m.tournament_id and x.team_id = m.home_team_id)
    or not exists (select 1 from core.soccer_tournament_team x where x.tournament_id = m.tournament_id and x.team_id = m.away_team_id))
union all
select 'club in two divisions of one season: ' || x.team_id || ' ' || x.system_key || ' ' || x.year
from (select tt.team_id, s.system_key, t.year from core.soccer_tournament_team tt
        join core.soccer_tournament t on t.tournament_id = tt.tournament_id join ref.soccer_league_system s on s.league_code = t.league_code
       where t.source_id = (select source_id from meta.source where code = 'openfootball_europe')
       group by tt.team_id, s.system_key, t.year having count(distinct t.league_code) > 1) x
union all
select 'complete season without every pairing: ' || t.tournament_id || ' has ' || n.matches || ' of ' || t.team_count * (t.team_count - 1)
from core.soccer_tournament t
cross join lateral (select count(*) as matches from core.soccer_match m where m.tournament_id = t.tournament_id and m.stage_key = 'regular') n
where t.complete and t.source_id = (select source_id from meta.source where code = 'openfootball_europe') and n.matches <> t.team_count * (t.team_count - 1)
union all
select 'shootout without a score: ' || m.source_key
from core.soccer_match m
where m.source_id = (select source_id from meta.source where code = 'openfootball_europe') and m.shootout and (m.home_penalties is null or m.home_penalties = m.away_penalties)
union all
select 'winner does not follow the score: ' || m.source_key
from core.soccer_match m
where m.source_id = (select source_id from meta.source where code = 'openfootball_europe')
  and ((m.home_goals > m.away_goals and m.winner_team_id is distinct from m.home_team_id)
    or (m.home_goals < m.away_goals and m.winner_team_id is distinct from m.away_team_id)
    or (m.home_goals = m.away_goals and not m.shootout and m.winner_team_id is not null)
    or (m.home_goals = m.away_goals and m.shootout and m.winner_team_id is distinct from case when m.home_penalties > m.away_penalties then m.home_team_id else m.away_team_id end))
union all
select 'club without a season: ' || c.team_id
from core.soccer_team c
where c.kind = 'club' and c.source_key like 'eu:%' and not exists (select 1 from core.soccer_tournament_team x where x.team_id = c.team_id);

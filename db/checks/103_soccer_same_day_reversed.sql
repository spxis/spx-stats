-- what: the same two clubs in one competition on one day with home and away the other way round (core.soccer_match). Two clubs never meet twice on a day:
--       it is one match that two sources hold, one of them with the sides swapped (SPX lists the visitor first for the English 2004-05 seasons, step 220
--       swaps them; step 227 builds no second copy of a fixture SPX holds). Found on DS1 on 2026-10-28: 120 pairs after 227 first ran.
-- baseline: 0
select 'same day, sides reversed: ' || a.tournament_id || ' ' || a.match_date || ' ' || a.home_team_id || ' v ' || a.away_team_id
       || ' (' || a.source_key || ' and ' || b.source_key || ')' as problem
from core.soccer_match a
join core.soccer_match b on b.tournament_id = a.tournament_id and b.match_date = a.match_date
                        and b.home_team_id = a.away_team_id and b.away_team_id = a.home_team_id and a.match_id < b.match_id
order by a.tournament_id, a.match_date, a.match_id;

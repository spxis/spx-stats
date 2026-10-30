-- Cold reads, part 2 (ticket SPX-810). NOT add-only: rewrites the definition of an existing view in place (create or replace; same name, same columns in
-- the same order with the same types, no data touched, nothing dropped). Needs John's go before it is applied to DS1 and production. Kept in a file of its
-- own so the add-only files 168 to 172 can be applied without it. The site needs no change for it.
--   api.soccer_team_matches   every match once from each team's side
-- Defined with `cross join lateral (values (home side), (away side))`, the database cannot apply `team_id = X` before the cross join: it builds
-- all ~88,000 rows (a hash join of every match, the tournaments and the opponents) and then keeps one team's, so every read cost the same 225-240 ms on DS1
-- whatever the team (a team page, a club page). The two sides as `union all` let it push the filter into each side and use the indexes on
-- core.soccer_match (home_team_id, away_team_id): a team's matches are read in a few milliseconds. The rows are the same (checked on a scratch copy: no row
-- of either definition is missing from the other).

create or replace view api.soccer_team_matches as
select m.match_id, t.league_code as league, t.year, m.tournament_id, m.stage_key, m.stage_order, m.group_name, m.match_date,
       m.home_team_id as team_id, m.away_team_id as opponent_id, coalesce(oppt.team_name, opp.name) as opponent, opp.slug as opponent_slug, opp.flag_code as opponent_flag,
       true as is_home, m.home_goals as gf, m.away_goals as ga,
       case when m.home_goals > m.away_goals then 'w' when m.home_goals < m.away_goals then 'l' else 'd' end as result,
       m.extra_time, m.shootout, m.home_penalties as pens_for, m.away_penalties as pens_against,
       (m.winner_team_id = m.home_team_id) as won_match,
       m.venue_name, m.venue_city, m.venue_country
from core.soccer_match m
join core.soccer_tournament t using (tournament_id)
join core.soccer_team opp on opp.team_id = m.away_team_id
left join core.soccer_tournament_team oppt on oppt.tournament_id = m.tournament_id and oppt.team_id = m.away_team_id
union all
select m.match_id, t.league_code, t.year, m.tournament_id, m.stage_key, m.stage_order, m.group_name, m.match_date,
       m.away_team_id, m.home_team_id, coalesce(oppt.team_name, opp.name), opp.slug, opp.flag_code,
       false, m.away_goals, m.home_goals,
       case when m.away_goals > m.home_goals then 'w' when m.away_goals < m.home_goals then 'l' else 'd' end,
       m.extra_time, m.shootout, m.away_penalties, m.home_penalties,
       (m.winner_team_id = m.away_team_id),
       m.venue_name, m.venue_city, m.venue_country
from core.soccer_match m
join core.soccer_tournament t using (tournament_id)
join core.soccer_team opp on opp.team_id = m.home_team_id
left join core.soccer_tournament_team oppt on oppt.tournament_id = m.tournament_id and oppt.team_id = m.home_team_id;

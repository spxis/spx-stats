-- A club's record against each opponent, season by season, for the heat map on a team page.
-- A plain view over the games already stored: no table, no column, no stored rows (0 MB). Filter it by franchise_id
-- (franchise_id=eq.N): the filter reaches core.team_season's index before anything is added up, so one club's
-- history is a few hundred games, not the whole table. Without a franchise it adds up every game (do not ask for that).
--
-- One row per club, opponent, season and phase (regular or playoffs). Only finished games with both scores count.
-- w, l, t, otl are from the club's side; an overtime loss in the NHL from 1999-2000 on is otl, not l (as in the head-to-head
-- pages). pf and pa are the club's goals/points/runs for and against. A club that changed league has rows under each league.

create or replace view api.team_opponent_season as
select league, year, franchise_id, opponent_franchise_id, phase,
       count(*)::int as gp,
       (count(*) filter (where pf > pa))::int as w,
       (count(*) filter (where pf < pa and not otl))::int as l,
       (count(*) filter (where pf = pa))::int as t,
       (count(*) filter (where pf < pa and otl))::int as otl,
       sum(pf)::int as pf,
       sum(pa)::int as pa
from (
  select s.league_code as league, s.start_year::int as year, me.franchise_id, op.franchise_id as opponent_franchise_id, g.phase::text as phase,
         g.home_score as pf, g.away_score as pa,
         (g.went_to_overtime is true and s.league_code = 'nhl' and s.start_year >= 1999) as otl
  from core.game g
  join core.season s on s.season_id = g.season_id
  join core.team_season me on me.team_season_id = g.home_team_season_id
  join core.team_season op on op.team_season_id = g.away_team_season_id
  where g.status = 'final' and g.phase in ('regular', 'playoffs') and g.home_score is not null and g.away_score is not null
  union all
  select s.league_code, s.start_year::int, me.franchise_id, op.franchise_id, g.phase::text,
         g.away_score, g.home_score,
         (g.went_to_overtime is true and s.league_code = 'nhl' and s.start_year >= 1999)
  from core.game g
  join core.season s on s.season_id = g.season_id
  join core.team_season me on me.team_season_id = g.away_team_season_id
  join core.team_season op on op.team_season_id = g.home_team_season_id
  where g.status = 'final' and g.phase in ('regular', 'playoffs') and g.home_score is not null and g.away_score is not null
) x
group by league, year, franchise_id, opponent_franchise_id, phase;

comment on view api.team_opponent_season is
  'A club''s record against each opponent in each season and phase (regular, playoffs), from finished games with both scores. Always filter by franchise_id. otl is an NHL overtime loss from 1999-2000 on. Migration 125.';
grant select on api.team_opponent_season to anon, authenticated;

-- what: api.standings rows that show the wrong published row or one that does not add up: a later snapshot with fewer games beating a longer record (NHL 1999-2000: 57-62 games for 82; 2001-02: a playoff run of 5-23 games), a published row older than the scores that have since passed it (a season in progress), games played that are not wins + losses + ties + overtime losses (every league but MLB), or api.standing_index not equal to api.standings (not refreshed)
-- baseline: 0
select 'shorter snapshot beat longer record' as what, s.league, s.year, s.team_id
from api.standings s
join (select team_season_id, max(games_played) as mx from core.standing where phase = 'regular' group by team_season_id) m on m.team_season_id = s.team_id
where s.basis = 'published' and s.gp < m.mx
union all
select 'published row older than the scores', s.league, s.year, s.team_id
from api.standings s
join core.team_season ts on ts.team_season_id = s.team_id
join core.season se on se.season_id = ts.season_id
join lateral (
  select count(*) as n, max(game_date) as last_game
  from (select game_date from core.game where home_team_season_id = s.team_id and status = 'final' and phase = 'regular'
        union all
        select game_date from core.game where away_team_season_id = s.team_id and status = 'final' and phase = 'regular') x
) g on true
join lateral (select max(as_of) as as_of from core.standing where team_season_id = s.team_id and phase = 'regular' and games_played = s.gp) p on true
where s.basis = 'published' and g.n > s.gp and g.last_game > p.as_of and (se.games_per_team is null or g.n <= se.games_per_team)
union all
select 'games played not w+l+t+otl', s.league, s.year, s.team_id
from api.standings s
where s.league not in ('mlb', 'na', 'aa', 'ua', 'pl', 'fl') and s.gp <> coalesce(s.w, 0) + coalesce(s.l, 0) + coalesce(s.t, 0) + coalesce(s.otl, 0)
union all
select 'standing_index differs from standings', s.league, s.year, s.team_id
from api.standings s
left join api.standing_index i on i.team_id = s.team_id
where i.team_id is null or (i.gp, i.w, i.l, i.t, i.otl, i.pts, i.basis) is distinct from (s.gp, s.w, s.l, s.t, s.otl, s.pts, s.basis)

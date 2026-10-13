-- what: a season and phase whose located batted balls in core.batted_ball_league do not add up to core.batted_ball_season.located, or whose club rows (bat, fld) do not add up to the league's unless the club was logged in meta.data_issue
-- baseline: 0
select s.start_year || ' ' || b.phase || ': league ' || coalesce(l.n, 0) || ' of ' || b.located as problem
from core.batted_ball_season b
join core.season s using (season_id)
left join (select season_id, phase, sum(n) as n from core.batted_ball_league group by 1, 2) l on l.season_id = b.season_id and l.phase = b.phase
where b.located <> coalesce(l.n, 0)
union all
select s.start_year || ' ' || t.phase || ' ' || t.role || ': clubs ' || t.n || ' of ' || l.n
from (select ts.season_id, bt.phase, bt.role, sum(bt.n) as n from core.batted_ball_team bt join core.team_season ts using (team_season_id) group by 1, 2, 3) t
join core.season s using (season_id)
join (select season_id, phase, sum(n) as n from core.batted_ball_league group by 1, 2) l on l.season_id = t.season_id and l.phase = t.phase
where t.n <> l.n
  and not exists (select 1 from meta.data_issue d where d.entity_kind = 'batted_ball_team' and d.entity_key like s.start_year || ':%')

-- what: NFL pass and run locations that do not add up: a season, phase and kind whose league total is not the located plays of core.pass_run_season, whose club rows (off, def) do not add up to the league's, or whose player rows (regular season) add up to more than the league's
-- baseline: 0
with lg as (
  select season_id, phase, kind, n from core.pass_run_league
), expected as (
  select season_id, phase, 'pass' as kind, pass_located as n from core.pass_run_season
  union all
  select season_id, phase, 'run', run_located from core.pass_run_season
), tm as (
  select ts.season_id, t.phase, t.role, t.kind, sum(t.n) as n
  from core.pass_run_team t join core.team_season ts using (team_season_id)
  group by 1, 2, 3, 4
), pl as (
  select season_id, case role when 'rush' then 'run' else 'pass' end as kind, role, sum(n) as n
  from core.pass_run_player group by 1, 2, 3
)
select s.start_year || ' ' || e.phase || ' ' || e.kind || ': league ' || coalesce(l.n, 0) || ' of ' || e.n as problem
from expected e
join core.season s using (season_id)
left join lg l on l.season_id = e.season_id and l.phase = e.phase and l.kind = e.kind
where e.n <> coalesce(l.n, 0)
union all
select s.start_year || ' ' || t.phase || ' ' || t.role || ' ' || t.kind || ': clubs ' || t.n || ' of ' || l.n
from tm t
join core.season s using (season_id)
join lg l on l.season_id = t.season_id and l.phase = t.phase and l.kind = t.kind
where t.n <> l.n
union all
select s.start_year || ' ' || p.role || ': players ' || p.n || ' of ' || l.n
from pl p
join core.season s using (season_id)
join lg l on l.season_id = p.season_id and l.phase = 'regular' and l.kind = p.kind
where p.n > l.n

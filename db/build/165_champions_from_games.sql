-- Champions worked out from our own playoff results: the two teams in a
-- season's last playoff game played the final (in the NFL and CFL that game is the final); whoever won more of their
-- playoff games against each other won it. Kept only where every game of that
-- final has a result. Source: spx_stats_derived (the games keep their own).
begin;

delete from core.award_winner where source_id = (select source_id from meta.source where code = 'spx_stats_derived');

create temp table po as
select g.game_id, g.season_id, s.league_code, s.start_year, g.game_date, g.status, g.home_team_season_id h, g.away_team_season_id a,
       g.home_score, g.away_score, g.source_id
from core.game g join core.season s using (season_id) where g.phase = 'playoffs' and g.status <> 'cancelled';

create temp table last_game as
select distinct on (season_id) season_id, league_code, start_year, h, a from po order by season_id, game_date desc, game_id desc;

create temp table final_series as
select l.season_id, l.league_code, l.start_year, l.h as t1, l.a as t2,
       count(*) as games, count(*) filter (where p.status = 'final') as finals,
       count(*) filter (where (p.h = l.h and p.home_score > p.away_score) or (p.a = l.h and p.away_score > p.home_score)) as t1_wins,
       count(*) filter (where (p.h = l.a and p.home_score > p.away_score) or (p.a = l.a and p.away_score > p.home_score)) as t2_wins
from last_game l join po p on p.season_id = l.season_id and ((p.h = l.h and p.a = l.a) or (p.h = l.a and p.a = l.h))
-- The NFL and CFL decide it in one game: the last one, not an earlier meeting filed under the playoffs.
where l.league_code not in ('nfl', 'cfl', 'afl', 'aafc') or p.game_id = (select game_id from po q where q.season_id = l.season_id order by q.game_date desc, q.game_id desc limit 1)
group by 1, 2, 3, 4, 5;

insert into core.award_winner (award_id, season_id, team_season_id, winner_name, note, source_id, source_key)
select a.award_id, f.season_id, w.team_season_id, coalesce(wi.full_name, 'franchise ' || w.franchise_id),
       case when f.games = 1 then format('Won the final %s-%s against %s', greatest(sc.ws, sc.ls), least(sc.ws, sc.ls), coalesce(li.full_name, 'their opponent'))
            else format('Won the final %s games to %s against %s', greatest(f.t1_wins, f.t2_wins), least(f.t1_wins, f.t2_wins), coalesce(li.full_name, 'their opponent')) end,
       (select source_id from meta.source where code = 'spx_stats_derived'), 'final:' || f.league_code || ':' || f.start_year
from final_series f
join core.award a on a.league_code = f.league_code and a.kind = 'championship'
join core.team_season w on w.team_season_id = case when f.t1_wins > f.t2_wins then f.t1 else f.t2 end
join core.team_season l on l.team_season_id = case when f.t1_wins > f.t2_wins then f.t2 else f.t1 end
left join core.franchise_identity wi on wi.franchise_identity_id = w.franchise_identity_id
left join core.franchise_identity li on li.franchise_identity_id = l.franchise_identity_id
left join lateral (select greatest(home_score, away_score) ws, least(home_score, away_score) ls
                   from po where season_id = f.season_id and ((h = f.t1 and a = f.t2) or (h = f.t2 and a = f.t1))
                   order by game_date desc, game_id desc limit 1) sc on true
where f.finals = f.games and f.t1_wins <> f.t2_wins;

select a.league_code, count(*), min(s.start_year), max(s.start_year) from core.award_winner w join core.award a using (award_id) join core.season s using (season_id)
where w.source_id = (select source_id from meta.source where code = 'spx_stats_derived') group by 1 order by 1;
commit;

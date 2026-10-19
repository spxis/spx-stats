-- Champions worked out from our own playoff results: the two teams in a
-- season's last playoff game played the final (in the NFL and CFL that game is the final); whoever won more of their
-- playoff games against each other won it. Kept only where every game of that
-- final has a result. Source: spx_stats_derived (the games keep their own).
-- Rerun upserts: a WNBA load must not rewrite other leagues' derived champion rows.
begin;

create temp table po as
select g.game_id, g.season_id, s.league_code, s.start_year, g.game_date, g.status, g.home_team_season_id h, g.away_team_season_id a,
       g.home_score, g.away_score, g.source_id, g.round_label
from core.game g join core.season s using (season_id) where g.phase = 'playoffs' and g.status <> 'cancelled';

create temp table last_game as
select distinct on (season_id) season_id, league_code, start_year, h, a, round_label from po order by season_id, game_date desc, game_id desc;

create temp table final_series as
select l.season_id, l.league_code, l.start_year, l.h as t1, l.a as t2, l.round_label,
       count(*) as games, count(*) filter (where p.status = 'final') as finals,
       count(*) filter (where (p.h = l.h and p.home_score > p.away_score) or (p.a = l.h and p.away_score > p.home_score)) as t1_wins,
       count(*) filter (where (p.h = l.a and p.home_score > p.away_score) or (p.a = l.a and p.away_score > p.home_score)) as t2_wins
from last_game l join po p on p.season_id = l.season_id and ((p.h = l.h and p.a = l.a) or (p.h = l.a and p.a = l.h))
-- The NFL and CFL decide it in one game: the last one, not an earlier meeting filed under the playoffs.
where l.league_code not in ('nfl', 'cfl', 'afl', 'aafc', 'nwsl') or p.game_id = (select game_id from po q where q.season_id = l.season_id order by q.game_date desc, q.game_id desc limit 1)
group by 1, 2, 3, 4, 5, 6;

create temp table new_champs as
select a.award_id, f.season_id, w.team_season_id, coalesce(wi.full_name, 'franchise ' || w.franchise_id) as winner_name,
       case when f.games = 1 then format('Won the final %s-%s against %s', greatest(sc.ws, sc.ls), least(sc.ws, sc.ls), coalesce(li.full_name, 'their opponent'))
            else format('Won the final %s games to %s against %s', greatest(f.t1_wins, f.t2_wins), least(f.t1_wins, f.t2_wins), coalesce(li.full_name, 'their opponent')) end as note,
       (select source_id from meta.source where code = 'spx_stats_derived') as source_id, 'final:' || f.league_code || ':' || f.start_year as source_key
from final_series f
join core.award a on a.league_code = f.league_code and a.kind = 'championship' and a.code <> 'mlb_early_championship'  -- (the pre-1903 champions of 167 are not World Series)
join core.team_season w on w.team_season_id = case when f.t1_wins > f.t2_wins then f.t1 else f.t2 end
join core.team_season l on l.team_season_id = case when f.t1_wins > f.t2_wins then f.t2 else f.t1 end
left join core.franchise_identity wi on wi.franchise_identity_id = w.franchise_identity_id
left join core.franchise_identity li on li.franchise_identity_id = l.franchise_identity_id
left join lateral (select greatest(home_score, away_score) ws, least(home_score, away_score) ls
                   from po where season_id = f.season_id and ((h = f.t1 and a = f.t2) or (h = f.t2 and a = f.t1))
                   order by game_date desc, game_id desc limit 1) sc on true
-- (The NHA, PCHA, WCHL and WHA name their champions from the articles, db/build/154: their playoffs were often two-game total-goals series.)
-- A season still being played (the last game logged is a semifinal) has no final yet: its last two clubs are not finalists.
where f.finals = f.games and f.t1_wins <> f.t2_wins and coalesce(f.round_label, '') !~* 'semi' and f.league_code not in ('nha', 'pcha', 'wchl', 'wha');

delete from core.award_winner w
where w.source_id = (select source_id from meta.source where code = 'spx_stats_derived')
  and not exists (select 1 from new_champs n
                  where n.award_id = w.award_id and n.season_id = w.season_id and n.winner_name = w.winner_name);
insert into core.award_winner (award_id, season_id, team_season_id, winner_name, note, source_id, source_key)
select award_id, season_id, team_season_id, winner_name, note, source_id, source_key from new_champs
on conflict (award_id, season_id, winner_name, source_id) do update
set note = excluded.note, team_season_id = excluded.team_season_id, source_key = excluded.source_key
where (core.award_winner.note, core.award_winner.team_season_id, core.award_winner.source_key)
  is distinct from (excluded.note, excluded.team_season_id, excluded.source_key);

select a.league_code, count(*), min(s.start_year), max(s.start_year) from core.award_winner w join core.award a using (award_id) join core.season s using (season_id)
where w.source_id = (select source_id from meta.source where code = 'spx_stats_derived') group by 1 order by 1;
commit;

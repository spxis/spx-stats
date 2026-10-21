-- The playoff record of a head coach, per club season (core.coach_playoff_record), from core.game and the head_coach stints of core.roster_stint.
-- A final playoff game of a club season is the head coach's when
--   * a dated stint of his holds the game date; else
--   * he was the only head coach of the season (basis 'sole'); else
--   * every head-coach stint of the season is dated and his is the one that ends last (basis 'dated').
-- A season with several undated head coaches gets no row: who coached the playoffs is not known, and it is not guessed.
-- A series is counted for the coach of the club's last game in it (core.series, winner_team_season_id). Ties count as ties; overtime and shootout losses are losses.
-- The table is wholly owned by this step, so it is emptied and written again; its key is (person, team season), no ids to keep. Run after 184, 185 and 188.
truncate core.coach_playoff_record;

create temp table hc on commit drop as
select person_id, team_season_id, valid_during from core.roster_stint where role = 'head_coach';

create temp table season_coach on commit drop as
select team_season_id, count(distinct person_id) as n, bool_and(valid_during is not null) as all_dated,
       (array_agg(person_id order by upper(valid_during) desc nulls last, person_id))[1] as last_person
from hc group by 1;

create temp table side on commit drop as
select g.game_id, g.game_date, g.series_id, g.home_team_season_id as ts, g.home_score as gf, g.away_score as ga
from core.game g where g.phase = 'playoffs' and g.status = 'final' and g.home_score is not null and g.away_score is not null
union all
select g.game_id, g.game_date, g.series_id, g.away_team_season_id, g.away_score, g.home_score
from core.game g where g.phase = 'playoffs' and g.status = 'final' and g.home_score is not null and g.away_score is not null;

create temp table pick on commit drop as
select s.*,
       coalesce((select h.person_id from hc h where h.team_season_id = s.ts and h.valid_during @> s.game_date order by lower(h.valid_during) desc limit 1), sc.last_person) as person_id,
       case when sc.n = 1 then 'sole' else 'dated' end as basis
from side s join season_coach sc on sc.team_season_id = s.ts and (sc.n = 1 or sc.all_dated);

create temp table ser on commit drop as
select distinct on (p.ts, p.series_id) p.ts, p.series_id, p.person_id,
       (se.winner_team_season_id = p.ts) as won
from pick p join core.series se on se.series_id = p.series_id and se.winner_team_season_id is not null
where p.series_id is not null
order by p.ts, p.series_id, p.game_date desc, p.game_id desc;

insert into core.coach_playoff_record (person_id, team_season_id, games, w, l, t, series_w, series_l, basis)
select g.person_id, g.ts, g.games, g.w, g.l, g.t, coalesce(r.series_w, 0), coalesce(r.series_l, 0), g.basis
from (select person_id, ts, min(basis) as basis, count(*) as games,
             count(*) filter (where gf > ga) as w, count(*) filter (where gf < ga) as l, count(*) filter (where gf = ga) as t
      from pick group by 1, 2) g
left join (select person_id, ts, count(*) filter (where won) as series_w, count(*) filter (where not won) as series_l from ser group by 1, 2) r
  on r.person_id = g.person_id and r.ts = g.ts;

select 'coach playoff rows' as what, count(*) from core.coach_playoff_record
union all select 'playoff games attributed', coalesce(sum(games), 0) from core.coach_playoff_record;

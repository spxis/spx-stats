-- Duplicate games: the same two teams on the same date, held twice. SPX filed
-- copies of regular-season games under the playoffs (and the like) with no
-- score. Keep the copy with a result (or the first one), move any betting
-- lines to it, drop the others, and log each removal. In MLB two finals on one
-- day are a doubleheader, so only a copy with no result is removed there.
-- Runs after the game steps (100-150), before champions are worked out (165).
begin;

create temp table pair as
select g.game_id, g.season_id, s.league_code, g.game_date, g.status, g.home_score, g.away_score, g.starts_at, g.source_key,
       least(h.franchise_id, a.franchise_id) as f1, greatest(h.franchise_id, a.franchise_id) as f2
from core.game g join core.season s using (season_id)
join core.team_season h on h.team_season_id = g.home_team_season_id
join core.team_season a on a.team_season_id = g.away_team_season_id
where g.status <> 'cancelled';

create temp table ranked as
select p.*, row_number() over (partition by league_code, game_date, f1, f2
                               order by (status = 'final') desc, (phase_rank) , game_id) as rn,
       count(*) over (partition by league_code, game_date, f1, f2) as n,
       first_value(game_id) over (partition by league_code, game_date, f1, f2
                                  order by (status = 'final') desc, (phase_rank), game_id) as keep_id
from (select p.*, case g.phase when 'regular' then 0 when 'playoffs' then 1 else 2 end as phase_rank
      from pair p join core.game g using (game_id)) p;

create temp table dupe as
select r.* from ranked r
where r.n > 1 and r.rn > 1
  and (r.league_code not in ('mlb', 'na', 'aa', 'ua', 'pl', 'fl') or r.status <> 'final');   -- baseball: two finals the same day are a doubleheader

-- A stale schedule entry: a game with no result on a day either team has a
-- final game against someone else (a schedule SPX changed and never cleared).
-- Leagues other than baseball (MLB and its family) play once a day.
insert into dupe (game_id, season_id, league_code, game_date, status, home_score, away_score, starts_at, source_key, f1, f2, phase_rank, rn, n, keep_id)
select p.game_id, p.season_id, p.league_code, p.game_date, p.status, p.home_score, p.away_score, p.starts_at, p.source_key, p.f1, p.f2, 0, 2, 2, k.game_id
from pair p
join lateral (select q.game_id from pair q where q.league_code = p.league_code and q.game_date = p.game_date and q.status = 'final'
              and q.game_id <> p.game_id and (p.f1 in (q.f1, q.f2) or p.f2 in (q.f1, q.f2)) order by q.game_id limit 1) k on true
where p.status <> 'final' and p.league_code not in ('mlb', 'na', 'aa', 'ua', 'pl', 'fl') and p.game_date < current_date
  and p.game_id not in (select game_id from dupe);

-- Two finals with different scores are not a duplicate anyone can settle here: flag, keep both.
create temp table clash as
select d.* from dupe d join core.game k on k.game_id = d.keep_id
where d.status = 'final' and (k.home_score <> d.home_score or k.away_score <> d.away_score);
delete from dupe where game_id in (select game_id from clash);

insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from core.game where game_id = d.game_id), 'game', d.source_key,
       format('Duplicate of %s: same teams on %s', (select source_key from core.game where game_id = d.keep_id), d.game_date),
       'Removed; betting lines moved to the kept game'
from dupe d;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from core.game where game_id = c.game_id), 'game', c.source_key,
       format('Same teams on %s as %s, with a different final score', c.game_date, (select source_key from core.game where game_id = c.keep_id)),
       'Both kept; needs a second source'
from clash c;

update core.betting_line bl set game_id = d.keep_id
from dupe d where bl.game_id = d.game_id
  and not exists (select 1 from core.betting_line x where x.game_id = d.keep_id and x.source_id = bl.source_id and x.source_key = bl.source_key);
delete from core.betting_line bl using dupe d where bl.game_id = d.game_id;
delete from core.game g using dupe d where g.game_id = d.game_id;

select 'removed', count(*) from dupe union all select 'flagged', count(*) from clash;
commit;

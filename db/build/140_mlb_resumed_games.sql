-- An MLB game held twice: a game suspended or postponed and played on a later day, which SPX dates by the day it was completed or rescheduled and
-- Retrosheet by the day it began (the 2008 World Series, game 5, was in the database on 2008-10-27 and on 2008-10-29). Step 140 now pairs them
-- (same score first, a doubleheader's games in order after, then the same clubs and score on another day of the season) and keeps SPX's row, id and
-- date. This step repairs a database built before that, in place: it finds each club pair and year where a Retrosheet-only game has an SPX game of
-- the same score that is not linked to it, pairs the games of that group the way 140 does, moves the Retrosheet links, verification rows and issues
-- to the SPX games and removes the Retrosheet-only copies. Rerunnable; changes nothing when no game is held twice.
-- Afterwards rerun 199_game_venue.sql and then 209_venue_game_summary.sql (the removed rows take their venue rows with them).
begin;

create temp table src as select source_id from meta.source where code = 'retrosheet';

-- Every Retrosheet game and the core game it points at now: a Retrosheet-only row (alone) or the SPX game it was matched to.
create temp table rk as
select e.external_key, 'retro:' || e.external_key as key, e.entity_id as cur_id, g.source_id = (select source_id from src) as alone,
       l.game_date as rd, l.game_number, l.home_score as r_h, l.visitor_score as r_a, l.completion, l.outs, l.forfeit,
       g.season_id, g.home_team_season_id as hts_id, g.away_team_season_id as ats_id,
       case l.game_type when 'regular' then 'regular' when 'tiebreaker' then 'regular' else 'playoffs' end::core.season_phase as phase,
       hts.franchise_id as home_f, ats.franchise_id as away_f
from core.external_id e
join core.game g on g.game_id = e.entity_id
join core.season se on se.season_id = g.season_id and se.league_code = 'mlb'
join core.team_season hts on hts.team_season_id = g.home_team_season_id
join core.team_season ats on ats.team_season_id = g.away_team_season_id
join legacy_retrosheet.game_log l on to_char(l.game_date, 'YYYYMMDD') || ':' || l.home || ':' || l.visitor || ':' || l.game_number || ':' || l.game_type = e.external_key
where e.entity_kind = 'game' and e.source_id = (select source_id from src) and l.game_type <> 'allstar';

create temp table sg as   -- the SPX games, as step 140 sees them
select g.game_id, g.game_date, g.status, g.home_score, g.away_score, g.phase, g.source_key, h.franchise_id home_f, a.franchise_id away_f,
       row_number() over (partition by g.game_date, h.franchise_id, a.franchise_id order by g.starts_at nulls last, g.game_id) as n
from core.game g join core.season s using (season_id)
join core.team_season h on h.team_season_id = g.home_team_season_id join core.team_season a on a.team_season_id = g.away_team_season_id
where s.league_code = 'mlb' and g.source_id <> (select source_id from src) and g.status <> 'cancelled';

-- The club pairs and years with a Retrosheet-only game and an SPX game of the same score that is not linked to a game with that score.
create temp table hit as
select distinct r.home_f, r.away_f, extract(year from r.rd)::int as yr
from rk r join sg s on s.home_f = r.home_f and s.away_f = r.away_f and s.phase = r.phase and s.status = 'final'
 and s.home_score = r.r_h and s.away_score = r.r_a and extract(year from s.game_date) = extract(year from r.rd)
where r.alone
  and not exists (select 1 from rk x where x.cur_id = s.game_id and x.r_h = s.home_score and x.r_a = s.away_score);
-- Also a doubleheader whose two games were matched crosswise (each SPX game linked to the other's Retrosheet game, both "disputed").
insert into hit
select distinct x.home_f, x.away_f, extract(year from x.rd)::int
from rk x join sg s on s.game_id = x.cur_id and s.game_date = x.rd and (s.home_score, s.away_score) is distinct from (x.r_h, x.r_a)
where not x.alone and exists (select 1 from rk y where y.rd = x.rd and y.home_f = x.home_f and y.away_f = x.away_f and y.key <> x.key)
  and not exists (select 1 from hit h where h.home_f = x.home_f and h.away_f = x.away_f and h.yr = extract(year from x.rd));

create temp table kg as
select r.*, row_number() over (partition by r.rd, r.home_f, r.away_f order by r.game_number) as n
from rk r join hit h on h.home_f = r.home_f and h.away_f = r.away_f and h.yr = extract(year from r.rd);
create temp table sgg as
select s.* from sg s join hit h on h.home_f = s.home_f and h.away_f = s.away_f and h.yr = extract(year from s.game_date) where s.status = 'final';

create temp table m2 as   -- the pairing, as in 140: same score first
select r.key, r.r_h, r.r_a, s.game_id, s.home_score, s.away_score, r.rd, s.game_date as sd, r.completion, false as late
from (select kg.*, row_number() over (partition by rd, home_f, away_f, r_h, r_a order by game_number) k from kg) r
join (select sgg.*, row_number() over (partition by game_date, home_f, away_f, home_score, away_score order by n) k from sgg) s
  on s.game_date = r.rd and s.home_f = r.home_f and s.away_f = r.away_f and s.home_score = r.r_h and s.away_score = r.r_a and s.k = r.k;
insert into m2   -- what is left, in order
select r.key, r.r_h, r.r_a, s.game_id, s.home_score, s.away_score, r.rd, s.game_date, r.completion, false
from (select kg.*, row_number() over (partition by rd, home_f, away_f order by game_number) k from kg where key not in (select key from m2)) r
join (select sgg.*, row_number() over (partition by game_date, home_f, away_f order by n) k from sgg where game_id not in (select game_id from m2)) s
  on s.game_date = r.rd and s.home_f = r.home_f and s.away_f = r.away_f and s.k = r.k;
insert into m2   -- the same clubs and score on another day of the season
select key, r_h, r_a, game_id, home_score, away_score, rd, sd, completion, true
from (
  select c.*, row_number() over (partition by key order by abs(sd - rd), game_id) rk_r, row_number() over (partition by game_id order by abs(sd - rd), key) rk_s
  from (select r.key, r.r_h, r.r_a, s.game_id, s.home_score, s.away_score, r.rd, s.game_date as sd, r.completion
        from kg r join sgg s on s.home_f = r.home_f and s.away_f = r.away_f and s.phase = r.phase
         and s.home_score = r.r_h and s.away_score = r.r_a and extract(year from s.game_date) = extract(year from r.rd)
        where r.key not in (select key from m2) and s.game_id not in (select game_id from m2)) c
) x where rk_r = 1 and rk_s = 1;

-- A Retrosheet game that was matched to an SPX game this step gives to another one is a game of its own again, as 140 would add it.
create temp table own as
with i as (
insert into core.game (season_id, phase, game_date, home_team_season_id, away_team_season_id, status, home_score, away_score, went_to_overtime, notes, source_id, source_key)
select k.season_id, k.phase, k.rd, k.hts_id, k.ats_id, case when k.r_h is not null and k.r_a is not null then 'final' else 'scheduled' end::core.game_status,
       k.r_h, k.r_a, case when k.outs > 54 then true when k.outs is not null then false end,
       nullif(concat_ws('; ', case when k.forfeit is not null then 'Forfeit: ' || k.forfeit end,
                              case when k.completion is not null then 'Completed later: ' || k.completion end), ''),
       (select source_id from src), k.key
from kg k where not k.alone and k.key not in (select key from m2)
returning game_id, source_key as key
)
select game_id, key from i;
update core.external_id e set entity_id = o.game_id
from own o where e.entity_kind = 'game' and e.source_id = (select source_id from src) and e.external_key = substring(o.key from 7);

create temp table dead as   -- Retrosheet-only rows that now have an SPX game
select k.cur_id as game_id, m.game_id as keep_id from kg k join m2 m using (key) where k.alone;

do $$ declare t text; n bigint; begin
  foreach t in array array['game_period_score', 'player_game_stat', 'team_game_stat', 'game_official', 'game_lineup', 'game_event'] loop
    execute format('select count(*) from core.%I where game_id in (select game_id from dead)', t) into n;
    if n > 0 then raise exception 'core.% holds % rows of a game this step removes', t, n; end if;
  end loop;
  select count(*) into n from meta.verification v where v.entity_kind = 'game' and v.entity_id in (select game_id from dead) and v.source_id <> (select source_id from src);
  if n > 0 then raise exception 'meta.verification holds % rows of another source for a game this step removes', n; end if;
end $$;

-- The links, verification rows and issues of every SPX game of the groups are written again.
delete from meta.verification v using sgg s where v.entity_kind = 'game' and v.entity_id = s.game_id and v.source_id = (select source_id from src);
delete from meta.verification v using dead d where v.entity_kind = 'game' and v.entity_id = d.game_id;
delete from meta.data_issue i using sgg s
where i.source_id = (select source_id from src) and i.entity_kind = 'game' and i.entity_key = s.source_key
  and (i.issue like 'SPX has %' or i.issue like 'Retrosheet dates this game %');

update core.external_id e set entity_id = m.game_id
from m2 m where e.entity_kind = 'game' and e.source_id = (select source_id from src) and e.external_key = substring(m.key from 7) and e.entity_id <> m.game_id;
update core.external_id e set entity_id = d.keep_id from dead d where e.entity_kind = 'game' and e.entity_id = d.game_id;

insert into meta.verification (entity_kind, entity_id, field, status, source_id, their_value)
select 'game', m.game_id, 'score', case when m.home_score = m.r_h and m.away_score = m.r_a then 'confirmed' else 'disputed' end::meta.verification_status,
       (select source_id from src), m.r_h || '-' || m.r_a
from m2 m;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', (select source_key from core.game where game_id = m.game_id),
       format('SPX has %s-%s, Retrosheet %s-%s', m.home_score, m.away_score, m.r_h, m.r_a), 'Kept SPX''s; needs a third source'
from m2 m where m.home_score <> m.r_h or m.away_score <> m.r_a;
insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
select (select source_id from src), 'game', (select source_key from core.game where game_id = m.game_id),
       format('Retrosheet dates this game %s, SPX %s', m.rd, m.sd), 'Same teams and score: one game; kept SPX''s row and date'
from m2 m where m.late;
update core.game g set notes = format('Suspended on %s; completed on %s', m.rd, to_date(split_part(m.completion, ',', 1), 'YYYYMMDD'))
from m2 m where m.late and g.game_id = m.game_id and g.notes is null and split_part(m.completion, ',', 1) ~ '^[0-9]{8}$';

update core.betting_line bl set game_id = d.keep_id
from dead d where bl.game_id = d.game_id
  and not exists (select 1 from core.betting_line x where x.game_id = d.keep_id and x.source_id = bl.source_id and x.source_key = bl.source_key);
delete from core.betting_line bl using dead d where bl.game_id = d.game_id;
delete from core.game g using dead d where g.game_id = d.game_id;

select 'groups', count(*) from hit
union all select 'paired', count(*) from m2
union all select 'paired on another day', count(*) from m2 where late
union all select 'removed', count(*) from dead;
commit;

-- After the report, the bulk step and the second report, before the checks: the daily source's own scheduled games that no club article lists any
-- more are deleted (SPX-761).
--
-- A game is retired when it is the daily source's own game (core.game.source_id), still 'scheduled' with no score, a regular-season or playoff game of
-- this run's league, both clubs' season articles were read and parsed this run (they hold claims; neither club is in _skip), and one of:
--   R1  no source lists it this run: no staged game of this run is matched to it (every game the sources list was reported or re-seen this transaction, and
--       the match put its id on the observation), and every observation that ever pointed at it came from a club's article ('wikipedia'), never from a second
--       source (balldontlie, nflverse): a run without that source's key must not wipe the games only it lists.
--   R2  only a second source still lists it, and its date is 3 or more days past: balldontlie keeps an unplayed game "scheduled" for good (the NLCS games 5 to
--       7 after a sweep, the ALCS game 7: still scheduled 4 days later), while both clubs' articles, which list every game that is played, have dropped it.
--   R3  its series is decided: one club has already won the wins the round needs (4; 2 for an MLB Wild Card Series, 3 for a Division Series, by the staged round
--       name) against the other in the playoff finals core holds (MLB, NHL, NBA), so the game will never be played (SPX-761: the Brewers won the 2026 World
--       Series 4-1 and balldontlie still listed games 6 and 7 as scheduled). Whatever source made it; scripts/daily/games.py drops such games from the staging,
--       so no source lists them. The pair of clubs identifies the series: two clubs meet once in a postseason of these leagues.
-- Typical cases: the "if necessary" games of a playoff series that ended early, and games the job made against an opponent that turned out wrong
-- (the World Series rows against "Guardians/Rays", before the parser stopped making games from those). A game whose date moved is not retired: the
-- observation that moved it names it. A final, a postponed, a suspended or a cancelled game is never touched.
-- More than 30 candidates in one league is not a few stale placeholders but a source that stopped listing games: nothing is retired and the line
-- DAILY_RETIRE_SKIPPED says so.
-- Each retired game also loses its game external ids and verifications; the daily source's open data issues about it are closed; every game_ref that pointed
-- at it goes on ingest.game_retired, which ingest.replay skips (migration 162) and revive.sql takes it off again when an article lists the game or a result
-- arrives. The observation log itself is never changed.
-- Needs: temp tables src, sg0, club, _skip, _checks (db/build/152 and apply.py), psql variable :league, migration 162. Runs as the owner.
create temp table _readable as
select c.franchise_id, p.league, p.season
from (select distinct on (source, title) * from legacy_wikipedia_daily.page where source = 'wikipedia' and kind = 'team' order by source, title, page_id desc) p
join club c on c.league = p.league and c.name = p.club
where exists (select 1 from legacy_wikipedia_daily.claim k where k.page_id = p.page_id)
  and c.name <> all (select club from _skip);

-- the games a staged game of this run points at, and whether a club's article lists it
create temp table _listed as
select o.game_id, bool_or(exists (select 1 from unnest(s.sources) x where x like 'wp:%')) as by_article
from ingest.game_observation o join sg0 s on s.source_key = o.game_ref
where o.game_id is not null and o.last_seen >= now() and (:'league' = '' or s.league = :'league')
group by o.game_id;

-- playoff series already won (R3): wins by pair of clubs from the finals in core, the round name from the staged games of the pair
create temp table _decided as
with w as (
  select s.league_code as league, s.start_year as season, least(h.franchise_id, a.franchise_id) as f1, greatest(h.franchise_id, a.franchise_id) as f2,
         case when g.home_score > g.away_score then h.franchise_id else a.franchise_id end as winner, count(*) as wins
  from core.game g join core.season s using (season_id)
  join core.team_season h on h.team_season_id = g.home_team_season_id join core.team_season a on a.team_season_id = g.away_team_season_id
  where g.phase = 'playoffs' and g.status = 'final' and g.home_score <> g.away_score and s.league_code in ('mlb', 'nhl', 'nba')
    and (:'league' = '' or s.league_code = :'league')
  group by 1, 2, 3, 4, 5),
r as (
  select league, season, least(hf, af) as f1, greatest(hf, af) as f2, max(round) as round from sg0 where phase = 'playoffs' and round is not null group by 1, 2, 3, 4)
select w.league, w.season, w.f1, w.f2
from w left join r using (league, season, f1, f2)
where w.wins >= case when w.league = 'mlb' and r.round ~* 'wild[- ]?card' then 2 when w.league = 'mlb' and r.round ~* 'division series|[AN]LDS' then 3 else 4 end
group by 1, 2, 3, 4;

create temp table _retire_pool as
select g.game_id, g.source_key, g.game_date, s.league_code as league, s.start_year as season, h.franchise_id as hf, a.franchise_id as af
from core.game g
join core.season s using (season_id)
join core.team_season h on h.team_season_id = g.home_team_season_id
join core.team_season a on a.team_season_id = g.away_team_season_id
where g.source_id = (select source_id from src) and g.status = 'scheduled' and g.home_score is null and g.away_score is null
  and g.phase in ('regular', 'playoffs')
  and (:'league' = '' or s.league_code = :'league')
  and (s.league_code, s.start_year) in (select league, season from legacy_wikipedia_daily.game)
  and exists (select 1 from _readable r where r.league = s.league_code and r.season = s.start_year and r.franchise_id = h.franchise_id)
  and exists (select 1 from _readable r where r.league = s.league_code and r.season = s.start_year and r.franchise_id = a.franchise_id)
  and (   (g.phase = 'playoffs' and exists (select 1 from _decided d where d.league = s.league_code and d.season = s.start_year
                                              and d.f1 = least(h.franchise_id, a.franchise_id) and d.f2 = greatest(h.franchise_id, a.franchise_id)))        -- R3
       or (not exists (select 1 from _listed l where l.game_id = g.game_id)                                                      -- R1
           and exists (select 1 from ingest.game_observation o where o.game_id = g.game_id)
           and not exists (select 1 from ingest.game_observation o where o.game_id = g.game_id and o.source <> 'wikipedia'))
       or (exists (select 1 from _listed l where l.game_id = g.game_id and not l.by_article) and g.game_date <= current_date - 3));   -- R2

create temp table _retired as
select * from _retire_pool where (select count(*) from _retire_pool) <= 30;

insert into ingest.game_retired (game_ref, game_id, league, season, game_date, home_key, away_key, reason)
select refs.game_ref, r.game_id, r.league, r.season, r.game_date, ingest.franchise_key(r.hf), ingest.franchise_key(r.af),
       'scheduled game no source lists any more (daily retire step)'
from _retired r
cross join lateral (select r.source_key as game_ref
                    union select o.game_ref from ingest.game_observation o where o.game_id = r.game_id) refs
on conflict (game_ref) do nothing;

update meta.data_issue i set resolved_at = now()
where i.source_id = (select source_id from src) and i.entity_kind = 'game' and i.resolved_at is null
  and i.entity_key in (select game_ref from ingest.game_retired where game_id in (select game_id from _retired));
delete from meta.verification v using _retired r where v.entity_kind = 'game' and v.entity_id = r.game_id;
delete from core.external_id e using _retired r where e.entity_kind = 'game' and e.entity_id = r.game_id;
delete from core.game g using _retired r where g.game_id = r.game_id;

insert into _checks
select 'a game is retired only when it was the daily source''s own scheduled game with no score',
       count(*) = 0, count(*) || ' retired games are still there or were not scheduled'
from _retired r where exists (select 1 from core.game g where g.game_id = r.game_id);
insert into _checks
select 'games no source lists any more are retired, or too many to be placeholders',
       true,
       case when (select count(*) from _retire_pool) = 0 then 'none to retire'
            when (select count(*) from _retired) > 0 then (select count(*) from _retired) || ' retired'
            else 'WARN: ' || (select count(*) from _retire_pool) || ' candidates (more than 30), none retired' end;

\pset tuples_only on
\pset format unaligned
select 'DAILY_RETIRED ' || jsonb_build_object('game_id', game_id, 'league', league, 'season', season, 'game_date', game_date, 'game_ref', source_key,
                                              'home', ingest.franchise_key(hf), 'away', ingest.franchise_key(af))::text
from _retired order by game_date, game_id;
select 'DAILY_RETIRE_SKIPPED ' || (select count(*) from _retire_pool) where (select count(*) from _retire_pool) > 30;
\pset format aligned
\pset tuples_only off

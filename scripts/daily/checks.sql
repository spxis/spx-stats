-- The report and the checks of a daily load (run.py --apply), run inside the same transaction as the load, after
-- db/build/152 (temp tables src, club, sg, scope, owned_season), the first ingest.report_results (temp tables _res, _rep) and the
-- second one (_res2, _rep2); _checks and _run are made by the caller. Any check that fails makes run.py roll the whole transaction back. Read-only.

-- Only the league this run applies is checked (run.py applies one league at a time; psql variable :league, empty = all): a fault in
-- another league's data must not stop this one.
delete from scope where :'league' <> '' and league <> :'league';

\echo
\echo '== Before / after (changed rows, and every season, team season and game row of the leagues loaded) =='
select coalesce(a.what, b.what) as what, coalesce(a.league, b.league) as league, coalesce(a.k, b.k) as k,
       coalesce(b.n, 0) as before, coalesce(a.n, 0) as after, coalesce(a.n, 0) - coalesce(b.n, 0) as change
from (select * from _snap where snap = 'after') a
full join (select * from _snap where snap = 'before') b on (a.what, a.league, a.k) = (b.what, b.league, b.k)
where coalesce(a.n, 0) <> coalesce(b.n, 0)
   or (coalesce(a.what, b.what) in ('seasons', 'team seasons', 'games by status') and coalesce(a.league, b.league) in (select league from scope))
order by 1, 2, 3;

create index on _gh (snap, game_id);
analyze _gh;
create temp table _changed as
select (c ->> 'game_id')::bigint as game_id, c ->> 'league' as league, (c ->> 'season')::int as season, (c ->> 'game_date')::date as game_date,
       c ->> 'from' as from_status, c ->> 'to' as to_status, c ->> 'reason' as reason, c ->> 'game_ref' as game_ref
from (select j from _res union all select j from _rep) r, jsonb_array_elements(r.j -> 'changed') c;

-- games of other sources: not deleted, a final never changed, changed only where a result was filled in
insert into _checks
select 'no game of another source deleted', count(*) = 0, count(*) || ' deleted'
from _gh b where b.snap = 'before' and b.source_id <> (select source_id from src)
  and not exists (select 1 from _gh a where a.snap = 'after' and a.game_id = b.game_id);
insert into _checks
select 'a final game of another source is never changed (confirmed or disputed, not overwritten)', count(*) = 0, count(*) || ' changed'
from _gh b join _gh a on a.game_id = b.game_id and a.snap = 'after'
where b.snap = 'before' and b.source_id <> (select source_id from src) and b.st in ('final', 'forfeit') and a.h <> b.h;
insert into _checks
select 'games of other sources change only through the function (every change is in its list)', count(*) = 0, count(*) || ' changed without being reported'
from _gh b join _gh a on a.game_id = b.game_id and a.snap = 'after'
where b.snap = 'before' and b.source_id <> (select source_id from src) and a.h <> b.h and not exists (select 1 from _changed c where c.game_id = b.game_id);
insert into _checks
select 'SPX-era games untouched (SPX sources, or dated before 2013)', count(*) = 0, count(*) || ' of ' || (select count(*) from _gh where snap = 'before' and (source_id in (select source_id from meta.source where code like 'spx%') or game_date < date '2013-01-01')) || ' changed or gone'
from _gh b where b.snap = 'before' and (b.source_id in (select source_id from meta.source where code like 'spx%') or b.game_date < date '2013-01-01')
  and not exists (select 1 from _gh a where a.snap = 'after' and a.game_id = b.game_id and a.h = b.h);
insert into _checks
select 'games of other sources: count before = after', (select count(*) from _gh where snap = 'before' and source_id <> (select source_id from src))
                                                     = (select count(*) from _gh where snap = 'after' and source_id <> (select source_id from src)),
       (select count(*) from _gh where snap = 'before' and source_id <> (select source_id from src)) || ' -> ' || (select count(*) from _gh where snap = 'after' and source_id <> (select source_id from src));
insert into _checks
select 'the report names every game that changed (own games included)', count(*) = 0, count(*) || ' own games changed that are not in the list'
from _gh b join _gh a on a.game_id = b.game_id and a.snap = 'after'
where b.snap = 'before' and b.source_id = (select source_id from src) and a.h <> b.h and not exists (select 1 from _changed c where c.game_id = b.game_id);

-- the games themselves
insert into _checks
select 'every final game has both scores', count(*) = 0, count(*) || ' finals without a score'
from core.game g join core.season s using (season_id)
where g.status = 'final' and (g.home_score is null or g.away_score is null) and s.league_code in (select league from scope);
insert into _checks
select 'no duplicate games (same teams, same day; MLB: at most a doubleheader)', count(*) = 0, count(*) || ' duplicated groups' || coalesce(': ' || string_agg(k, '; ' order by k) filter (where k is not null), '')
from (select s.league_code || ' ' || s.start_year || ' ' || g.game_date || ' ' || least(h.franchise_id, a.franchise_id) || '/' || greatest(h.franchise_id, a.franchise_id) as k, s.league_code, count(*) n
      from core.game g join core.season s using (season_id)
      join core.team_season h on h.team_season_id = g.home_team_season_id join core.team_season a on a.team_season_id = g.away_team_season_id
      where (s.league_code, s.start_year) in (select league, season from scope) and g.status <> 'cancelled' and g.phase in ('regular', 'playoffs')
      group by 1, 2 having count(*) > case when s.league_code = 'mlb' then 2 else 1 end) d;
insert into _checks
select 'a game belongs to the season of both its team seasons', count(*) = 0, count(*) || ' crossed'
from core.game g join core.team_season h on h.team_season_id = g.home_team_season_id join core.team_season a on a.team_season_id = g.away_team_season_id
where g.source_id = (select source_id from src) and (h.season_id <> g.season_id or a.season_id <> g.season_id or h.franchise_id = a.franchise_id)
  and g.season_id in (select x.season_id from core.season x where x.league_code in (select league from scope));
insert into _checks
select 'every result and cancelled game staged is a game', count(*) = 0, count(*) || ' missing' || coalesce(': ' || string_agg(c.source_key, '; '), '')
from (select s.source_key from sg s where s.act in ('result', 'cancel')
        and not exists (select 1 from core.game g where g.source_key = s.source_key and g.source_id = (select source_id from src))
        and not exists (select 1 from core.external_id e where e.source_id = (select source_id from src) and e.entity_kind = 'game' and e.external_key = s.source_key)) c;
insert into _checks
select 'every staged scheduled game of a new season is a game', count(*) = 0, count(*) || ' missing'
from sg s where s.act = 'schedule' and (s.league, s.season) in (select league, season from owned_season)
  and not exists (select 1 from core.game g where g.source_key = s.source_key and g.source_id = (select source_id from src))
  and not exists (select 1 from core.external_id e where e.source_id = (select source_id from src) and e.entity_kind = 'game' and e.external_key = s.source_key);
insert into _checks
select 'team seasons made here carry the club''s name', count(*) = 0, count(*) || ' without an identity'
from core.team_season where source_id = (select source_id from src) and franchise_identity_id is null;
insert into _checks
select 'raw archive holds each page as downloaded (sha256 of the bytes)', count(*) = 0, count(*) || ' of ' || (select count(*) from legacy_wikipedia_daily.page where league in (select league from scope)) || ' differ or are missing'
from legacy_wikipedia_daily.page p left join legacy_files.raw_archive a on a.name = p.archive_name
where p.league in (select league from scope) and (a.name is null or encode(sha256(a.data), 'hex') <> p.sha256 or a.sha256 <> p.sha256);

-- the ingest log
insert into _checks
select 'every observation reported this run has an outcome', count(*) = 0, count(*) || ' without'
from ingest.game_observation where last_seen >= now() and outcome is null;
insert into _checks
select 'the log is append-only: no observation row went missing', (select count(*) from ingest.game_observation) >= (select n from _run), (select n from _run) || ' -> ' || (select count(*) from ingest.game_observation);
insert into _checks
select 'the first report added exactly the rows it says it did', (select count(*) from ingest.game_observation) - (select n from _run) = (select (j ->> 'new')::int from _res), (select (j ->> 'new') from _res) || ' new';
insert into _checks
select 'the same report a second time adds no observation and changes no game',
       (select (j ->> 'new')::int = 0 and j -> 'changed' = '[]'::jsonb from _res2), (select (j - 'changed')::text from _res2);
insert into _checks
select 'the bulk step a second time makes no game', (select (j ->> 'games_made')::int = 0 from _rep2), (select j::text from _rep2);
insert into _checks
select 'the report ran as the restricted role (it holds no privilege on core.game)', not has_table_privilege('ingest_writer', 'core.game', 'select,insert,update,delete')
       and not has_table_privilege('ingest_writer', 'ingest.game_observation', 'select,insert,update,delete'), 'ingest_writer';

-- each club's games in core against the rows of its own article: the club mapped to the right franchise. A game held back
-- because its sources disagree is missing from core on purpose, and a game only one article lists (single) may be missing from
-- the other club's count. A game only balldontlie lists (the NBA schedule before the articles carry it) is not on any article, so it is
-- taken off the club's core count. The NFL is left out: its article parser skips rows with no date yet, and nflverse supplies every NFL game.
create temp table _clubcount as
select p.league, p.season, p.title, p.club, c.franchise_id,
       (select count(*) from legacy_wikipedia_daily.claim k where k.page_id = p.page_id and k.phase <> 'preseason' and k.status in ('final', 'scheduled', 'cancelled')) as page_rows,
       (select count(*) from core.game g join core.team_season t on t.team_season_id in (g.home_team_season_id, g.away_team_season_id)
        where t.franchise_id = c.franchise_id and g.season_id = s.season_id and g.status <> 'postponed' and g.phase in ('regular', 'playoffs')) as core_games,
       (select count(*) from sg x where x.act = 'hold' and c.franchise_id in (x.hf, x.af)
          and not exists (select 1 from core.game g where g.source_key = x.source_key and g.source_id = (select source_id from src))
          and not exists (select 1 from core.external_id e where e.source_id = (select source_id from src) and e.entity_kind = 'game' and e.external_key = x.source_key)) as held,
       (select count(*) from sg x where x.confidence = 'single' and c.franchise_id in (x.hf, x.af)) as singles,
       -- games core holds for the club that its own article does not list (yet): only balldontlie lists them, or only the other club's article
       -- and the league page (the later games of an MLB series before the club's article has them)
       (select count(*) from sg x where x.act in ('result', 'schedule', 'cancel') and c.franchise_id in (x.hf, x.af) and not ('wp:' || p.title) = any (x.sources)) as off_page
from (select distinct on (source, title) * from legacy_wikipedia_daily.page where kind = 'team' order by source, title, page_id desc) p
join club c on c.league = p.league and c.name = p.club
join core.season s on s.league_code = p.league and s.start_year = p.season
where (p.league, p.season) in (select league, season from scope) and p.league <> 'nfl';
\i :clubcheck

\echo
\echo '== Checks =='
\pset format unaligned
\pset fieldsep ' | '
select case when ok then 'ok  ' else 'FAIL' end as result, name, detail from _checks order by ok, name;
\pset format aligned

\echo
\echo '== Spot checks: relocated or renamed clubs, and the seasons created =='
select s.league_code as league, s.start_year as season, i.full_name as club, ts.franchise_id, count(g.game_id) filter (where g.source_id = (select source_id from src)) as daily_games,
       count(g.game_id) as all_games
from core.team_season ts join core.season s using (season_id)
left join core.franchise_identity i on i.franchise_identity_id = ts.franchise_identity_id
left join core.game g on ts.team_season_id in (g.home_team_season_id, g.away_team_season_id) and g.season_id = ts.season_id
where (s.league_code, s.start_year) in (select league, season from scope union select league, season from legacy_wikipedia_daily.page)
  and (i.full_name ilike '%athletics%' or i.full_name ilike '%utah%' or i.full_name ilike '%sacramento%' or i.full_name ilike '%guardians%'
       or i.full_name ilike '%winnipeg jets%' or i.full_name ilike '%hamilton%' or i.full_name ilike '%washington%')
group by 1, 2, 3, 4 order by 1, 2, 3;
select s.league_code as league, s.start_year as season, s.label, s.games_per_team as gpt, s.regular_starts_on, s.regular_ends_on, s.playoffs_end_on,
       (select count(*) from core.team_season t where t.season_id = s.season_id) as team_seasons,
       (select count(*) from core.team_season t where t.season_id = s.season_id and t.franchise_identity_id is null) as without_identity,
       s.source_id = (select source_id from src) as made_by_daily
from core.season s where (s.league_code, s.start_year) in (select league, season from legacy_wikipedia_daily.page) order by 1, 2;

\echo
\echo '== The first ingest.report_results of this run =='
select j ->> 'observations' as observations, j ->> 'new' as new_rows, j ->> 'repeat' as repeats, j ->> 'applied_now' as applied_now, j -> 'outcomes' as outcomes, j ->> 'issues_touched' as issues_touched,
       jsonb_array_length(j -> 'changed') as games_changed from _res;
\echo '   games changed by the report, by league and move'
select league, coalesce(from_status, '(new)') as from_status, to_status, count(*) as games, min(game_date) as first_date, max(game_date) as last_date from _changed group by 1, 2, 3 order by 1, 2, 3;
\echo '   games the bulk step made (ingest.replay(true, true)) and what it applied'
select j::text as replay from _rep;
\echo '   the second report in the same transaction (must add nothing and change nothing)'
select j ->> 'observations' as observations, j ->> 'new' as new_rows, j ->> 'repeat' as repeats, jsonb_array_length(j -> 'changed') as games_changed from _res2;

\echo
\echo '== Daily changes of the season/team season step (db/build/152) =='
select what, n from _chg1 order by what;

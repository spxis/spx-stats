-- The club-count check of checks.sql, on its own so a scratch test can feed it a made-up _clubcount (scripts/daily/test/clubcheck-test.sh).
-- Needs: temp table _clubcount (league, season, title, club, franchise_id, page_rows, core_games, held, singles, off_page), temp table _checks,
-- and temp table _skip (club) for clubs already left out of this run.
-- A club is unexplained when its article's rows differ from its games in core by more than a held or single-source game explains.
-- One such club (or up to 3 percent of the clubs, at least 1) passes with a WARN and is printed as DAILY_CLUB for run.py, which leaves that club's
-- games out of the load and records a data issue; more than that is a mapping fault and fails, which blocks the league.
create temp table _odd as
select * from _clubcount
where abs(page_rows - (core_games - off_page) - held) > singles and club <> all (select club from _skip);
insert into _checks
select 'each club article''s rows = the club''s games in core (franchise mapping; NFL left out)',
       (select count(*) from _odd) <= greatest(1, floor((select count(*) from _clubcount) * 0.03)),
       case when (select count(*) from _odd) > 0 then 'WARN (club left out of this run, up to 3 percent of clubs): ' else '' end
       || (select count(*) from _odd) || ' of ' || (select count(*) from _clubcount) || ' clubs unexplained; '
       || (select count(*) from _clubcount where page_rows <> core_games - off_page) || ' differ by a held, single-source or not-yet-listed game' ||
       coalesce((select ': ' || string_agg(club || ' ' || page_rows || ' vs ' || (core_games - off_page), '; ' order by club) from _odd), '');
\pset tuples_only on
\pset format unaligned
select 'DAILY_CLUB ' || jsonb_build_object('league', league, 'season', season, 'club', club, 'page_rows', page_rows, 'core_games', core_games - off_page, 'held', held, 'singles', singles)::text
from _odd order by club;
\pset format aligned
\pset tuples_only off

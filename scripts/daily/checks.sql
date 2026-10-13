-- The report and the checks of a daily load (run.py --apply), run inside the same transaction as the load, after
-- db/build/152_games_from_wikipedia_daily.sql (it needs that step's temp tables: src, scope, mm, sg, cand, matched).
-- Any check that fails makes run.py roll the whole transaction back. Read-only.

\echo
\echo '== Before / after (changed rows, and every season, team season and game row of the leagues loaded) =='
select coalesce(a.what, b.what) as what, coalesce(a.league, b.league) as league, coalesce(a.k, b.k) as k,
       coalesce(b.n, 0) as before, coalesce(a.n, 0) as after, coalesce(a.n, 0) - coalesce(b.n, 0) as change
from (select * from _snap where snap = 'after') a
full join (select * from _snap where snap = 'before') b on (a.what, a.league, a.k) = (b.what, b.league, b.k)
where coalesce(a.n, 0) <> coalesce(b.n, 0)
   or (coalesce(a.what, b.what) in ('seasons', 'team seasons', 'games by status') and coalesce(a.league, b.league) in (select league from scope))
order by 1, 2, 3;

create temp table _checks (name text not null, ok boolean not null, detail text);
create temp table _fills as select game_id from mm where kind in ('fill', 'refill');

-- games of other sources: not deleted, changed only where a result was filled in
insert into _checks
select 'no game of another source deleted', count(*) = 0, count(*) || ' deleted'
from _gh b where b.snap = 'before' and b.source_id <> (select source_id from src)
  and not exists (select 1 from _gh a where a.snap = 'after' and a.game_id = b.game_id);
insert into _checks
select 'games of other sources changed only by a fill', count(*) = 0, count(*) || ' changed without being a fill'
from _gh b join _gh a on a.game_id = b.game_id and a.snap = 'after'
where b.snap = 'before' and b.source_id <> (select source_id from src) and a.h <> b.h and b.game_id not in (select game_id from _fills);
insert into _checks
select 'every fill was a game with no result', count(*) = 0, count(*) || ' fills that were not scheduled before'
from mm where kind = 'fill' and ds_status = 'final';
insert into _checks
select 'a final DS1 game never overwritten (confirmed, disputed, held)', count(*) = 0, count(*) || ' changed'
from mm m join _gh b on b.game_id = m.game_id and b.snap = 'before' join _gh a on a.game_id = m.game_id and a.snap = 'after'
where (m.kind in ('confirm', 'dispute') or (m.kind = 'hold' and not m.ours)) and a.h <> b.h;
insert into _checks
select 'SPX-era games untouched (SPX sources, or dated before 2013)', count(*) = 0, count(*) || ' of ' || (select count(*) from _gh where snap = 'before' and (source_id in (select source_id from meta.source where code like 'spx%') or game_date < date '2013-01-01')) || ' changed or gone'
from _gh b where b.snap = 'before' and (b.source_id in (select source_id from meta.source where code like 'spx%') or b.game_date < date '2013-01-01')
  and not exists (select 1 from _gh a where a.snap = 'after' and a.game_id = b.game_id and a.h = b.h);
insert into _checks
select 'games of other sources: count before = after', (select count(*) from _gh where snap = 'before' and source_id <> (select source_id from src))
                                                     = (select count(*) from _gh where snap = 'after' and source_id <> (select source_id from src)),
       (select count(*) from _gh where snap = 'before' and source_id <> (select source_id from src)) || ' -> ' || (select count(*) from _gh where snap = 'after' and source_id <> (select source_id from src));

-- the games themselves
insert into _checks
select 'every final game has both scores', count(*) = 0, count(*) || ' finals without a score'
from core.game where status = 'final' and (home_score is null or away_score is null);
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
where g.source_id = (select source_id from src) and (h.season_id <> g.season_id or a.season_id <> g.season_id or h.franchise_id = a.franchise_id);
insert into _checks
select 'every result and cancelled game staged is a game', count(*) = 0, count(*) || ' missing' || coalesce(': ' || string_agg(c.source_key, '; ') filter (where true), '')
from (select s.source_key from sg s where s.act in ('result', 'cancel')
        and not exists (select 1 from core.game g where g.source_key = s.source_key and g.source_id = (select source_id from src))
        and not exists (select 1 from matched m where m.wid = s.source_key)) c;
insert into _checks
select 'every staged scheduled game of a new season is a game', count(*) = 0, count(*) || ' missing'
from sg s where s.act = 'schedule' and (s.league, s.season) in (select league, season from owned_season)
  and not exists (select 1 from core.game g where g.source_key = s.source_key and g.source_id = (select source_id from src));
insert into _checks
select 'team seasons made here carry the club''s name', count(*) = 0, count(*) || ' without an identity'
from core.team_season where source_id = (select source_id from src) and franchise_identity_id is null;
insert into _checks
select 'raw archive holds each page as downloaded (sha256 of the bytes)', count(*) = 0, count(*) || ' of ' || (select count(*) from legacy_wikipedia_daily.page) || ' differ or are missing'
from legacy_wikipedia_daily.page p left join legacy_files.raw_archive a on a.name = p.archive_name
where a.name is null or encode(sha256(a.data), 'hex') <> p.sha256 or a.sha256 <> p.sha256;

-- each club's games in core against the rows of its own article: the club mapped to the right franchise. A game held back
-- because its sources disagree is missing from core on purpose, and a game only one article lists (single) may be missing from
-- the other club's count. The NFL is left out: its article parser skips rows with no date yet, and nflverse supplies every NFL game.
create temp table _clubcount as
select p.league, p.season, p.title, p.club, c.franchise_id,
       (select count(*) from legacy_wikipedia_daily.claim k where k.page_id = p.page_id and k.phase <> 'preseason' and k.status in ('final', 'scheduled', 'cancelled')) as page_rows,
       (select count(*) from core.game g join core.team_season t on t.team_season_id in (g.home_team_season_id, g.away_team_season_id)
        where t.franchise_id = c.franchise_id and g.season_id = s.season_id and g.status <> 'postponed' and g.phase in ('regular', 'playoffs')) as core_games,
       (select count(*) from sg x where x.act = 'hold' and c.franchise_id in (x.hf, x.af) and not exists (select 1 from matched m where m.wid = x.source_key)
                                    and not exists (select 1 from og where og.source_key = x.source_key)) as held,
       (select count(*) from sg x where x.confidence = 'single' and c.franchise_id in (x.hf, x.af)) as singles
from (select distinct on (source, title) * from legacy_wikipedia_daily.page where kind = 'team' order by source, title, page_id desc) p
join club c on c.league = p.league and c.name = p.club
join core.season s on s.league_code = p.league and s.start_year = p.season
where (p.league, p.season) in (select league, season from scope) and p.league <> 'nfl';
insert into _checks
select 'each club article''s rows = the club''s games in core (franchise mapping; NFL left out)', count(*) filter (where abs(page_rows - core_games - held) > singles) = 0,
       count(*) filter (where abs(page_rows - core_games - held) > singles) || ' of ' || count(*) || ' clubs unexplained; '
       || count(*) filter (where page_rows <> core_games) || ' differ by a held or single-source game' ||
       coalesce(': ' || string_agg(club || ' ' || page_rows || ' vs ' || core_games, '; ' order by club) filter (where abs(page_rows - core_games - held) > singles), '')
from _clubcount;

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
\echo '== What the step did with the staged games =='
select s.league, coalesce(m.kind, case when s.source_key in (select source_key from og) then 'own (already ours)'
                                       when s.act = 'note' then 'logged (postponed or suspended)'
                                       when s.act in ('result', 'cancel') or (s.act = 'schedule' and (s.league, s.season) in (select league, season from owned_season)) then 'added'
                                       else 'not added (' || s.act || ')' end) as outcome, s.confidence, count(*) as games
from sg s left join mm m on m.source_key = s.source_key
group by 1, 2, 3 order by 1, 2, 3;
select 'unresolved clubs' as k, count(*) from legacy_wikipedia_daily.game g where not exists (select 1 from sg where sg.source_key = g.source_key);

\echo
\echo '== What changed (db/build/152 summary) =='
select what, n from chg order by what;

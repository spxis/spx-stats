-- what: betting lines per league and season: games played (status final), games with at least one line, the share, and the games each source covers.
--       Read-only; run with bash scripts/mac/ds1-apply.sh db/review/betting_line_coverage.sql --dry-run (or psql on a scratch). Not a db/checks file on purpose:
--       holes are expected, the numbers only grow as sources are loaded, and nothing here must ever fail a release.
-- A game counts once however many lines it has. Sources: spx_database (2002-2011), nflverse (NFL 1999 on), cfbd (college football 2013 on).
-- Columns: league, season (the year it starts in), played, with_line, pct_with_line, and one column a source. The table in docs/data-sources.md ("Betting lines") is this output.
with played as (
  select g.game_id, s.league_code as league, s.start_year as season from core.game g join core.season s using (season_id) where g.status = 'final'
),
lined as (
  select b.game_id, bool_or(src.code = 'spx_database') as spx, bool_or(src.code = 'nflverse') as nflverse, bool_or(src.code = 'cfbd') as cfbd
  from core.betting_line b join meta.source src using (source_id) group by b.game_id
)
select p.league, p.season, count(*) as played, count(l.game_id) as with_line,
       round(100.0 * count(l.game_id) / count(*), 1) as pct_with_line,
       count(*) filter (where l.spx) as spx_database, count(*) filter (where l.nflverse) as nflverse, count(*) filter (where l.cfbd) as cfbd
from played p left join lined l using (game_id)
group by p.league, p.season
order by p.league, p.season;

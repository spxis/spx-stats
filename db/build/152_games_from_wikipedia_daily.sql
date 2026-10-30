-- Daily scores from English Wikipedia (CC BY-SA 4.0) with nflverse as the NFL's second check: the SEASONS and TEAM SEASONS for
-- the season in progress, built from legacy_wikipedia_daily (migration 043, loaded by scripts/daily/run.py --apply).
-- Source code 'wikipedia_daily'. Runs after 150, before 153.
--   * A season or team season DS1 lacks (MLB 2026, CFL 2026, NBA 2026-27) is created here and not by a one-off update,
--     because step 100 recreates franchises and team seasons.
--   * It makes NO games and changes NO game. Games are reported to ingest.report_results() (migration 044), which owns the game
--     state machine and writes verification and data issues; the games the report finds no row for are made by
--     ingest.replay(true, true), the owner-only bulk step that run.py --apply calls right after (and db/build/153 calls after a
--     rebuild, for the whole log). So the same rules decide a result whether it came today or is replayed after a rebuild.
--   * Safe to rerun: rows are added or changed only where they differ. A summary of what changed is the last result ("daily changes").
begin;
set local client_min_messages = warning;

-- (a second pass in one session, as the rehearsal does, starts clean)
drop table if exists src, chg, club, sg0, sg, scope, owned_season;

insert into meta.source (code, name, kind, licence, attribution, url, covers_from, retrieved_on, notes)
select 'wikipedia_daily', 'Wikipedia (daily scores)', 'website', 'CC BY-SA 4.0',
       'Game scores from the clubs'' season articles on English Wikipedia (en.wikipedia.org), CC BY-SA 4.0; text by the articles'' editors, see each article''s history. NFL scores are cross-checked with nflverse (github.com/nflverse), CC BY 4.0.',
       'https://en.wikipedia.org', date '2026-09-01', coalesce((select max(fetched_at)::date from legacy_wikipedia_daily.page), current_date),
       'Scores of the season in progress, read each day from the "<season> <club> season" articles (and the MLB postseason article) by scripts/daily; the exact wikitext of every revision used is in legacy_files.raw_archive under wikipedia/<day>/<league>/.'
on conflict (code) do nothing;   -- retrieved_on is set when the row is made, not on every run: a daily bump wrote meta.source each day and sent that day's release to review
create temp table src as select source_id from meta.source where code = 'wikipedia_daily';
create temp table chg (what text not null, n bigint not null);

-- ------------------------------------------------------------------ clubs, seasons, team seasons
-- A club's current full name -> franchise (the identity valid today, else the latest one of that name).
create temp table club as
select distinct on (fl.league_code, fi.full_name) fl.league_code as league, fi.full_name as name, fi.franchise_id
from core.franchise_league fl join core.franchise_identity fi using (franchise_id)
order by fl.league_code, fi.full_name,
         (fi.valid_during @> current_date and fl.valid_during @> current_date) desc,
         coalesce(upper(fi.valid_during), 'infinity'::date) desc, fi.franchise_id;

-- The staged games with their franchises and what the report will do with each (used by the checks): result (final, not disputed),
-- hold (final but the sources disagree), schedule, cancel, note (postponed or suspended).
create temp table sg0 as
select g.*, h.franchise_id as hf, a.franchise_id as af,
       case when g.status = 'final' and g.confidence in ('confirmed', 'single', 'resolved') then 'result'
            when g.status = 'final' then 'hold'
            when g.status = 'scheduled' then 'schedule'
            when g.status = 'cancelled' then 'cancel'
            else 'note' end as act
from legacy_wikipedia_daily.game g
left join club h on h.league = g.league and h.name = g.home_name
left join club a on a.league = g.league and a.name = g.away_name;
create temp table sg as select * from sg0 where hf is not null and af is not null and hf <> af;
create temp table scope as select distinct league, season from legacy_wikipedia_daily.game;
-- a season no other source holds any game of: its scheduled games are ours to make (checks.sql; the rule itself is ingest.shell_wanted)
create temp table owned_season as
select league, season from scope s
where not exists (select 1 from core.game g join core.season x using (season_id)
                  where x.league_code = s.league and x.start_year = s.season and g.source_id <> (select source_id from src));

-- Seasons (a calendar-year league's season is one year; the NHL's and NBA's start in the autumn).
with i as (
insert into core.season (league_code, start_year, end_year, label, games_per_team, source_id)
select w.league, w.season, case when w.league in ('nhl', 'nba') then w.season + 1 else w.season end,
       case when w.league in ('nhl', 'nba') then w.season || '-' || right((w.season + 1)::text, 2) else w.season::text end,
       case w.league when 'nhl' then 82 when 'nba' then 82 when 'mlb' then 162 when 'nfl' then 17 when 'cfl' then 18 end,
       (select source_id from src)
from (select distinct league, season from legacy_wikipedia_daily.page where kind = 'team'
      union select league, season from scope) w
on conflict (league_code, start_year) do nothing returning 1)
insert into chg select 'seasons added', count(*) from i;
with u as (
  update core.season s set regular_starts_on = d.rs, regular_ends_on = d.re, playoffs_end_on = d.pe
  from (select league, season, min(game_date) filter (where phase = 'regular') rs, max(game_date) filter (where phase = 'regular') re,
               max(game_date) filter (where phase = 'playoffs') pe
        from sg where status in ('final', 'scheduled') group by 1, 2) d
  where s.league_code = d.league and s.start_year = d.season and s.source_id = (select source_id from src)
    and (s.regular_starts_on, s.regular_ends_on, s.playoffs_end_on) is distinct from (d.rs, d.re, d.pe)
  returning 1)
insert into chg select 'season dates set', count(*) from u;

-- Team seasons: every club that has a season article, and every club in a staged game.
with i as (
insert into core.team_season (franchise_id, season_id, source_id)
select distinct c.franchise_id, s.season_id, (select source_id from src)
from (select league, season, club as name from legacy_wikipedia_daily.page where kind = 'team' and club is not null
      union select league, season, home_name from sg union select league, season, away_name from sg) x
join club c on c.league = x.league and c.name = x.name
join core.season s on s.league_code = x.league and s.start_year = x.season
on conflict (franchise_id, season_id) do nothing returning 1)
insert into chg select 'team seasons added', count(*) from i;
update core.team_season ts set franchise_identity_id = (
  select i.franchise_identity_id from core.franchise_identity i join core.season s on s.season_id = ts.season_id
  where i.franchise_id = ts.franchise_id
    and i.valid_during @> case s.league_code when 'mlb' then make_date(s.start_year, 7, 1) when 'cfl' then make_date(s.start_year, 9, 15)
                                             when 'nfl' then make_date(s.start_year, 10, 1) else make_date(s.start_year, 10, 15) end
  order by lower(i.valid_during) desc limit 1)
where ts.franchise_identity_id is null and ts.source_id = (select source_id from src);

select 'daily changes' as "daily changes", what, n from chg order by what;
commit;

-- PRODUCTION ONLY. Never run this on DS1 or a working copy (it stops at once on DS1: see the first statement).
-- NOT APPLIED. Apply it only after the checklist below, with John's yes in chat.
--
-- Takes six objects off production because their data now lives in Turso (docs: AGENTS.md section 8, scripts/release/README.md):
--   api.person_admin (matview, 27 MB) and its five chip views, meta.verification + meta.data_issue (26 MB), core.external_id (16 MB),
--   core.batted_ball_player (12 MB), core.betting_line (about 10 MB), and the three matviews that were worked out from them:
--   api.quality, api.provenance, and api.totals' three counts (lines, confirmed, issues), which Turso now serves
--   (web/src/lib/turso/aggregates.ts). DS1 keeps every table: nothing here touches the source of truth.
--   About 91 MB freed: production 457 MB -> about 366 MB (pg_database_size; check it after, section "After" below).
--
-- Checklist, in this order. Every line must be true before this file runs:
--   1. The Turso schema exists and one Turso release per table group is done and verified (release.py status; /admin/data shows each as
--      "done", and the drift check shows the Turso tables "same").
--   2. The site that reads Turso is deployed (TURSO_DATABASE_URL and TURSO_AUTH_TOKEN set on Vercel) and one page of each kind was looked at:
--      /admin/people, a game page with a check mark, /quality, /sources, the home page totals.
--   3. No release is running (meta.data_release has no row in status 'running') and none is pending for these tables.
--   4. Production holds nothing a drop would lose: each table's row count in Turso equals DS1's (core.external_id without 'game' rows).
--
-- What it does, in one transaction (the Management API wraps a multi-statement text in one), so a reader sees the old state or the new
-- one, never half:
--   1. api.games and api.soccer_matches keep every column and answer null for `checked` (the site fills it in from Turso: lib/turso/checked.ts).
--      The two statements are the latest definitions (118 and 078) with the verification sub-select replaced by null::integer; the test
--      scripts/release/test/test_drop_migration.py proves nothing else differs.
--   2. api.totals is rebuilt with lines, confirmed and issues as 0 (the site takes them from Turso); the other columns are as in 015.
--   3. The dependent matviews and views are dropped, then the five tables. NO CASCADE anywhere: if something this file does not know
--      about still uses one of them, the statement fails and the whole file rolls back with nothing changed. Read the error, do not add
--      cascade.
--   api.refresh() and api.refresh_order() list the materialized views from the catalog (097), so they need no change.
--
-- Space: DROP TABLE deletes the files at commit, so pg_database_size falls at once (a DELETE would not).
--
-- Rollback: there is none on production by design (DS1 and Turso hold the data). To bring a table back, run its migration (001, 003, 072,
-- 123/127) and publish it with a data release; the release tool refuses core.external_id, meta.verification, meta.data_issue,
-- core.batted_ball_player and core.betting_line for production while they are Turso tables (scripts/release/turso.py TABLES), so first remove
-- them from that list in a commit.

do $guard$
begin
  if to_regnamespace('legacy_files') is not null then
    raise exception 'this is DS1 or a working copy: this file is for production only';
  end if;
end
$guard$;

set local lock_timeout = '10s';

-- 1. the two views that read meta.verification
create or replace view api.games as
select s.league_code as league, s.start_year as year, g.game_id, g.game_date, g.phase::text as phase, g.status::text as status,
       g.away_team_season_id as away_id, api.team_name(g.away_team_season_id) as away, g.away_score,
       g.home_team_season_id as home_id, api.team_name(g.home_team_season_id) as home, g.home_score,
       g.went_to_overtime as overtime, src.code as source,
       null::integer as checked,
       (select franchise_id from core.team_season where team_season_id = g.away_team_season_id) as away_f,
       (select franchise_id from core.team_season where team_season_id = g.home_team_season_id) as home_f,
       g.starts_at,
       o.nhl_id,
       case
         when g.source_key ~ '^nflverse:[0-9]{4}_[0-9]{2}_'
          and substring(g.source_key from 10 for 4) = s.start_year::text
          and substring(g.source_key from 15 for 2)::smallint between 1 and 22
         then substring(g.source_key from 15 for 2)::smallint
       end as nfl_week,
       case
         when g.source_key ~ '^retro:[0-9]{8}:[A-Z0-9]{3}:[A-Z0-9]{3}:[0-3]:'
          and substring(g.source_key from 7 for 8) = to_char(g.game_date, 'YYYYMMDD')
         then split_part(g.source_key, ':', 3) || ':' || split_part(g.source_key, ':', 5)
       end as retro_box
from core.game g
join core.season s using (season_id)
join meta.source src on src.source_id = g.source_id
left join core.game_league_id o on o.game_id = g.game_id
where g.status <> 'cancelled';

create or replace view api.soccer_matches as
select m.match_id, m.source_key, t.league_code as league, t.year, m.tournament_id, m.stage_key, m.stage_order, m.group_name, m.match_number, m.match_date,
       m.kickoff_local, m.utc_offset,
       m.home_team_id, coalesce(htt.team_name, h.name) as home, h.slug as home_slug, h.flag_code as home_flag, m.home_goals,
       m.away_team_id, coalesce(att.team_name, a.name) as away, a.slug as away_slug, a.flag_code as away_flag, m.away_goals,
       m.home_goals_90, m.away_goals_90, m.extra_time, m.shootout, m.home_penalties, m.away_penalties,
       m.winner_team_id, m.is_replay, m.venue_name, m.venue_city, m.venue_country, m.venue_wikidata_id, m.venue_id,
       (select count(*)::int from core.soccer_appearance x where x.match_id = m.match_id) as lineup_players,
       (select count(*)::int from core.soccer_goal x where x.match_id = m.match_id) as goal_rows,
       (select code from meta.source where source_id = m.source_id) as source,
       null::integer as checked,
       m.attendance, m.shootout_style
from core.soccer_match m
join core.soccer_tournament t using (tournament_id)
join core.soccer_team h on h.team_id = m.home_team_id
join core.soccer_team a on a.team_id = m.away_team_id
left join core.soccer_tournament_team htt on htt.tournament_id = m.tournament_id and htt.team_id = m.home_team_id
left join core.soccer_tournament_team att on att.tournament_id = m.tournament_id and att.team_id = m.away_team_id;

-- 2. api.totals without the three counts (same columns and order as migration 015; the unique key from 097)
drop materialized view api.totals;
create materialized view api.totals as
select (select count(*) from core.game where status <> 'cancelled') as games,
       (select count(*) from core.game where status = 'final') as finals,
       0::bigint as lines,
       0::bigint as confirmed,
       0::bigint as issues,
       (select count(*) from core.award_winner) as award_winners,
       (select count(distinct franchise_id) from core.team_season) as franchises,
       (select count(*) from core.season) as seasons,
       now() as refreshed_at;
create unique index totals_refreshed_at_key on api.totals (refreshed_at);
grant select on api.totals to anon, authenticated;

-- 3. what was worked out from the tables, and the tables
drop view if exists api.person_admin_countries;
drop view if exists api.person_admin_sports;
drop view if exists api.person_admin_sources;
drop view if exists api.person_admin_letters;
drop view if exists api.person_admin_span;
drop materialized view if exists api.person_admin;
drop materialized view if exists api.quality;
drop materialized view if exists api.provenance;
drop view if exists api.batted_ball_player;

drop table meta.verification;
drop table meta.data_issue;
drop table core.external_id;
drop table core.batted_ball_player;
drop table core.betting_line;

-- After (a separate request, read-only):
--   select pg_size_pretty(pg_database_size(current_database()));      -- expect about 366 MB
--   select count(*) from api.games where checked is not null;          -- 0: the site fills `checked` in from Turso
--   select * from api.totals;                                          -- one row

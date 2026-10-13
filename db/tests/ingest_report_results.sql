-- Tests for ingest.report_results (migrations 044 and 045). Run with db/tests/run-ingest-tests.sh: it applies both migrations inside one
-- transaction, runs this file, prints the result and ROLLS BACK, so nothing stays in the database.
-- Fixtures: MLB season 2099 (only the daily source holds games: "owned") and MLB season 2098 (games of another source: SPX).
-- Every check is a row in _t; the last query prints the failures and one RESULT line.

\o /dev/null
create temp table _t (n serial, name text not null, ok boolean not null, detail text);
create function pg_temp.chk(p_name text, p_ok boolean, p_detail text default null) returns void language sql
as $$ insert into _t (name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;

-- ---------------------------------------------------------------------------------------------- fixtures
create temp table _fx as
select ingest.franchise_id('spx_database:77') as nyy, ingest.franchise_id('spx_database:62') as bos,
       ingest.franchise_id('spx_database:87') as tor, ingest.franchise_id('spx_database:85') as tb,
       ingest.daily_source() as daily, (select source_id from meta.source where code = 'spx_database') as spx;
select pg_temp.chk('fixture: the four franchises and the daily source exist', nyy is not null and bos is not null and tor is not null and tb is not null and daily is not null and spx is not null) from _fx;

insert into core.season (league_code, start_year, end_year, label, games_per_team, source_id) select 'mlb', 2099, 2099, '2099', 162, daily from _fx;
insert into core.season (league_code, start_year, end_year, label, games_per_team, source_id) select 'mlb', 2098, 2098, '2098', 162, spx from _fx;
insert into core.team_season (franchise_id, season_id, source_id)
select f.fid, s.season_id, (select daily from _fx) from (select unnest(array[nyy, bos, tor, tb]) fid from _fx) f, core.season s where s.league_code = 'mlb' and s.start_year in (2098, 2099);

-- foreign games in 2098 (source SPX): a scheduled one, a final one, a doubleheader, a pair of neighbours, one to move
create function pg_temp.fgame(p_key text, p_date date, p_home text, p_away text, p_status text, p_hs int, p_as int) returns bigint language sql
as $$ insert into core.game (season_id, phase, game_date, home_team_season_id, away_team_season_id, status, home_score, away_score, source_id, source_key)
      select s.season_id, 'regular', p_date,
             (select team_season_id from core.team_season where season_id = s.season_id and franchise_id = ingest.franchise_id(p_home)),
             (select team_season_id from core.team_season where season_id = s.season_id and franchise_id = ingest.franchise_id(p_away)),
             p_status::core.game_status, p_hs, p_as, (select spx from _fx), p_key
      from core.season s where s.league_code = 'mlb' and s.start_year = 2098
      returning game_id $$;
create temp table _g as select 'F1'::text as k, pg_temp.fgame('test:F1', date '2098-05-01', 'spx_database:77', 'spx_database:62', 'scheduled', null, null) as id
  union all select 'F2', pg_temp.fgame('test:F2', date '2098-05-02', 'spx_database:77', 'spx_database:62', 'final', 2, 1)
  union all select 'F3a', pg_temp.fgame('test:F3a', date '2098-05-03', 'spx_database:87', 'spx_database:85', 'scheduled', null, null)
  union all select 'F3b', pg_temp.fgame('test:F3b', date '2098-05-03', 'spx_database:87', 'spx_database:85', 'scheduled', null, null)
  union all select 'F4', pg_temp.fgame('test:F4', date '2098-05-11', 'spx_database:62', 'spx_database:77', 'scheduled', null, null)
  union all select 'F5', pg_temp.fgame('test:F5', date '2098-05-20', 'spx_database:87', 'spx_database:62', 'scheduled', null, null);

-- ---------------------------------------------------------------------------------------------- helpers
create function pg_temp.ob(p_ref text, p_date date, p_home text, p_away text, p_status text default 'scheduled', p_hs int default null, p_as int default null,
                           p_verdict text default 'none', p_extra jsonb default '{}', p_season int default 2099) returns jsonb language sql
as $$ select jsonb_build_object('game_ref', p_ref, 'league', 'mlb', 'season', p_season, 'phase', 'regular', 'game_date', p_date, 'game_no', 0,
                               'home_key', p_home, 'away_key', p_away, 'home_name', p_home, 'away_name', p_away, 'status', p_status,
                               'home_score', p_hs, 'away_score', p_as, 'verdict', p_verdict, 'source', 'wikipedia', 'ref', 'page@1',
                               'agree', jsonb_build_array('page@1'), 'dissent', '[]'::jsonb) || p_extra $$;
create function pg_temp.rep(p_obs jsonb) returns jsonb language sql as $$ select ingest.report_results(jsonb_build_array(p_obs)) $$;
-- the game a ref points at (its key, else an external id)
create function pg_temp.gid(p_ref text) returns bigint language sql
as $$ select coalesce((select game_id from core.game where source_id = (select daily from _fx) and source_key = p_ref),
                      (select entity_id from core.external_id where source_id = (select daily from _fx) and entity_kind = 'game' and external_key = p_ref)) $$;
create function pg_temp.gs(p_ref text) returns text language sql
as $$ select g.status || '|' || coalesce(g.home_score::text, '-') || '-' || coalesce(g.away_score::text, '-') || '|' || g.game_date || '|' || coalesce(g.original_date::text, '') from core.game g where g.game_id = pg_temp.gid(p_ref) $$;
create function pg_temp.gs_id(p_id bigint) returns text language sql
as $$ select g.status || '|' || coalesce(g.home_score::text, '-') || '-' || coalesce(g.away_score::text, '-') || '|' || g.game_date || '|' || coalesce(g.original_date::text, '') from core.game g where g.game_id = p_id $$;
create function pg_temp.ver(p_id bigint) returns text language sql
as $$ select string_agg(status || ' ' || coalesce(their_value, ''), ',') from meta.verification where entity_kind = 'game' and entity_id = p_id and field = 'score' and source_id = (select daily from _fx) $$;
create function pg_temp.issues(p_key text, p_open_only boolean default false) returns text language sql
as $$ select string_agg(issue || ' => ' || coalesce(resolution, '') || case when resolved_at is not null then ' [resolved]' else '' end, ' ;; ' order by issue)
      from meta.data_issue where source_id = (select daily from _fx) and entity_kind = 'game' and entity_key = p_key and (not p_open_only or resolved_at is null) $$;
create function pg_temp.nobs(p_ref text) returns integer language sql as $$ select count(*)::int from ingest.game_observation where game_ref = p_ref $$;
create function pg_temp.shell(p_ref text, p_date date, p_home text, p_away text) returns bigint language sql
as $$ select ingest.create_shell('mlb', 2099, 'regular', p_date, ingest.franchise_id(p_home), ingest.franchise_id(p_away), false, p_ref) $$;
create function pg_temp.hash_games(p_season int) returns text language sql
as $$ select md5(coalesce(string_agg(row(g.phase, g.game_date, g.home_team_season_id, g.away_team_season_id, g.status, g.home_score, g.away_score, g.went_to_overtime,
                                             g.decided_by_shootout, g.original_date, g.source_id, g.source_key)::text, ';' order by g.source_key), ''))
      from core.game g join core.season s using (season_id) where s.league_code = 'mlb' and s.start_year = p_season $$;
create function pg_temp.out(p_res jsonb, p_outcome text) returns int language sql as $$ select coalesce((p_res -> 'outcomes' ->> p_outcome)::int, 0) $$;

create temp table _k as select 'spx_database:77'::text as nyy, 'spx_database:62'::text as bos, 'spx_database:87'::text as tor, 'spx_database:85'::text as tb;

-- ---------------------------------------------------------------------------------------------- keys
select pg_temp.chk('franchise keys: every franchise has a key and it maps back',
       (select count(*) from core.franchise) = (select count(*) from core.franchise f where ingest.franchise_id(ingest.franchise_key(f.franchise_id)) = f.franchise_id));
select pg_temp.chk('franchise keys are unique', (select count(distinct ingest.franchise_key(franchise_id)) from core.franchise) = (select count(*) from core.franchise));

-- ---------------------------------------------------------------------------------------------- S1: one game's whole life, in an owned season
create temp table _r (k text primary key, r jsonb);
insert into _r select 'S1a', pg_temp.rep(pg_temp.ob('T1', date '2099-04-01', 'spx_database:77', 'spx_database:62'));
select pg_temp.chk('S1 a scheduled report for a game core does not hold: unmatched, stored, no data issue',
       pg_temp.out(r, 'unmatched') = 1 and (r ->> 'new') = '1' and pg_temp.nobs('T1') = 1 and pg_temp.issues('T1') is null, r::text) from _r where k = 'S1a';
select pg_temp.chk('S1 the bulk step makes the game', pg_temp.shell('T1', date '2099-04-01', 'spx_database:77', 'spx_database:62') is not null);
insert into _r select 'S1b', pg_temp.rep(pg_temp.ob('T1', date '2099-04-01', 'spx_database:77', 'spx_database:62'));
select pg_temp.chk('S1 the same report again adds no row, bumps seen_count, and is applied now that the game exists',
       (r ->> 'new') = '0' and (r ->> 'repeat') = '1' and pg_temp.nobs('T1') = 1 and (select seen_count from ingest.game_observation where game_ref = 'T1') = 2
       and (select outcome from ingest.game_observation where game_ref = 'T1') = 'unchanged' and r -> 'changed' = '[]'::jsonb, r::text) from _r where k = 'S1b';
insert into _r select 'S1c', pg_temp.rep(pg_temp.ob('T1', date '2099-04-01', 'spx_database:77', 'spx_database:62', 'in_progress', 1, 0));
select pg_temp.chk('S1 scheduled -> in_progress with the live score', pg_temp.gs('T1') = 'in_progress|1-0|2099-04-01|'
       and (r -> 'changed' -> 0 ->> 'league') = 'mlb' and (r -> 'changed' -> 0 ->> 'game_date') = '2099-04-01' and (r -> 'changed' -> 0 ->> 'to') = 'in_progress', pg_temp.gs('T1')) from _r where k = 'S1c';
select pg_temp.rep(pg_temp.ob('T1', date '2099-04-01', 'spx_database:77', 'spx_database:62', 'in_progress', 3, 2));
select pg_temp.chk('S1 in_progress -> in_progress updates the score', pg_temp.gs('T1') = 'in_progress|3-2|2099-04-01|', pg_temp.gs('T1'));
select pg_temp.rep(pg_temp.ob('T1', date '2099-04-01', 'spx_database:77', 'spx_database:62', 'suspended', 3, 2));
select pg_temp.chk('S1 in_progress -> suspended', pg_temp.gs('T1') = 'suspended|3-2|2099-04-01|', pg_temp.gs('T1'));
select pg_temp.rep(pg_temp.ob('T1', date '2099-04-01', 'spx_database:77', 'spx_database:62', 'in_progress', 3, 2));
select pg_temp.chk('S1 suspended -> in_progress', pg_temp.gs('T1') = 'in_progress|3-2|2099-04-01|', pg_temp.gs('T1'));
select pg_temp.rep(pg_temp.ob('T1', date '2099-04-01', 'spx_database:77', 'spx_database:62', 'final', 5, 3, 'confirmed'));
select pg_temp.chk('S1 in_progress -> final with both scores; two agreeing sources: verification confirmed, no data issue',
       pg_temp.gs('T1') = 'final|5-3|2099-04-01|' and pg_temp.ver(pg_temp.gid('T1')) = 'confirmed 5-3' and pg_temp.issues('T1') is null, pg_temp.gs('T1'));
insert into _r select 'S1h', pg_temp.rep(pg_temp.ob('T1', date '2099-04-01', 'spx_database:77', 'spx_database:62'));
select pg_temp.chk('S1 final is terminal: a scheduled report behind it is ignored', pg_temp.gs('T1') = 'final|5-3|2099-04-01|' and pg_temp.out(r, 'ignored') = 1 and r -> 'changed' = '[]'::jsonb) from _r where k = 'S1h';
insert into _r select 'S1i', pg_temp.rep(pg_temp.ob('T1', date '2099-04-01', 'spx_database:77', 'spx_database:62', 'final', 5, 3, 'confirmed'));
select pg_temp.chk('S1 the same final from another source: confirmed, nothing changes', pg_temp.out(r, 'confirmed') = 1 and r -> 'changed' = '[]'::jsonb and pg_temp.gs('T1') = 'final|5-3|2099-04-01|') from _r where k = 'S1i';
insert into _r select 'S1j', pg_temp.rep(pg_temp.ob('T1', date '2099-04-01', 'spx_database:77', 'spx_database:62', 'final', 3, 5, 'confirmed'));
select pg_temp.chk('S1 final is terminal: a different final score is rejected, the game keeps 5-3, verification disputed, data issue raised',
       pg_temp.out(r, 'rejected') = 1 and r -> 'changed' = '[]'::jsonb and pg_temp.gs('T1') = 'final|5-3|2099-04-01|' and pg_temp.ver(pg_temp.gid('T1')) = 'disputed 3-5'
       and pg_temp.issues('T1') = 'Existing result 5-3, reported 3-5 => Kept existing; needs a third source', pg_temp.issues('T1')) from _r where k = 'S1j';
select pg_temp.rep(pg_temp.ob('T1', date '2099-04-01', 'spx_database:77', 'spx_database:62', 'final', 5, 3, 'confirmed'));
select pg_temp.chk('S1 a disputed verification stays disputed until a person clears it', pg_temp.ver(pg_temp.gid('T1')) = 'disputed 3-5');
select pg_temp.chk('S1 one observation row per change of state (A, B, A is three rows), seen_count counts the sightings',
       pg_temp.nobs('T1') = 10 and (select sum(seen_count) from ingest.game_observation where game_ref = 'T1') = 11, pg_temp.nobs('T1')::text);

-- ---------------------------------------------------------------------------------------------- S2: postponed, then played on another day
select pg_temp.shell('T2', date '2099-04-02', 'spx_database:87', 'spx_database:85');
select pg_temp.rep(pg_temp.ob('T2', date '2099-04-02', 'spx_database:87', 'spx_database:85'));
insert into _r select 'S2a', pg_temp.rep(pg_temp.ob('T2', date '2099-04-02', 'spx_database:87', 'spx_database:85', 'postponed'));
select pg_temp.chk('S2 scheduled -> postponed', pg_temp.gs('T2') = 'postponed|---|2099-04-02|' and (r -> 'changed' -> 0 ->> 'to') = 'postponed') from _r where k = 'S2a';
insert into _r select 'S2b', pg_temp.rep(pg_temp.ob('T2', date '2099-04-02', 'spx_database:87', 'spx_database:85', 'postponed'));
select pg_temp.chk('S2 the postponed report again changes nothing', (r ->> 'new') = '0' and r -> 'changed' = '[]'::jsonb) from _r where k = 'S2b';
select pg_temp.rep(pg_temp.ob('T2b', date '2099-04-20', 'spx_database:87', 'spx_database:85'));
select pg_temp.chk('S2 postponed -> scheduled on a new date (a new key): the same game moves, original_date records the old day, the new key is linked',
       pg_temp.gs('T2b') = 'scheduled|---|2099-04-20|2099-04-02' and pg_temp.gid('T2b') = pg_temp.gid('T2'), pg_temp.gs('T2b'));
select pg_temp.rep(pg_temp.ob('T2b', date '2099-04-20', 'spx_database:87', 'spx_database:85', 'final', 4, 2, 'confirmed'));
select pg_temp.chk('S2 and it is then played', pg_temp.gs('T2b') = 'final|4-2|2099-04-20|2099-04-02', pg_temp.gs('T2b'));

-- S3: cancelled is terminal
select pg_temp.shell('T3', date '2099-04-03', 'spx_database:77', 'spx_database:62');
select pg_temp.rep(pg_temp.ob('T3', date '2099-04-03', 'spx_database:77', 'spx_database:62', 'cancelled'));
select pg_temp.chk('S3 scheduled -> cancelled', pg_temp.gs('T3') = 'cancelled|---|2099-04-03|', pg_temp.gs('T3'));
insert into _r select 'S3b', pg_temp.rep(pg_temp.ob('T3', date '2099-04-03', 'spx_database:77', 'spx_database:62', 'final', 1, 0, 'single'));
select pg_temp.chk('S3 cancelled is terminal: a final is rejected', pg_temp.out(r, 'rejected') = 1 and pg_temp.gs('T3') = 'cancelled|---|2099-04-03|') from _r where k = 'S3b';

-- S4: started, postponed, played later
select pg_temp.shell('T4', date '2099-04-04', 'spx_database:62', 'spx_database:87');
select pg_temp.rep(pg_temp.ob('T4', date '2099-04-04', 'spx_database:62', 'spx_database:87', 'in_progress', 0, 0));
select pg_temp.rep(pg_temp.ob('T4', date '2099-04-04', 'spx_database:62', 'spx_database:87', 'postponed'));
select pg_temp.chk('S4 in_progress -> postponed', pg_temp.gs('T4') like 'postponed|%|2099-04-04|', pg_temp.gs('T4'));
select pg_temp.rep(pg_temp.ob('T4b', date '2099-04-09', 'spx_database:62', 'spx_database:87', 'final', 7, 1, 'single'));
select pg_temp.chk('S4 postponed -> final on the new date, a single-source final is allowed and flagged',
       pg_temp.gs('T4b') = 'final|7-1|2099-04-09|2099-04-04' and pg_temp.issues('T4') = 'Only one club''s Wikipedia page lists this result => Added; confirmed when the other club''s page agrees', pg_temp.issues('T4'));

-- S5: single source, later confirmed
select pg_temp.shell('T5', date '2099-04-05', 'spx_database:87', 'spx_database:62');
select pg_temp.rep(pg_temp.ob('T5', date '2099-04-05', 'spx_database:87', 'spx_database:62', 'final', 2, 1, 'single'));
select pg_temp.chk('S5 single-source final: applied, flagged, not verified', pg_temp.gs('T5') = 'final|2-1|2099-04-05|' and pg_temp.ver(pg_temp.gid('T5')) is null and pg_temp.issues('T5', true) like 'Only one club%', pg_temp.issues('T5'));
select pg_temp.rep(pg_temp.ob('T5', date '2099-04-05', 'spx_database:87', 'spx_database:62', 'final', 2, 1, 'confirmed'));
select pg_temp.chk('S5 the other source agrees: verification confirmed, the flag is resolved', pg_temp.ver(pg_temp.gid('T5')) = 'confirmed 2-1' and pg_temp.issues('T5', true) is null and pg_temp.issues('T5') like '%[resolved]', pg_temp.issues('T5'));
insert into _r select 'S5c', pg_temp.rep(pg_temp.ob('T5', date '2099-04-05', 'spx_database:87', 'spx_database:62', 'final', 2, 1, 'single'));
select pg_temp.chk('S5 a single report of the same score later changes nothing and raises nothing', pg_temp.issues('T5', true) is null and r -> 'changed' = '[]'::jsonb and pg_temp.ver(pg_temp.gid('T5')) = 'confirmed 2-1') from _r where k = 'S5c';

-- S6: sources disagree, nothing finalizes (the bulk step adds the game only once a result is settled)
insert into _r select 'S6a', pg_temp.rep(pg_temp.ob('T6', date '2099-04-06', 'spx_database:77', 'spx_database:87', 'final', 3, 2, 'disputed', '{"dissent":["A page says X 3, Y 2","B page says X 2, Y 3"]}'));
select pg_temp.chk('S6 sources disagree and there is no game: unmatched, flagged', pg_temp.out(r, 'unmatched') = 1 and pg_temp.issues('T6') like 'Wikipedia sources disagree on %=> Not applied; needs a third source', pg_temp.issues('T6')) from _r where k = 'S6a';
select pg_temp.shell('T6', date '2099-04-06', 'spx_database:77', 'spx_database:87');
insert into _r select 'S6b', pg_temp.rep(pg_temp.ob('T6', date '2099-04-06', 'spx_database:77', 'spx_database:87', 'final', 3, 2, 'disputed', '{"dissent":["A page says X 3, Y 2","B page says X 2, Y 3"]}'));
select pg_temp.chk('S6 disputed between sources never finalizes: the game stays scheduled', pg_temp.out(r, 'held') = 1 and pg_temp.gs('T6') = 'scheduled|---|2099-04-06|' and r -> 'changed' = '[]'::jsonb, r::text) from _r where k = 'S6b';
select pg_temp.rep(pg_temp.ob('T6', date '2099-04-06', 'spx_database:77', 'spx_database:87', 'final', 6, 1, 'confirmed'));
select pg_temp.chk('S6 settled later: final, and the disagreement flag is resolved', pg_temp.gs('T6') = 'final|6-1|2099-04-06|' and pg_temp.issues('T6', true) is null and pg_temp.issues('T6') like '%[resolved]', pg_temp.issues('T6'));

-- S7: unmatched
insert into _r select 'S7a', pg_temp.rep(pg_temp.ob('T7x', date '2099-04-07', 'nope:1', 'spx_database:62', 'final', 1, 0, 'single'));
select pg_temp.chk('S7 a club key no franchise has: unmatched + data issue', pg_temp.out(r, 'unmatched') = 1 and pg_temp.issues('T7x') like 'Club not matched to a franchise%', pg_temp.issues('T7x')) from _r where k = 'S7a';
insert into _r select 'S7b', pg_temp.rep(pg_temp.ob('T7y', date '2090-04-07', 'spx_database:77', 'spx_database:62', 'final', 1, 0, 'single', '{}', 2090));
select pg_temp.chk('S7 a season core does not hold: unmatched + data issue', pg_temp.out(r, 'unmatched') = 1 and pg_temp.issues('T7y') like 'No game in core for%', pg_temp.issues('T7y')) from _r where k = 'S7b';
insert into _r select 'S7c', pg_temp.rep(pg_temp.ob('T7', date '2099-04-08', 'spx_database:77', 'spx_database:62', 'final', 4, 4, 'confirmed'));
select pg_temp.chk('S7 a result with no game yet: unmatched + data issue, the game is not made by this function',
       pg_temp.out(r, 'unmatched') = 1 and pg_temp.issues('T7') like 'No game in core for%' and pg_temp.gid('T7') is null, pg_temp.issues('T7')) from _r where k = 'S7c';
select pg_temp.shell('T7', date '2099-04-08', 'spx_database:77', 'spx_database:62');
insert into _r select 'S7d', pg_temp.rep(pg_temp.ob('T7', date '2099-04-08', 'spx_database:77', 'spx_database:62', 'final', 4, 4, 'confirmed'));
select pg_temp.chk('S7 the bulk path adds the game, the same report is applied, the unmatched issue is resolved',
       pg_temp.gs('T7') = 'final|4-4|2099-04-08|' and pg_temp.issues('T7', true) is null and pg_temp.nobs('T7') = 1 and (r ->> 'new') = '0', pg_temp.issues('T7')) from _r where k = 'S7d';
insert into _r select 'S7e', pg_temp.rep(pg_temp.ob('T7p', date '2099-04-08', 'spx_database:62', 'spx_database:77', 'postponed'));
select pg_temp.chk('S7 postponed with no game: logged "Not added as a game", exactly as the first daily load did',
       pg_temp.issues('T7p') like 'Postponed per Wikipedia: % at % on 2099-04-08 => Not added as a game', pg_temp.issues('T7p')) from _r where k = 'S7e';

-- S8: doubleheader in an owned season
select pg_temp.shell('T8a', date '2099-04-12', 'spx_database:85', 'spx_database:87');
select pg_temp.shell('T8b', date '2099-04-12', 'spx_database:85', 'spx_database:87');
select ingest.report_results(jsonb_build_array(pg_temp.ob('T8b', date '2099-04-12', 'spx_database:85', 'spx_database:87', 'final', 2, 0, 'confirmed', '{"game_no":1}'),
                                               pg_temp.ob('T8a', date '2099-04-12', 'spx_database:85', 'spx_database:87', 'final', 9, 8, 'confirmed')));
select pg_temp.chk('S8 a doubleheader: each game finds its own row by key', pg_temp.gs('T8a') = 'final|9-8|2099-04-12|' and pg_temp.gs('T8b') = 'final|2-0|2099-04-12|');

-- ---------------------------------------------------------------------------------------------- games of another source (2098, SPX)
create function pg_temp.fid(p_k text) returns bigint language sql as $$ select id from _g where k = p_k $$;
select pg_temp.rep(pg_temp.ob('W1', date '2098-05-01', 'spx_database:77', 'spx_database:62', 'final', 4, 3, 'single', '{}', 2098));
select pg_temp.chk('F1 another source''s scheduled game is filled in place (source stays SPX); flagged "No result in DS1"',
       pg_temp.gs_id(pg_temp.fid('F1')) = 'final|4-3|2098-05-01|' and (select source_id from core.game where game_id = pg_temp.fid('F1')) = (select spx from _fx)
       and pg_temp.issues('test:F1') = 'No result in DS1 => Filled from Wikipedia: 4-3 (one club page so far)' and pg_temp.gid('W1') = pg_temp.fid('F1'), pg_temp.issues('test:F1'));
select pg_temp.rep(pg_temp.ob('W1', date '2098-05-01', 'spx_database:77', 'spx_database:62', 'final', 4, 3, 'confirmed', '{}', 2098));
select pg_temp.chk('F1 confirmed by the second club page: verification confirmed, the "one page" suffix is dropped',
       pg_temp.ver(pg_temp.fid('F1')) = 'confirmed 4-3' and pg_temp.issues('test:F1') = 'No result in DS1 => Filled from Wikipedia: 4-3', pg_temp.issues('test:F1'));
insert into _r select 'F1c', pg_temp.rep(pg_temp.ob('W1', date '2098-05-01', 'spx_database:77', 'spx_database:62', 'final', 9, 9, 'confirmed', '{}', 2098));
select pg_temp.chk('F1 a result the daily load filled is terminal too', pg_temp.out(r, 'rejected') = 1 and pg_temp.gs_id(pg_temp.fid('F1')) = 'final|4-3|2098-05-01|') from _r where k = 'F1c';

create temp table _h as select pg_temp.hash_games(2098) as h0;
insert into _r select 'F2a', pg_temp.rep(pg_temp.ob('W2', date '2098-05-02', 'spx_database:77', 'spx_database:62', 'final', 2, 1, 'single', '{}', 2098));
select pg_temp.chk('F2 SPX''s final, the same score from a single report: verification confirmed, game untouched',
       pg_temp.out(r, 'confirmed') = 1 and pg_temp.ver(pg_temp.fid('F2')) = 'confirmed 2-1' and pg_temp.gs_id(pg_temp.fid('F2')) = 'final|2-1|2098-05-02|') from _r where k = 'F2a';
insert into _r select 'F2b', pg_temp.rep(pg_temp.ob('W2', date '2098-05-02', 'spx_database:77', 'spx_database:62', 'final', 1, 2, 'confirmed', '{}', 2098));
select pg_temp.chk('F2 SPX''s final, another score: rejected, verification disputed, game untouched, issue raised',
       pg_temp.out(r, 'rejected') = 1 and pg_temp.ver(pg_temp.fid('F2')) = 'disputed 1-2' and pg_temp.gs_id(pg_temp.fid('F2')) = 'final|2-1|2098-05-02|'
       and pg_temp.issues('test:F2') = 'Existing result 2-1, reported 1-2 => Kept existing; needs a third source', pg_temp.issues('test:F2')) from _r where k = 'F2b';

insert into _r select 'F3', ingest.report_results(jsonb_build_array(pg_temp.ob('D0', date '2098-05-03', 'spx_database:87', 'spx_database:85', 'final', 1, 0, 'confirmed', '{}', 2098),
                                                                    pg_temp.ob('D1', date '2098-05-03', 'spx_database:87', 'spx_database:85', 'final', 2, 0, 'confirmed', '{"game_no":1}', 2098)));
select pg_temp.chk('F3 a doubleheader of another source: the two reports take the two different games',
       pg_temp.gid('D0') <> pg_temp.gid('D1') and pg_temp.gid('D0') in (pg_temp.fid('F3a'), pg_temp.fid('F3b')) and pg_temp.gid('D1') in (pg_temp.fid('F3a'), pg_temp.fid('F3b'))
       and pg_temp.gs_id(pg_temp.gid('D0')) = 'final|1-0|2098-05-03|' and pg_temp.gs_id(pg_temp.gid('D1')) = 'final|2-0|2098-05-03|', r::text) from _r where k = 'F3';

insert into _r select 'F4', ingest.report_results(jsonb_build_array(pg_temp.ob('C1', date '2098-05-10', 'spx_database:62', 'spx_database:77', 'final', 3, 1, 'confirmed', '{}', 2098),
                                                                    pg_temp.ob('C2', date '2098-05-11', 'spx_database:62', 'spx_database:77', 'final', 6, 5, 'confirmed', '{}', 2098)));
select pg_temp.chk('F4 a game one day off is not taken from the report that names its day: the May 10 report is unmatched, the May 11 one fills the May 11 game',
       pg_temp.gid('C2') = pg_temp.fid('F4') and pg_temp.gs_id(pg_temp.fid('F4')) = 'final|6-5|2098-05-11|' and pg_temp.gid('C1') is null
       and (select outcome from ingest.game_observation where game_ref = 'C1') = 'unmatched', r::text) from _r where k = 'F4';

select pg_temp.rep(pg_temp.ob('M5', date '2098-05-23', 'spx_database:87', 'spx_database:62', 'scheduled', null, null, 'none', '{}', 2098));
select pg_temp.chk('F5 a scheduled game of another source moved three days: moved, original_date kept', pg_temp.gs_id(pg_temp.fid('F5')) = 'scheduled|---|2098-05-23|2098-05-20', pg_temp.gs_id(pg_temp.fid('F5')));
create temp table _h2 as select pg_temp.hash_games(2098) as h1;

-- ---------------------------------------------------------------------------------------------- invalid input
create function pg_temp.fails(p_sql text) returns text language plpgsql
as $$ begin execute p_sql; return 'no error'; exception when others then return sqlstate || ': ' || sqlerrm; end $$;
select pg_temp.chk('invalid: not an array', pg_temp.fails($q$select ingest.report_results('{"a":1}'::jsonb)$q$) like '22023:%');
select pg_temp.chk('invalid: a final with no score', pg_temp.fails($q$select ingest.report_results(jsonb_build_array(pg_temp.ob('V1', date '2099-05-01', 'spx_database:77', 'spx_database:62', 'final', null, null, 'single')))$q$) like '22023: observation 0:%');
select pg_temp.chk('invalid: an unknown status', pg_temp.fails($q$select ingest.report_results(jsonb_build_array(pg_temp.ob('V2', date '2099-05-01', 'spx_database:77', 'spx_database:62', 'won')))$q$) like '22023:%');
select pg_temp.chk('invalid: a final with no verdict', pg_temp.fails($q$select ingest.report_results(jsonb_build_array(pg_temp.ob('V3', date '2099-05-01', 'spx_database:77', 'spx_database:62', 'final', 1, 0)))$q$) like '22023:%');
select pg_temp.chk('invalid: the same club twice', pg_temp.fails($q$select ingest.report_results(jsonb_build_array(pg_temp.ob('V4', date '2099-05-01', 'spx_database:77', 'spx_database:77')))$q$) like '22023:%');
select pg_temp.chk('invalid: one bad element leaves nothing of the call (all or nothing)',
       pg_temp.fails($q$select ingest.report_results(jsonb_build_array(pg_temp.ob('V5', date '2099-05-01', 'spx_database:77', 'spx_database:62'), pg_temp.ob('V6', date '2099-05-01', 'spx_database:77', 'spx_database:62', 'won')))$q$) like '22023: observation 1:%'
       and pg_temp.nobs('V5') = 0);
select pg_temp.chk('invalid: too many in one call', pg_temp.fails($q$select ingest.report_results((select jsonb_agg('{}'::jsonb) from generate_series(1, 20001)))$q$) like '22023:%');

-- ---------------------------------------------------------------------------------------------- idempotency: send every latest state again
create temp table _before as select (select count(*) from ingest.game_observation) as nobs, pg_temp.hash_games(2099) as g99, pg_temp.hash_games(2098) as g98,
       (select count(*) from meta.data_issue where source_id = (select daily from _fx)) as nissue, (select count(*) from meta.verification where source_id = (select daily from _fx)) as nver,
       (select count(*) from core.external_id where source_id = (select daily from _fx)) as next;
insert into _r select 'IDEM', ingest.report_results((select jsonb_agg(to_jsonb(o)) from ingest.game_observation o where o.observation_id = (select max(o2.observation_id) from ingest.game_observation o2 where o2.game_ref = o.game_ref)));
select pg_temp.chk('idempotent: every latest state sent again adds no observation row, changes no game, no issue, no verification, no external id',
       (r ->> 'new') = '0' and r -> 'changed' = '[]'::jsonb and (select nobs from _before) = (select count(*) from ingest.game_observation)
       and (select g99 from _before) = pg_temp.hash_games(2099) and (select g98 from _before) = pg_temp.hash_games(2098)
       and (select nissue from _before) = (select count(*) from meta.data_issue where source_id = (select daily from _fx))
       and (select nver from _before) = (select count(*) from meta.verification where source_id = (select daily from _fx))
       and (select next from _before) = (select count(*) from core.external_id where source_id = (select daily from _fx)), (r - 'changed')::text) from _r where k = 'IDEM';

-- ---------------------------------------------------------------------------------------------- rebuild: replaying the log gives the same end state
create function pg_temp.signature(p_season int) returns text language sql
as $$ select md5(
    (select coalesce(string_agg(row(g.phase, g.game_date, g.status, g.home_score, g.away_score, g.went_to_overtime, g.decided_by_shootout, g.original_date, g.source_id, g.source_key,
                                    (select string_agg(v.status || v.their_value, ',' order by v.status) from meta.verification v where v.entity_kind = 'game' and v.entity_id = g.game_id and v.source_id = (select daily from _fx)),
                                    (select string_agg(e.external_key, ',' order by e.external_key) from core.external_id e where e.entity_kind = 'game' and e.entity_id = g.game_id and e.source_id = (select daily from _fx)))::text,
                             ';' order by g.source_key), '')
     from core.game g join core.season s using (season_id) where s.league_code = 'mlb' and s.start_year = p_season and g.source_id = (select daily from _fx))
    || '#' ||
    (select coalesce(string_agg(entity_key || issue || coalesce(resolution, '') || (resolved_at is not null)::text, ';' order by entity_key, issue), '')
     from meta.data_issue where source_id = (select daily from _fx) and entity_kind = 'game' and entity_key like any (array['T%', 'test:%']))) $$;
create temp table _sig as select pg_temp.signature(2099) as s99;
-- a rebuild of core: the daily games, their verifications and external ids are gone (issues are not touched by any build step)
delete from meta.verification where source_id = (select daily from _fx) and entity_kind = 'game' and entity_id in (select game_id from core.game g join core.season s using (season_id) where s.start_year = 2099 and g.source_id = (select daily from _fx));
delete from core.external_id where source_id = (select daily from _fx) and entity_kind = 'game' and external_key like any (array['T%']);
delete from core.game where source_id = (select daily from _fx) and season_id = (select season_id from core.season where league_code = 'mlb' and start_year = 2099);
select pg_temp.chk('rebuild: the daily games are gone before the replay', (select count(*) from core.game g join core.season s using (season_id) where s.start_year = 2099) = 0);
create temp table _rep as select ingest.replay(true, false) as r;
select pg_temp.chk('rebuild: replaying the log gives the same games, verifications, external ids and issues as the live reports', pg_temp.signature(2099) = (select s99 from _sig), (select r::text from _rep));
select pg_temp.chk('rebuild: a second replay changes nothing', (select pg_temp.signature(2099)) = (select s99 from _sig) and (select (ingest.replay(true, false) ->> 'games_made')::int) = 0);

-- ---------------------------------------------------------------------------------------------- privileges: ingest_writer
select pg_temp.chk('role: ingest_writer exists, cannot log in, is not a superuser', (select not rolcanlogin and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb from pg_roles where rolname = 'ingest_writer'));
select pg_temp.chk('function: report_results is security definer with a fixed search_path', (select prosecdef and proconfig @> array['search_path=pg_catalog, pg_temp'] from pg_proc where oid = 'ingest.report_results(jsonb)'::regprocedure));
select pg_temp.chk('table: row level security is on and nobody but the owner holds a privilege on ingest.game_observation',
       (select relrowsecurity from pg_class where oid = 'ingest.game_observation'::regclass)
       and not exists (select 1 from pg_roles r where r.rolname <> 'postgres' and r.rolname !~ '^pg_' and not r.rolsuper and has_table_privilege(r.oid, 'ingest.game_observation', 'select,insert,update,delete,truncate,references,trigger')));
select pg_temp.chk('no table anywhere gives ingest_writer a single privilege',
       not exists (select 1 from pg_class c where c.relkind in ('r', 'v', 'm', 'p', 'f') and c.relnamespace::regnamespace::text not in ('pg_catalog', 'information_schema', 'pg_toast')
                   and has_table_privilege('ingest_writer', c.oid, 'select,insert,update,delete,truncate,references,trigger')), (select string_agg(c.oid::regclass::text, ', ') from pg_class c where c.relkind in ('r', 'v', 'm', 'p', 'f') and c.relnamespace::regnamespace::text not in ('pg_catalog', 'information_schema', 'pg_toast') and has_table_privilege('ingest_writer', c.oid, 'select,insert,update,delete,truncate,references,trigger')));
select pg_temp.chk('no sequence gives ingest_writer a privilege', not exists (select 1 from pg_class c where c.relkind = 'S' and (case when c.relkind = 'S' then has_sequence_privilege('ingest_writer', c.oid, 'usage,select,update') end)));
select pg_temp.chk('ingest_writer can execute exactly one function outside pg_catalog: report_results',
       (select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text) from pg_proc p
         where p.pronamespace::regnamespace::text not in ('pg_catalog', 'information_schema') and p.pronamespace::regnamespace::text not like 'pg_temp%' and has_function_privilege('ingest_writer', p.oid, 'execute') and has_schema_privilege('ingest_writer', p.pronamespace, 'usage'))
       = array['ingest.report_results(jsonb)'], (select string_agg(p.oid::regprocedure::text, ', ') from pg_proc p where p.pronamespace::regnamespace::text not in ('pg_catalog', 'information_schema') and p.pronamespace::regnamespace::text not like 'pg_temp%' and has_function_privilege('ingest_writer', p.oid, 'execute') and has_schema_privilege('ingest_writer', p.pronamespace, 'usage')));
select pg_temp.chk('ingest_writer cannot create anything in any schema', not exists (select 1 from pg_namespace n where n.nspname not in ('pg_toast') and n.nspname not like 'pg_temp%' and has_schema_privilege('ingest_writer', n.oid, 'create')));
select pg_temp.chk('public (everyone) has no privilege on the ingest schema or its functions',
       not has_schema_privilege('public', 'ingest', 'usage,create') and not exists (select 1 from pg_proc p where p.pronamespace = 'ingest'::regnamespace and has_function_privilege('public', p.oid, 'execute')));

-- what the role can and cannot do, run AS the role (the DO block cannot write to _t as the role; it reports through settings)
set local role ingest_writer;
do $$
declare t text; r jsonb; denied int := 0; tried int := 0; stmt text; what text[] := array[
  'select count(*) from ingest.game_observation', 'insert into ingest.game_observation (game_ref) values (''x'')', 'update ingest.game_observation set outcome = null', 'delete from ingest.game_observation',
  'select count(*) from core.game', 'update core.game set status = ''final''', 'delete from core.game', 'insert into core.game (season_id) values (1)',
  'select count(*) from meta.data_issue', 'insert into meta.data_issue (entity_kind, entity_key, issue) values (''game'', ''x'', ''x'')', 'delete from meta.verification',
  'update meta.verification set status = ''confirmed''', 'select count(*) from core.external_id', 'truncate core.game', 'select count(*) from meta.source',
  'select count(*) from core.franchise', 'select ingest.apply_observation(1, true)', 'select ingest.replay()', 'select ingest.create_shell(''mlb'', 2099, ''regular'', current_date, 1, 2, false, ''x'')',
  'select ingest.raise_issue(''x'', ''x'', ''x'')', 'select ingest.set_verification(1, ''confirmed'', ''x'')', 'select ingest.match_game(''mlb'', 2099, 1, 2, current_date, ''x'', ''final'')',
  'select ingest.franchise_id(''spx_database:77'')', 'select ingest.resolve_issue(''x'', ''x'')', 'select api.refresh()', 'create table public.hijack (a int)', 'create table ingest.hijack (a int)',
  'create function public.hijack() returns int language sql as ''select 1''', 'grant select on core.game to public', 'alter function ingest.report_results(jsonb) owner to ingest_writer',
  'alter role ingest_writer superuser'];
begin
  foreach stmt in array what loop
    tried := tried + 1;
    begin execute stmt; t := coalesce(t, '') || 'ALLOWED: ' || stmt || '; '; exception when insufficient_privilege then denied := denied + 1; when others then t := coalesce(t, '') || stmt || ' -> ' || sqlstate || '; '; end;
  end loop;
  perform set_config('test.denied', denied::text, true); perform set_config('test.tried', tried::text, true); perform set_config('test.other', coalesce(t, ''), true);
  -- the one thing it may do
  r := ingest.report_results(jsonb_build_array(jsonb_build_object('game_ref', 'WR1', 'league', 'mlb', 'season', 2099, 'phase', 'regular', 'game_date', '2099-06-01', 'home_key', 'spx_database:77',
        'away_key', 'spx_database:62', 'status', 'scheduled', 'source', 'wikipedia')));
  perform set_config('test.writer_call', r ->> 'new', true);
  -- a temp table cannot capture the function's lookups: names are schema-qualified inside it
  create temp table game_observation (a int); create temp table game (a int);
  r := ingest.report_results(jsonb_build_array(jsonb_build_object('game_ref', 'WR1', 'league', 'mlb', 'season', 2099, 'phase', 'regular', 'game_date', '2099-06-01', 'home_key', 'spx_database:77',
        'away_key', 'spx_database:62', 'status', 'in_progress', 'home_score', 1, 'away_score', 0, 'source', 'wikipedia')));
  perform set_config('test.writer_temp', r ->> 'new', true);
end $$;
reset role;
select pg_temp.chk('as ingest_writer: every table, every other function, DDL and privilege escalation is refused (' || current_setting('test.denied') || ' of ' || current_setting('test.tried') || ')',
       current_setting('test.denied') = current_setting('test.tried') and current_setting('test.other') = '', current_setting('test.other'));
select pg_temp.chk('as ingest_writer: report_results works, and a temp table named like a real one changes nothing about it', current_setting('test.writer_call') = '1' and current_setting('test.writer_temp') = '1'
       and (select count(*) from ingest.game_observation where game_ref = 'WR1') = 2);
select pg_temp.chk('anon, authenticated and service_role (when the project has them) hold nothing in ingest',
       not exists (select 1 from pg_roles r where r.rolname in ('anon', 'authenticated', 'service_role') and (has_schema_privilege(r.oid, 'ingest', 'usage') or has_table_privilege(r.oid, 'ingest.game_observation', 'select'))));

-- ---------------------------------------------------------------------------------------------- result
\o
select n, name, detail from _t where not ok order by n;
select case when count(*) filter (where not ok) = 0 then 'RESULT: ALL ' || count(*) || ' CHECKS PASSED' else 'RESULT: FAILED ' || count(*) filter (where not ok) || ' of ' || count(*) end as result from _t;

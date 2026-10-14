-- A few rows shaped like DS1 for the harvest tests. Fake ids; nothing here is real data except the names of clubs.
insert into ref.sport (sport_code, name) values ('basketball', 'Basketball'), ('football', 'Football'), ('hockey', 'Hockey'), ('baseball', 'Baseball');
insert into ref.country (country_code, name) values ('US', 'United States'), ('CA', 'Canada');
insert into ref.league (league_code, sport_code) values ('nba', 'basketball'), ('nfl', 'football'), ('cfl', 'football'), ('nhl', 'hockey'), ('mlb', 'baseball');
insert into meta.source (code, name, kind) values ('wikidata', 'Wikidata', 'dataset'), ('spx_database', 'SPX', 'database_backup');

insert into core.season (league_code, start_year, end_year, label) values
  ('nba', 2023, 2024, '2023-24'), ('nba', 2022, 2023, '2022-23'), ('nfl', 2023, 2023, '2023'), ('nfl', 2022, 2022, '2022'),
  ('cfl', 2023, 2023, '2023'), ('nhl', 2023, 2024, '2023-24'), ('mlb', 2023, 2023, '2023');

insert into core.franchise (sport_code) values ('basketball'), ('basketball'), ('football'), ('football'), ('football'), ('hockey'), ('baseball');
-- 1 Celtics, 2 Hornets (Charlotte), 3 Chiefs, 4 Bills, 5 Argonauts, 6 Canadiens, 7 Athletics (as Sacramento)
insert into core.franchise_identity (franchise_id, valid_during, location, nickname, full_name, country_code) values
  (1, daterange(null, null), 'Boston', 'Celtics', 'Boston Celtics', 'US'),
  (2, daterange(null, null), 'Charlotte', 'Hornets', 'Charlotte Hornets', 'US'),
  (3, daterange(null, null), 'Kansas City', 'Chiefs', 'Kansas City Chiefs', 'US'),
  (4, daterange(null, null), 'Buffalo', 'Bills', 'Buffalo Bills', 'US'),
  (5, daterange(null, null), 'Toronto', 'Argonauts', 'Toronto Argonauts', 'CA'),
  (6, daterange(null, null), 'Montréal', 'Canadiens', 'Montréal Canadiens', 'CA'),
  (7, daterange(null, null), 'Sacramento', 'Athletics', 'Sacramento Athletics', 'US');
insert into core.franchise_league (franchise_id, league_code, valid_during) values
  (1, 'nba', daterange(null, null)), (2, 'nba', daterange(null, null)), (3, 'nfl', daterange(null, null)), (4, 'nfl', daterange(null, null)),
  (5, 'cfl', daterange(null, null)), (6, 'nhl', daterange(null, null)), (7, 'mlb', daterange(null, null));

insert into core.team_season (franchise_id, season_id) select f, s.season_id from (values
  (1, 'nba', 2023), (1, 'nba', 2022), (2, 'nba', 2023), (3, 'nfl', 2023), (4, 'nfl', 2023), (3, 'nfl', 2022), (5, 'cfl', 2023), (6, 'nhl', 2023), (7, 'mlb', 2023)) v(f, l, y)
  join core.season s on s.league_code = v.l and s.start_year = v.y;

create schema legacy_team_brand;
create table legacy_team_brand.team (league_code text not null, qid text not null, label text, inception date, dissolved date, fetched_on date not null, primary key (league_code, qid));
insert into legacy_team_brand.team (league_code, qid, label, fetched_on) values
  ('nba', 'Q131371', 'Boston Celtics', '2026-10-10'), ('nba', 'Q121783', 'Charlotte Hornets', '2026-10-10'), ('nfl', 'Q320146', 'Kansas City Chiefs', '2026-10-10'),
  ('nfl', 'Q221626', 'Buffalo Bills', '2026-10-10'), ('cfl', 'Q1067384', 'Toronto Argonauts', '2026-10-10'), ('nhl', 'Q183144', 'Montreal Canadiens', '2026-10-10');

-- the Canadiens' season has a roster and team statistics already: not a gap
insert into core.person (full_name, birth_date, birth_place, birth_country_code, primary_position) values
  ('Test Player One', '1990-01-01', 'Somewhere', 'CA', 'C'), ('Test Player Two', null, null, null, null), ('Test Player Three', '1991-02-02', 'Elsewhere', 'US', null);
insert into core.roster_stint (person_id, team_season_id, role) select 1, team_season_id, 'player' from core.team_season where franchise_id = 6;
insert into core.team_season_stat (team_season_id, phase, stats, source_id) select team_season_id, 'regular', '{"pim": 1}', 1 from core.team_season where franchise_id = 6;
insert into core.external_id (entity_kind, entity_id, source_id, external_key) values ('person', 1, 1, 'Q1000001'), ('person', 2, 1, 'Q1000002'), ('person', 3, 1, 'Q1000003');

-- one NBA season already has awards, one NFL draft year already has picks
insert into core.award (league_code, code, name, kind) values ('nba', 'nba_mvp', 'MVP', 'person_award');
insert into core.award_winner (award_id, season_id, winner_name, source_id, source_key)
  select 1, season_id, 'Somebody', 1, 'x' from core.season where league_code = 'nba' and start_year = 2022;
insert into core.draft_pick (league_code, draft_year, round, overall_pick, player_name, source_id, source_key) values ('nfl', 2023, 1, 1, 'Somebody', 1, 'x1');

insert into ingest.daily_run (outcome, started_at) values ('ok', now() - interval '1 day');

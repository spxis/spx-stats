-- Hand-made rows for db/tests/game-field.sh: three MLB games of Retrosheet (a regular game, the second game of a doubleheader and a postseason game),
-- one NFL game of nflverse, their Retrosheet batted balls and nflverse drives. Foreign keys are off for these inserts (the games need no clubs here).
set session_replication_role = replica;
insert into meta.source (code, name, kind, licence, attribution, url) values
  ('retrosheet', 'Retrosheet', 'dataset', 'notice', 'Retrosheet', 'https://www.retrosheet.org'),
  ('lahman', 'Lahman', 'dataset', 'CC BY-SA', 'Lahman', 'https://sabr.org'),
  ('nflverse', 'nflverse', 'dataset', 'CC BY 4.0', 'nflverse', 'https://github.com/nflverse'),
  ('spx_database', 'SPX', 'dataset', 'own', 'SPX', 'https://spxn.com');
insert into core.game (game_id, season_id, phase, game_date, home_team_season_id, away_team_season_id, status, home_score, away_score, source_id, source_key) overriding system value values
  (9001, 1, 'regular', '2025-04-06', 1, 2, 'final', 3, 2, (select source_id from meta.source where code = 'retrosheet'), 'retro:20250406:BAL:NYA:0:regular'),
  (9002, 1, 'regular', '2025-04-06', 1, 2, 'final', 3, 2, (select source_id from meta.source where code = 'retrosheet'), 'retro:20250406:BAL:NYA:2:regular'),
  (9003, 1, 'playoffs', '2025-10-01', 1, 2, 'final', 3, 2, (select source_id from meta.source where code = 'retrosheet'), 'retro:20251001:BAL:NYA:0:wildcard'),
  (9004, 1, 'regular', '2025-04-08', 1, 2, 'final', 3, 2, (select source_id from meta.source where code = 'retrosheet'), 'retro:20250408:BAL:NYA:0:regular'),
  (9101, 1, 'regular', '2024-09-08', 1, 2, 'final', 3, 2, (select source_id from meta.source where code = 'nflverse'), 'nflverse:2024_01_CIN_KC'),
  (9102, 1, 'regular', '2024-09-15', 1, 2, 'final', 3, 2, (select source_id from meta.source where code = 'nflverse'), 'nflverse:2024_02_CIN_KC'),
  -- SPX's own games (the seasons SPX holds), which db/build/140 and 150 matched to Retrosheet's and nflverse's: found through core.external_id
  (9005, 1, 'regular', '2005-04-09', 1, 2, 'final', 3, 2, (select source_id from meta.source where code = 'spx_database'), 'spx:2005-04-09:bal:nya'),
  (9103, 1, 'regular', '2005-09-11', 1, 2, 'final', 3, 2, (select source_id from meta.source where code = 'spx_database'), 'spx:2005-09-11:aaa:bbb');
insert into core.external_id (entity_kind, entity_id, source_id, external_key) values
  ('game', 9001, (select source_id from meta.source where code = 'retrosheet'), '20250406:BAL:NYA:0:regular'),
  ('game', 9002, (select source_id from meta.source where code = 'retrosheet'), '20250406:BAL:NYA:2:regular'),
  ('game', 9003, (select source_id from meta.source where code = 'retrosheet'), '20251001:BAL:NYA:0:wildcard'),
  ('game', 9004, (select source_id from meta.source where code = 'retrosheet'), '20250408:BAL:NYA:0:regular'),
  ('game', 9005, (select source_id from meta.source where code = 'retrosheet'), '20050409:BAL:NYA:0:regular'),
  ('game', 9101, (select source_id from meta.source where code = 'nflverse'), '2024_01_CIN_KC'),
  ('game', 9102, (select source_id from meta.source where code = 'nflverse'), '2024_02_CIN_KC'),
  ('game', 9103, (select source_id from meta.source where code = 'nflverse'), '2005_01_AAA_BBB');
-- the batter mcdoo001 is a person through a Retrosheet id; judgi001 only through Lahman's retroID
insert into core.external_id (entity_kind, entity_id, source_id, external_key) values
  ('person', 501, (select source_id from meta.source where code = 'retrosheet'), 'mcdoo001'),
  ('person', 502, (select source_id from meta.source where code = 'lahman'), 'judgeaa01');
create schema if not exists legacy_lahman;
create table if not exists legacy_lahman.people (playerid text, retroid text);
insert into legacy_lahman.people (playerid, retroid) values ('judgeaa01', 'judgi001');

insert into legacy_retrosheet.batted_ball (game_id, seq, season, game_type, inning, half, batter, pitcher, bat_team, fld_team, result, traj, zone, zone_raw, dp) values
  ('BAL202504060', 1, 2025, 'regular', 1, 0, 'mcdoo001', 'p1', 'NYA', 'BAL', 'out', 'F', '8D', null, false),
  ('BAL202504060', 2, 2025, 'regular', 1, 0, 'judgi001', 'p1', 'NYA', 'BAL', 'single', 'L', '78', null, false),
  ('BAL202504060', 3, 2025, 'regular', 1, 1, 'nobody01', 'p2', 'BAL', 'NYA', 'home_run', 'F', '7LD', '7L', false),
  ('BAL202504060', 4, 2025, 'regular', 2, 1, 'mcdoo001', 'p2', 'BAL', 'NYA', 'error', 'G', null, '6X', false),
  ('BAL202504062', 1, 2025, 'regular', 1, 0, 'mcdoo001', 'p1', 'NYA', 'BAL', 'double', 'L', '9LD', null, false),
  ('BAL200504090', 1, 2005, 'regular', 1, 0, 'mcdoo001', 'p1', 'NYA', 'BAL', 'single', 'G', '56', null, false),
  ('XXX202504100', 1, 2025, 'regular', 1, 0, 'mcdoo001', 'p1', 'YYY', 'XXX', 'out', 'G', '6', null, false),
  ('BAL202510010', 1, 2025, 'post', 3, 1, 'judgi001', 'p2', 'BAL', 'NYA', 'fielders_choice', 'BG', '1S', null, false),
  ('ALS202507150', 1, 2025, 'allstar', 1, 0, 'mcdoo001', 'p1', 'ALA', 'NLA', 'out', 'F', '8', null, false);
-- game 9004 (a game core has but Retrosheet has no located ball for) gets no row
insert into legacy_nflverse.pbp_drive (game_id, drive, season, week, season_type, posteam, defteam, posteam_type, qtr, clock, top_secs, plays, first_downs, result, scored, start_yd, end_yd, los) values
  ('2024_01_CIN_KC', 1, 2024, 1, 'REG', 'CIN', 'KC', 'away', 1, '15:00', 259, 10, 2, 'Field goal', true, 70, 4, '70 62 50 49 43 43 6 4 4 4'),
  ('2024_01_CIN_KC', 2, 2024, 1, 'REG', 'KC', 'CIN', 'home', 1, '10:41', 510, 16, 5, 'Touchdown', true, 70, 0, '70 69 58 53 44 35 26 20 12 6 6 3 2 2 2 1'),
  ('2024_01_CIN_KC', 3, 2024, 1, 'REG', 'CIN', 'KC', 'away', 1, '02:11', 103, 3, 0, 'Punt', false, 81, 72, '81 81 75 72'),
  ('2024_01_CIN_KC', 4, 2024, 1, 'REG', 'KC', 'CIN', 'home', 2, '12:00', 60, 3, 0, null, null, 60, 55, '60 58 55'),
  ('2005_01_AAA_BBB', 1, 2005, 1, 'REG', 'AAA', 'BBB', 'away', 1, '15:00', 100, 3, 1, 'Punt', false, 70, 60, '70 65 60'),
  ('2023_01_XXX_YYY', 1, 2023, 1, 'REG', 'XXX', 'YYY', 'away', 1, '15:00', 100, 4, 1, 'Punt', false, 70, 60, '70 65 60');
reset session_replication_role;

-- Hand-made rows for db/tests/player-spray.sh: two MLB seasons, five people (a right-handed batter, a switch hitter, a left-handed pitcher found through Lahman's
-- retroID, a right-handed pitcher, and a batter nobody knows), and Retrosheet batted balls of regular seasons, a postseason and an all-star game. Foreign keys are off.
set session_replication_role = replica;
insert into meta.source (code, name, kind, licence, attribution, url) values
  ('retrosheet', 'Retrosheet', 'dataset', 'notice', 'Retrosheet', 'https://www.retrosheet.org'),
  ('lahman', 'Lahman', 'dataset', 'CC BY-SA', 'Lahman', 'https://sabr.org');
insert into core.season (season_id, league_code, start_year, end_year, label) overriding system value values (7001, 'mlb', 2024, 2024, '2024'), (7002, 'mlb', 2025, 2025, '2025');
insert into core.person (person_id, full_name) overriding system value values (601, 'Right Hitter'), (602, 'Switch Hitter'), (603, 'Left Pitcher'), (604, 'Right Pitcher');
insert into core.external_id (entity_kind, entity_id, source_id, external_key) values
  ('person', 601, (select source_id from meta.source where code = 'retrosheet'), 'righh001'),
  ('person', 602, (select source_id from meta.source where code = 'retrosheet'), 'swith001'),
  ('person', 604, (select source_id from meta.source where code = 'retrosheet'), 'rightp01'),
  ('person', 603, (select source_id from meta.source where code = 'lahman'), 'leftpi01');
create schema if not exists legacy_lahman;
create table if not exists legacy_lahman.people (playerid text, retroid text);
insert into legacy_lahman.people (playerid, retroid) values ('leftpi01', 'leftp001');
insert into legacy_retrosheet.batted_ball (game_id, seq, season, game_type, inning, half, batter, pitcher, bat_team, fld_team, result, traj, zone, zone_raw, bat_hand, pit_hand, dp) values
  ('BAL202504060', 1, 2025, 'regular', 1, 0, 'righh001', 'leftp001', 'NYA', 'BAL', 'single', 'L', '78', null, 'R', 'L', false),
  ('BAL202504060', 2, 2025, 'regular', 1, 0, 'righh001', 'leftp001', 'NYA', 'BAL', 'home_run', 'F', '7LD', '7L', 'R', 'L', false),
  ('BAL202504060', 3, 2025, 'regular', 2, 0, 'righh001', 'rightp01', 'NYA', 'BAL', 'out', 'G', '6', null, 'R', 'R', false),
  ('BAL202504060', 4, 2025, 'regular', 2, 0, 'swith001', 'leftp001', 'NYA', 'BAL', 'double', 'L', '9LD', null, 'R', 'L', false),
  ('BAL202504060', 5, 2025, 'regular', 3, 0, 'swith001', 'rightp01', 'NYA', 'BAL', 'single', 'G', '56', null, 'L', 'R', false),
  ('BAL202504060', 6, 2025, 'regular', 3, 0, 'swith001', 'rightp01', 'NYA', 'BAL', 'out', 'P', '2F', null, 'L', 'R', false),
  ('BAL202504060', 7, 2025, 'regular', 3, 0, 'nobody01', 'rightp01', 'NYA', 'BAL', 'out', 'F', '8', null, 'L', 'R', false),
  ('BAL202504060', 8, 2025, 'regular', 4, 0, 'righh001', 'rightp01', 'NYA', 'BAL', 'out', 'G', null, '6X', 'R', 'R', false),
  ('BAL202504060', 9, 2025, 'regular', 4, 0, 'righh001', 'rightp01', 'NYA', 'BAL', 'single', 'L', '8D', null, 'R', 'R', false),
  ('BAL202410010', 1, 2024, 'regular', 1, 0, 'righh001', 'leftp001', 'NYA', 'BAL', 'triple', 'L', '9D', null, 'R', 'L', false),
  ('BAL202410010', 2, 2024, 'regular', 1, 0, 'swith001', 'leftp001', 'NYA', 'BAL', 'error', 'G', '4', null, 'R', 'L', false),
  ('BAL202410010', 3, 2024, 'regular', 1, 0, 'swith001', 'leftp001', 'NYA', 'BAL', 'fielders_choice', 'BG', '1S', null, 'R', 'L', false),
  ('BAL202510010', 1, 2025, 'post', 3, 1, 'righh001', 'leftp001', 'BAL', 'NYA', 'single', 'L', '78', null, 'R', 'L', false),
  ('ALS202507150', 1, 2025, 'allstar', 1, 0, 'righh001', 'leftp001', 'ALA', 'NLA', 'out', 'F', '8', null, 'R', 'L', false);
insert into legacy_retrosheet.batted_ball_coverage (season, game_type, plays, balls_in_play, with_trajectory, with_zone, located) values
  (2024, 'regular', 10, 5, 5, 5, 3), (2025, 'regular', 20, 10, 10, 10, 8), (2025, 'post', 5, 3, 3, 3, 1);
reset session_replication_role;

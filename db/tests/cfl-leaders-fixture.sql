-- Core rows for db/tests/cfl-leaders.sh: the CFL's 2010 Calgary Stampeders and 1962 BC Lions (named "British Columbia Lions" in core, so the seed alias is used) with the
-- players, roster stints and Wikidata ids each case of db/build/238 needs. No 1959 Montreal Alouettes team season: that article cannot be placed.
insert into meta.source (code, name, kind) values ('wikidata', 'Wikidata', 'dataset') on conflict (code) do nothing;
insert into meta.source (code, name, kind) values ('fixture', 'fixture', 'manual');
insert into ref.country (country_code, name) values ('CA', 'Canada') on conflict do nothing;
insert into ref.sport (sport_code, name) values ('canadian_football', 'Canadian football') on conflict do nothing;
insert into ref.league (league_code, sport_code, country_code) values ('cfl', 'canadian_football', 'CA') on conflict do nothing;
insert into core.season (league_code, start_year, end_year, label) values ('cfl', 2010, 2010, '2010'), ('cfl', 1962, 1962, '1962');
insert into core.franchise (sport_code) select 'canadian_football' from generate_series(1, 2);
insert into core.franchise_league (franchise_id, league_code, valid_during)
  select franchise_id, 'cfl', daterange('1950-01-01', null) from core.franchise;
insert into core.franchise_identity (franchise_id, valid_during, location, nickname, full_name, country_code)
  select franchise_id, daterange('1950-01-01', null), case when franchise_id = (select min(franchise_id) from core.franchise) then 'Calgary' else 'British Columbia' end,
         case when franchise_id = (select min(franchise_id) from core.franchise) then 'Stampeders' else 'Lions' end,
         case when franchise_id = (select min(franchise_id) from core.franchise) then 'Calgary Stampeders' else 'British Columbia Lions' end, 'CA'
  from core.franchise;
insert into core.team_season (franchise_id, season_id, franchise_identity_id)
  select i.franchise_id, s.season_id, i.franchise_identity_id from core.franchise_identity i join core.season s
  on (i.full_name = 'Calgary Stampeders' and s.start_year = 2010) or (i.full_name = 'British Columbia Lions' and s.start_year = 1962);
-- a second Calgary season, where Jesse Lumsden is on the roster (not the 2010 one)
insert into core.season (league_code, start_year, end_year, label) values ('cfl', 2009, 2009, '2009');
insert into core.team_season (franchise_id, season_id, franchise_identity_id)
  select i.franchise_id, s.season_id, i.franchise_identity_id from core.franchise_identity i, core.season s where i.full_name = 'Calgary Stampeders' and s.start_year = 2009;

create temp table p (name text, born date, died date, qid text, club_year int);
insert into p values
  ('Henry Burris',      '1974-11-17', null, 'Q101', 2010),   -- linked, Q101 is his
  ('Drew Tate',         '1985-05-01', null, null,   2010),   -- plain text, one on the roster
  ('Joffrey Reynolds',  '1980-01-01', null, 'Q102', 2010),   -- linked, Q102
  ('Jon Cornish',       '1985-01-01', null, null,   2010),   -- plain text, two of that name on the roster
  ('Jon Cornish',       '1960-01-01', null, null,   2010),
  ('Jesse Lumsden',     '1982-01-01', null, null,   2009),   -- plain text, on the roster of 2009 only
  ('Nik Lewis',         '1982-01-01', null, null,   2010),   -- linked to an item core does not hold: the roster has him, with no id
  ('Ken-Yon Rambo',     '2001-01-01', null, 'Q106', null),   -- linked, Q106, but born after the season less 14: refused
  ('Arjei Franklin',    '1987-01-01', null, 'Q107', 2010),   -- link is a disambiguation page: the roster decides
  ('Deon Murphy',       '1985-01-01', null, 'Q999', 2010),   -- link names Q108, the roster's Deon Murphy is Q999: refused
  ('Rob Cote',          '1984-01-01', null, 'Q111', null),   -- Q110 was merged into Q111: linked
  ('Willie Fleming',    '1935-01-01', null, 'Q120', null),   -- 1962 BC Lions, linked
  ('Nub Beamer',        '1938-01-01', null, null,   null);   -- 1962 BC Lions, plain text and on no roster
insert into core.person (full_name, birth_date, death_date) select name, born, died from p;
create temp table pp as select row_number() over () as n, name, qid, club_year from p;
create temp table ids as select pe.person_id, pp.* from pp join (select person_id, row_number() over (order by person_id) n from core.person) pe using (n);
insert into core.external_id (entity_kind, entity_id, source_id, external_key)
  select 'person', person_id, (select source_id from meta.source where code = 'wikidata'), qid from ids where qid is not null;
insert into core.roster_stint (person_id, team_season_id, role, source_id)
  select i.person_id, ts.team_season_id, 'player', (select source_id from meta.source where code = 'fixture')
  from ids i join core.season s on s.start_year = i.club_year and s.league_code = 'cfl' join core.team_season ts on ts.season_id = s.season_id
  join core.franchise_identity fi on fi.franchise_identity_id = ts.franchise_identity_id and fi.full_name = 'Calgary Stampeders';
insert into legacy_rosters.redirect (from_qid, to_qid) values ('Q110', 'Q111');

-- Minimal schema + 2002/2003 WNBA relocation rows for scripts/wnba/test_scratch.sh.
-- Not applied to DS1. Team season ids 180788 / 180720 match the withdrawn 052 rows.
create extension if not exists btree_gist;
create schema if not exists meta;
create schema if not exists ref;
create schema if not exists core;
create schema if not exists api;
create schema if not exists legacy_spx;
create schema if not exists legacy_nhlapi;
create schema if not exists legacy_retrosheet;
create schema if not exists legacy_alignment;
create schema if not exists legacy_wikipedia_cfl;
create schema if not exists legacy_wikipedia_nba;
create schema if not exists legacy_wikipedia_nfl;
create schema if not exists legacy_wikipedia_afl;
create schema if not exists legacy_wikipedia_aafc;
create schema if not exists legacy_wikipedia_hockey;
create schema if not exists legacy_wikipedia_wnba;
create schema if not exists legacy_nflverse;

create table meta.source (
  source_id smallint generated always as identity primary key,
  code text not null unique,
  name text not null,
  kind text not null
);
create table meta.data_issue (
  data_issue_id bigint generated always as identity primary key,
  source_id smallint references meta.source,
  entity_kind text not null,
  entity_key text not null,
  issue text not null,
  resolution text,
  found_at timestamptz not null default now(),
  resolved_at timestamptz
);
create type meta.verification_status as enum ('confirmed', 'disputed', 'not_found');
create table meta.verification (
  verification_id bigint generated always as identity primary key,
  entity_kind text not null,
  entity_id bigint not null,
  field text not null default '*',
  status meta.verification_status not null,
  source_id smallint not null references meta.source,
  evidence_url text,
  their_value text,
  checked_at timestamptz not null default now()
);
create table ref.country (country_code text primary key, name text not null);
create table ref.sport (sport_code text primary key, name text not null);
create table ref.league (
  league_code text primary key,
  sport_code text not null references ref.sport,
  country_code text references ref.country,
  founded_on date,
  dissolved_on date
);
create type core.season_phase as enum ('preseason', 'regular', 'playoffs', 'all_star', 'exhibition', 'tournament');
create type core.game_status as enum ('scheduled', 'in_progress', 'final', 'postponed', 'suspended', 'cancelled', 'forfeit');
create table core.season (
  season_id integer generated always as identity primary key,
  league_code text not null references ref.league,
  start_year smallint not null,
  end_year smallint not null,
  label text not null,
  unique (league_code, start_year)
);
create table core.conference (
  conference_id integer generated always as identity primary key,
  league_code text not null references ref.league,
  name text not null,
  short_name text,
  first_season smallint not null,
  last_season smallint
);
create table core.division (
  division_id integer generated always as identity primary key,
  league_code text not null references ref.league,
  conference_id integer references core.conference,
  name text not null,
  short_name text,
  first_season smallint not null,
  last_season smallint
);
create table core.franchise (
  franchise_id integer generated always as identity primary key,
  sport_code text not null references ref.sport
);
create table core.franchise_league (
  franchise_id integer not null references core.franchise,
  league_code text not null references ref.league,
  valid_during daterange not null,
  source_id smallint references meta.source,
  primary key (franchise_id, valid_during)
);
create table core.franchise_identity (
  franchise_identity_id integer generated always as identity primary key,
  franchise_id integer not null references core.franchise,
  valid_during daterange not null,
  location text not null,
  nickname text not null,
  full_name text not null,
  abbreviation text,
  country_code text not null references ref.country,
  source_id smallint references meta.source
);
create table core.team_season (
  team_season_id integer generated always as identity primary key,
  franchise_id integer not null references core.franchise,
  season_id integer not null references core.season,
  franchise_identity_id integer references core.franchise_identity,
  conference_id integer references core.conference,
  division_id integer references core.division,
  source_id smallint references meta.source,
  unique (franchise_id, season_id)
);
create table core.person (person_id bigint generated always as identity primary key);
create type core.award_kind as enum ('championship', 'team_award', 'person_award');
create table core.award (
  award_id integer generated always as identity primary key,
  league_code text not null references ref.league,
  code text not null unique,
  name text not null,
  kind core.award_kind not null
);
create table core.award_winner (
  award_winner_id bigint generated always as identity primary key,
  award_id integer not null references core.award,
  season_id integer not null references core.season,
  team_season_id integer references core.team_season,
  person_id bigint references core.person,
  winner_name text not null,
  note text,
  source_id smallint not null references meta.source,
  source_key text not null,
  unique (award_id, season_id, winner_name, source_id)
);
create table core.game (
  game_id bigint generated always as identity primary key,
  season_id integer not null references core.season,
  phase core.season_phase not null,
  game_date date not null,
  home_team_season_id integer not null references core.team_season,
  away_team_season_id integer not null references core.team_season,
  status core.game_status not null,
  home_score smallint,
  away_score smallint,
  source_id smallint not null references meta.source,
  source_key text not null,
  unique (source_id, source_key)
);
create table core.standing (
  team_season_id integer not null references core.team_season,
  phase core.season_phase not null default 'regular',
  as_of date not null,
  source_id smallint not null references meta.source,
  primary key (team_season_id, phase, as_of, source_id)
);
create table core.standing_from_games (
  team_season_id integer not null,
  phase core.season_phase not null
);
create table core.external_id (
  entity_kind text not null,
  entity_id bigint not null,
  source_id smallint not null references meta.source,
  external_key text not null,
  primary key (source_id, entity_kind, external_key)
);
create table core.franchise_brand (
  franchise_brand_id integer generated always as identity primary key,
  franchise_id integer not null references core.franchise,
  valid_during daterange not null default daterange(null, null),
  primary_hex text,
  secondary_hex text,
  logo_url text,
  logo_licence text,
  logo_page text,
  home_venue text,
  latitude numeric,
  source_id smallint not null references meta.source,
  source_key text not null,
  unique (franchise_id, valid_during, source_id)
);
create or replace function core.logo_file(url text) returns text language sql immutable parallel safe as $$
  select m[1] || ':' || m[2] from regexp_match(url, '/wikipedia/([^/]+)/(?:thumb/)?[0-9a-f]/[0-9a-f]{2}/([^/?]+)') m
$$;
create table core.logo_fit (
  logo_file text primary key,
  league_code text,
  team text not null,
  wordmark boolean not null default false,
  mark_url text,
  mark_licence text,
  mark_page text,
  scale numeric(4,2) not null default 1,
  dx numeric(5,1) not null default 0,
  dy numeric(5,1) not null default 0,
  bg text not null default 'auto',
  status text not null default 'proposed',
  note text
);

create table legacy_spx.xref_team_conference_division_seasons (
  team_id int, season_start_year int, conference_id int, division_id int
);
create table legacy_spx.lk_sport_conferences (conference_id int, conference_name text);
create table legacy_spx.lk_sport_divisions (division_id int, division_name text);
create table legacy_spx.xref_sport_team_divisions (team_id int, division_id int);
create table legacy_nhlapi.standing (season text, team_abbrev text, row jsonb);
create table legacy_retrosheet.game_log (
  game_date date, home text, home_league text, visitor text, visitor_league text
);
create table legacy_alignment.wikipedia_template (
  league_code text not null, season smallint not null, article text not null,
  template text not null, kind text not null, grp text not null, parent_grp text, fetched_on date not null,
  primary key (league_code, season, template)
);
create table legacy_alignment.wikipedia_team (
  league_code text not null, season smallint not null, template text not null,
  position smallint not null, team_name text not null,
  primary key (league_code, season, template, position)
);
create table legacy_wikipedia_cfl.standing (season int, division text, team text);
create table legacy_wikipedia_nba.standing (season int, division text, team text);
create table legacy_wikipedia_nfl.standing (season int, division text, team text);
create table legacy_wikipedia_afl.standing (season int, division text, team text);
create table legacy_wikipedia_aafc.standing (season int, division text, team text);
create table legacy_wikipedia_hockey.standing (league text, season int, division text, team text);
create table legacy_wikipedia_wnba.standing (
  season int not null, team text not null, division text not null, src text not null default 'scratch'
);
create table legacy_nflverse.game (
  home_team text, away_team text, season int, game_type text, row jsonb
);

insert into meta.source (code, name, kind) values
  ('wikipedia', 'Wikipedia', 'website'),
  ('nhl_api', 'NHL API', 'api'),
  ('spx_database', 'SPX', 'database_backup'),
  ('retrosheet', 'Retrosheet', 'dataset'),
  ('nflverse', 'nflverse', 'dataset'),
  ('spx_stats_derived', 'derived', 'manual'),
  ('wikidata', 'Wikidata', 'website');
insert into ref.country values ('US', 'United States'), ('CA', 'Canada');
insert into ref.sport values ('basketball', 'Basketball'), ('hockey', 'Hockey');
insert into ref.league (league_code, sport_code, country_code, founded_on) values
  ('wnba', 'basketball', 'US', date '1996-04-24'),
  ('nhl', 'hockey', 'CA', date '1917-11-26');

insert into core.franchise (franchise_id, sport_code) overriding system value values
  (1800, 'basketball'), (1798, 'basketball'), (10, 'basketball'), (11, 'basketball'),
  (1, 'hockey'), (2, 'hockey');
insert into core.season (league_code, start_year, end_year, label) values
  ('wnba', 2002, 2002, '2002'), ('wnba', 2003, 2003, '2003'), ('nhl', 2024, 2025, '2024-25');

insert into core.franchise_league (franchise_id, league_code, valid_during, source_id)
select franchise_id, case when sport_code = 'hockey' then 'nhl' else 'wnba' end,
       daterange(null, null), (select source_id from meta.source where code = 'wikipedia')
from core.franchise;
insert into core.franchise_identity (franchise_id, valid_during, location, nickname, full_name, abbreviation, country_code, source_id)
values
  (1800, daterange(date '1997-03-01', date '2002-03-01'), 'Utah', 'Starzz', 'Utah Starzz', 'UTA', 'US',
   (select source_id from meta.source where code = 'wikipedia')),
  (1800, daterange(date '2003-03-01', date '2014-03-01'), 'San Antonio', 'Silver Stars', 'San Antonio Silver Stars', 'SAS', 'US',
   (select source_id from meta.source where code = 'wikipedia')),
  (1798, daterange(date '2002-03-01', date '2003-03-01'), 'Orlando', 'Miracle', 'Orlando Miracle', 'ORL', 'US',
   (select source_id from meta.source where code = 'wikipedia')),
  (1798, daterange(date '2006-03-01', date '2027-03-01'), 'Connecticut', 'Sun', 'Connecticut Sun', 'CON', 'US',
   (select source_id from meta.source where code = 'wikipedia')),
  (10, daterange(date '1997-03-01', null), 'Los Angeles', 'Sparks', 'Los Angeles Sparks', 'LAS', 'US',
   (select source_id from meta.source where code = 'wikipedia')),
  (11, daterange(date '1997-03-01', null), 'New York', 'Liberty', 'New York Liberty', 'NYL', 'US',
   (select source_id from meta.source where code = 'wikipedia')),
  (1, daterange(date '1917-03-01', null), 'Toronto', 'Maple Leafs', 'Toronto Maple Leafs', 'TOR', 'CA',
   (select source_id from meta.source where code = 'wikipedia')),
  (2, daterange(date '1924-03-01', null), 'Boston', 'Bruins', 'Boston Bruins', 'BOS', 'CA',
   (select source_id from meta.source where code = 'wikipedia'));

insert into core.team_season (team_season_id, franchise_id, season_id, franchise_identity_id, source_id)
overriding system value
select 180788, 1800, s.season_id, null, (select source_id from meta.source where code = 'wikipedia')
from core.season s where s.league_code = 'wnba' and s.start_year = 2002;
insert into core.team_season (team_season_id, franchise_id, season_id, franchise_identity_id, source_id)
overriding system value
select 180720, 1798, s.season_id, null, (select source_id from meta.source where code = 'wikipedia')
from core.season s where s.league_code = 'wnba' and s.start_year = 2003;

insert into core.team_season (franchise_id, season_id, franchise_identity_id, source_id)
select i.franchise_id, s.season_id, i.franchise_identity_id, i.source_id
from core.franchise_identity i
join core.season s on s.league_code = 'wnba' and s.start_year in (2002, 2003)
where i.franchise_id in (10, 11)
  and i.valid_during @> make_date(s.start_year, 7, 1);
insert into core.team_season (franchise_id, season_id, franchise_identity_id, source_id)
select 1798, s.season_id, i.franchise_identity_id, i.source_id
from core.season s
join core.franchise_identity i on i.franchise_id = 1798 and i.full_name = 'Orlando Miracle'
where s.league_code = 'wnba' and s.start_year = 2002;
insert into core.team_season (franchise_id, season_id, franchise_identity_id, source_id)
select 1800, s.season_id, i.franchise_identity_id, i.source_id
from core.season s
join core.franchise_identity i on i.franchise_id = 1800 and i.full_name = 'San Antonio Silver Stars'
where s.league_code = 'wnba' and s.start_year = 2003;
insert into core.team_season (franchise_id, season_id, franchise_identity_id, source_id)
select i.franchise_id, s.season_id, i.franchise_identity_id, i.source_id
from core.franchise_identity i
join core.season s on s.league_code = 'nhl' and s.start_year = 2024
where i.franchise_id in (1, 2);

insert into legacy_wikipedia_wnba.standing (season, team, division) values
  (2002, 'Utah Starzz', '2002 WNBA Western Conference standings'),
  (2002, 'Los Angeles Sparks', '2002 WNBA Western Conference standings'),
  (2002, 'New York Liberty', '2002 WNBA Eastern Conference standings'),
  (2002, 'Orlando Miracle', '2002 WNBA Eastern Conference standings'),
  (2003, 'Connecticut Sun', '2003 WNBA Eastern Conference standings'),
  (2003, 'New York Liberty', '2003 WNBA Eastern Conference standings'),
  (2003, 'San Antonio Silver Stars', '2003 WNBA Western Conference standings'),
  (2003, 'Los Angeles Sparks', '2003 WNBA Western Conference standings');

insert into legacy_nhlapi.standing (season, team_abbrev, row) values
  ('20242025', 'TOR', jsonb_build_object('conferenceName', 'Eastern', 'divisionName', 'Atlantic')),
  ('20242025', 'BOS', jsonb_build_object('conferenceName', 'Eastern', 'divisionName', 'Atlantic'));
insert into legacy_alignment.wikipedia_template
  (league_code, season, article, template, kind, grp, parent_grp, fetched_on) values
  ('nhl', 2024, '2024-25 NHL season', '2024-25 NHL Eastern Conference standings', 'conference', 'Eastern', null, date '2026-10-16');
insert into legacy_alignment.wikipedia_team (league_code, season, template, position, team_name) values
  ('nhl', 2024, '2024-25 NHL Eastern Conference standings', 1, 'Toronto Maple Leafs'),
  ('nhl', 2024, '2024-25 NHL Eastern Conference standings', 2, 'Boston Bruins');

insert into core.award (league_code, code, name, kind) values
  ('nhl', 'nhl_stanley_cup', 'Stanley Cup', 'championship');
insert into core.game (season_id, phase, game_date, home_team_season_id, away_team_season_id, status, home_score, away_score, source_id, source_key)
select s.season_id, 'playoffs', date '2025-06-17',
       (select t.team_season_id from core.team_season t join core.season x using (season_id) where t.franchise_id = 1 and x.start_year = 2024),
       (select t.team_season_id from core.team_season t join core.season x using (season_id) where t.franchise_id = 2 and x.start_year = 2024),
       'final', 2, 1, (select source_id from meta.source where code = 'wikipedia'), 'nhl-final-2024'
from core.season s where s.league_code = 'nhl' and s.start_year = 2024;

insert into core.franchise_brand (franchise_id, valid_during, logo_url, source_id, source_key)
values (1, daterange(null, null),
        'https://upload.wikimedia.org/wikipedia/en/6/69/Toronto_Maple_Leafs_logo.svg',
        (select source_id from meta.source where code = 'wikidata'), 'scratch-leafs');

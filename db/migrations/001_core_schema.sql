-- spx-stats core schema, v1.
-- History is first-class: anything that can change over time (a franchise's
-- name, city, country, league, owner, venue, a division's name, a venue's
-- name) is a row with the dates it applied, and overlaps are refused by
-- exclusion constraints rather than by convention.
-- Every fact records where it came from (meta.source) so a value is never
-- separated from its provenance.

create extension if not exists btree_gist with schema extensions;

create schema if not exists meta;
create schema if not exists ref;
create schema if not exists core;

comment on schema meta is 'Provenance: sources, load runs and data issues.';
comment on schema ref  is 'Slow-moving reference data: countries, sports, leagues.';
comment on schema core is 'The clean, merged history of every league.';

-- ---------------------------------------------------------------- meta

create table meta.source (
  source_id     smallint generated always as identity primary key,
  code          text not null unique check (code ~ '^[a-z0-9_]+$'),
  name          text not null,
  kind          text not null check (kind in
                  ('database_backup', 'file_archive', 'website', 'api', 'dataset', 'manual')),
  licence       text,
  attribution   text,
  url           text,
  covers_from   date,
  covers_to     date,
  retrieved_on  date,
  notes         text,
  created_at    timestamptz not null default now()
);
comment on table meta.source is 'Every place a fact came from: an SPX backup, Retrosheet, Wikidata, a person.';

create table meta.load_run (
  load_run_id  bigint generated always as identity primary key,
  source_id    smallint not null references meta.source,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  rows_loaded  bigint,
  notes        text
);

create table meta.data_issue (
  data_issue_id  bigint generated always as identity primary key,
  source_id      smallint references meta.source,
  entity_kind    text not null,
  entity_key     text not null,
  issue          text not null,
  resolution     text,
  found_at       timestamptz not null default now(),
  resolved_at    timestamptz
);
comment on table meta.data_issue is 'Problems found in source data and how each was resolved; nothing is silently corrected.';

-- ---------------------------------------------------------------- ref

create table ref.country (
  country_code  text primary key check (country_code ~ '^[A-Z]{2}$'),
  name          text not null
);
comment on table ref.country is 'ISO 3166-1 alpha-2 countries.';

create table ref.sport (
  sport_code  text primary key check (sport_code ~ '^[a-z_]+$'),
  name        text not null
);

create table ref.league (
  league_code    text primary key check (league_code ~ '^[a-z0-9_]+$'),
  sport_code     text not null references ref.sport,
  country_code   text references ref.country,
  founded_on     date,
  dissolved_on   date,
  notes          text,
  check (dissolved_on is null or founded_on is null or dissolved_on >= founded_on)
);

create table ref.league_name (
  league_code   text not null references ref.league on delete cascade,
  valid_during  daterange not null,
  name          text not null,
  short_name    text not null,
  primary key (league_code, valid_during),
  exclude using gist (league_code with =, valid_during with &&)
);
comment on table ref.league_name is 'A league''s names over time (AAFC, NFL; WHA; Big Four to CFL).';

-- ---------------------------------------------------------------- seasons and alignment

create type core.season_phase as enum
  ('preseason', 'regular', 'playoffs', 'all_star', 'exhibition', 'tournament');
create type core.game_status as enum
  ('scheduled', 'in_progress', 'final', 'postponed', 'suspended', 'cancelled', 'forfeit');

create table core.season (
  season_id            integer generated always as identity primary key,
  league_code          text not null references ref.league,
  start_year           smallint not null,
  end_year             smallint not null,
  label                text not null,
  regular_starts_on    date,
  regular_ends_on      date,
  playoffs_end_on      date,
  games_per_team       smallint check (games_per_team > 0),
  notes                text,
  unique (league_code, start_year),
  check (end_year between start_year and start_year + 1)
);
comment on column core.season.games_per_team is 'Scheduled regular-season games per team; what gap reports compare against.';

create table core.conference (
  conference_id  integer generated always as identity primary key,
  league_code    text not null references ref.league,
  name           text not null,
  short_name     text,
  first_season   smallint not null,
  last_season    smallint,
  check (last_season is null or last_season >= first_season)
);

create table core.division (
  division_id    integer generated always as identity primary key,
  league_code    text not null references ref.league,
  conference_id  integer references core.conference,
  name           text not null,
  short_name     text,
  first_season   smallint not null,
  last_season    smallint,
  check (last_season is null or last_season >= first_season)
);

-- ---------------------------------------------------------------- venues

create table core.venue (
  venue_id      integer generated always as identity primary key,
  city          text not null,
  region        text,
  country_code  text not null references ref.country,
  opened_on     date,
  closed_on     date,
  capacity      integer check (capacity > 0),
  latitude      numeric(9, 6) check (latitude between -90 and 90),
  longitude     numeric(9, 6) check (longitude between -180 and 180),
  source_id     smallint references meta.source,
  notes         text
);

create table core.venue_name (
  venue_id      integer not null references core.venue on delete cascade,
  valid_during  daterange not null,
  name          text not null,
  primary key (venue_id, valid_during),
  exclude using gist (venue_id with =, valid_during with &&)
);
comment on table core.venue_name is 'Venue names over time: GM Place, then Rogers Arena.';

-- ---------------------------------------------------------------- franchises

create table core.franchise (
  franchise_id  integer generated always as identity primary key,
  sport_code    text not null references ref.sport,
  founded_on    date,
  folded_on     date,
  notes         text,
  source_id     smallint references meta.source,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (folded_on is null or founded_on is null or folded_on >= founded_on)
);
comment on table core.franchise is 'One club through every move, rename, sale and league change.';

create table core.franchise_identity (
  franchise_identity_id  integer generated always as identity primary key,
  franchise_id           integer not null references core.franchise on delete cascade,
  valid_during           daterange not null,
  location               text not null,
  nickname               text not null,
  full_name              text not null,
  abbreviation           text,
  region                 text,
  country_code           text not null references ref.country,
  source_id              smallint references meta.source,
  exclude using gist (franchise_id with =, valid_during with &&)
);
comment on table core.franchise_identity is 'Name, city and country over time: Montreal Expos (CA) to Washington Nationals (US).';

create table core.franchise_league (
  franchise_id  integer not null references core.franchise on delete cascade,
  league_code   text not null references ref.league,
  valid_during  daterange not null,
  source_id     smallint references meta.source,
  primary key (franchise_id, valid_during),
  exclude using gist (franchise_id with =, valid_during with &&)
);
comment on table core.franchise_league is 'League membership over time: WHA to NHL, ABA to NBA, AFL to NFL.';

create table core.franchise_owner (
  franchise_owner_id  integer generated always as identity primary key,
  franchise_id        integer not null references core.franchise on delete cascade,
  owner_name          text not null,
  valid_during        daterange not null,
  share_note          text,
  source_id           smallint references meta.source
);
comment on table core.franchise_owner is 'Owners over time; overlaps allowed for joint ownership.';

create table core.franchise_venue (
  franchise_id  integer not null references core.franchise on delete cascade,
  venue_id      integer not null references core.venue,
  valid_during  daterange not null,
  source_id     smallint references meta.source,
  primary key (franchise_id, valid_during),
  exclude using gist (franchise_id with =, valid_during with &&)
);

create table core.team_season (
  team_season_id         integer generated always as identity primary key,
  franchise_id           integer not null references core.franchise,
  season_id              integer not null references core.season,
  franchise_identity_id  integer references core.franchise_identity,
  conference_id          integer references core.conference,
  division_id            integer references core.division,
  home_venue_id          integer references core.venue,
  source_id              smallint references meta.source,
  unique (franchise_id, season_id)
);
comment on table core.team_season is 'A franchise in one season, under the name, alignment and venue of that season.';

-- ---------------------------------------------------------------- games and lines

create table core.game (
  game_id               bigint generated always as identity primary key,
  season_id             integer not null references core.season,
  phase                 core.season_phase not null,
  game_date             date not null,
  starts_at             timestamptz,
  home_team_season_id   integer not null references core.team_season,
  away_team_season_id   integer not null references core.team_season,
  venue_id              integer references core.venue,
  is_neutral_site       boolean not null default false,
  status                core.game_status not null,
  home_score            smallint check (home_score >= 0),
  away_score            smallint check (away_score >= 0),
  went_to_overtime      boolean,
  decided_by_shootout   boolean,
  original_date         date,
  broadcaster           text,
  notes                 text,
  source_id             smallint not null references meta.source,
  source_key            text not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (source_id, source_key),
  check (home_team_season_id <> away_team_season_id),
  check (status <> 'final' or (home_score is not null and away_score is not null))
);
create index game_season_date_idx on core.game (season_id, game_date);
create index game_home_idx on core.game (home_team_season_id);
create index game_away_idx on core.game (away_team_season_id);

create table core.game_period_score (
  game_id  bigint not null references core.game on delete cascade,
  period   smallint not null check (period > 0),
  home     smallint check (home >= 0),
  away     smallint check (away >= 0),
  primary key (game_id, period)
);

create table core.betting_line (
  betting_line_id     bigint generated always as identity primary key,
  game_id             bigint not null references core.game on delete cascade,
  source_id           smallint not null references meta.source,
  source_key          text not null,
  set_by              text,
  offered_during      tsrange,
  favourite           text check (favourite in ('home', 'away')),
  point_spread        numeric(5, 1) check (point_spread >= 0),
  favourite_money_line integer,
  total               numeric(5, 1) check (total >= 0),
  total_kind          text,
  total_price         integer,
  recorded_at         timestamp,
  unique (source_id, source_key)
);
comment on table core.betting_line is 'A line as its source stated it: the favourite, the points it gave, its money line and the total. Never derived.';

-- ---------------------------------------------------------------- people

create table core.person (
  person_id           bigint generated always as identity primary key,
  full_name           text not null,
  given_name          text,
  family_name         text,
  birth_date          date,
  birth_place         text,
  birth_country_code  text references ref.country,
  death_date          date,
  height_cm           smallint check (height_cm > 0),
  handedness          text,
  source_id           smallint references meta.source,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table core.person_name (
  person_id     bigint not null references core.person on delete cascade,
  valid_during  daterange not null,
  full_name     text not null,
  primary key (person_id, valid_during),
  exclude using gist (person_id with =, valid_during with &&)
);
comment on table core.person_name is 'Names over time: Ron Artest, then Metta World Peace.';

create table core.roster_stint (
  roster_stint_id  bigint generated always as identity primary key,
  person_id        bigint not null references core.person,
  team_season_id   integer not null references core.team_season,
  role             text not null default 'player' check (role in ('player', 'head_coach', 'coach', 'manager', 'general_manager')),
  position         text,
  jersey_number    smallint check (jersey_number between 0 and 99),
  valid_during     daterange,
  weight_kg        smallint check (weight_kg > 0),
  source_id        smallint references meta.source
);
create index roster_stint_person_idx on core.roster_stint (person_id);
create index roster_stint_team_idx on core.roster_stint (team_season_id);

create table core.player_season_stat (
  person_id       bigint not null references core.person,
  team_season_id  integer not null references core.team_season,
  phase           core.season_phase not null,
  stat_group      text not null,
  stats           jsonb not null check (jsonb_typeof(stats) = 'object'),
  source_id       smallint not null references meta.source,
  primary key (person_id, team_season_id, phase, stat_group, source_id)
);
comment on column core.player_season_stat.stats is 'The categories that sport and era kept; a category not kept is absent, never zero.';

create table core.player_game_stat (
  person_id    bigint not null references core.person,
  game_id      bigint not null references core.game on delete cascade,
  stat_group   text not null,
  stats        jsonb not null check (jsonb_typeof(stats) = 'object'),
  source_id    smallint not null references meta.source,
  primary key (person_id, game_id, stat_group, source_id)
);

create table core.injury_report (
  injury_report_id  bigint generated always as identity primary key,
  person_id         bigint not null references core.person,
  team_season_id    integer references core.team_season,
  reported_on       date not null,
  status            text,
  body_part         text,
  description       text,
  expected_return   text,
  source_id         smallint not null references meta.source,
  source_key        text
);

-- ---------------------------------------------------------------- identifiers

create table core.external_id (
  entity_kind   text not null check (entity_kind in
                  ('franchise', 'team_season', 'venue', 'person', 'game', 'season')),
  entity_id     bigint not null,
  source_id     smallint not null references meta.source,
  external_key  text not null,
  primary key (source_id, entity_kind, external_key)
);
create index external_id_entity_idx on core.external_id (entity_kind, entity_id);
comment on table core.external_id is 'Each entity''s ID in every other system: SPX, ESPN, Retrosheet, Lahman, Wikidata, the leagues.';

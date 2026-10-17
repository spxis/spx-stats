-- Minimal core for scratch-testing jersey matching. Not for DS1 or production.
-- No gist excludes. Enough for db/migrations/130 and db/build/220.

create extension if not exists btree_gist;

create schema if not exists meta;
create schema if not exists ref;
create schema if not exists core;
create schema if not exists api;

create table if not exists meta.source (
  source_id     smallint generated always as identity primary key,
  code          text not null unique,
  name          text not null,
  kind          text not null,
  licence       text,
  attribution   text,
  url           text,
  covers_from   date,
  covers_to     date,
  retrieved_on  date,
  notes         text,
  created_at    timestamptz not null default now()
);
create table if not exists meta.data_issue (
  data_issue_id  bigint generated always as identity primary key,
  source_id      smallint references meta.source,
  entity_kind    text not null,
  entity_key     text not null,
  issue          text not null,
  resolution     text,
  found_at       timestamptz not null default now(),
  resolved_at    timestamptz
);

create table if not exists ref.country (
  country_code text primary key,
  name text not null
);
create table if not exists ref.sport (
  sport_code text primary key,
  name text not null
);
create table if not exists ref.league (
  league_code text primary key,
  sport_code text not null references ref.sport,
  country_code text references ref.country,
  founded_on date,
  dissolved_on date,
  notes text
);

create table if not exists core.franchise (
  franchise_id integer primary key,
  sport_code text not null references ref.sport,
  founded_on date,
  folded_on date,
  notes text,
  source_id smallint references meta.source,
  source_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists core.franchise_identity (
  franchise_identity_id integer generated always as identity primary key,
  franchise_id integer not null references core.franchise,
  valid_during daterange not null default daterange('1900-01-01', null),
  location text not null default '',
  nickname text not null default '',
  full_name text not null,
  abbreviation text,
  region text,
  country_code text not null references ref.country,
  source_id smallint references meta.source
);
create table if not exists core.franchise_league (
  franchise_id integer not null references core.franchise,
  league_code text not null references ref.league,
  valid_during daterange not null default daterange('1900-01-01', null),
  source_id smallint references meta.source,
  primary key (franchise_id, league_code)
);

create table if not exists core.person (
  person_id bigint primary key,
  full_name text not null,
  given_name text,
  family_name text,
  birth_date date,
  birth_place text,
  birth_country_code text,
  death_date date,
  height_cm smallint,
  handedness text,
  source_id smallint references meta.source,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists core.external_id (
  entity_kind text not null,
  entity_id bigint not null,
  source_id smallint not null references meta.source,
  external_key text not null,
  primary key (source_id, entity_kind, external_key)
);

create table if not exists core.season (
  season_id integer generated always as identity primary key,
  league_code text not null references ref.league,
  start_year smallint not null,
  end_year smallint not null,
  label text not null,
  unique (league_code, start_year)
);
create table if not exists core.team_season (
  team_season_id integer generated always as identity primary key,
  franchise_id integer not null references core.franchise,
  season_id integer not null references core.season,
  unique (franchise_id, season_id)
);
create table if not exists core.roster_stint (
  roster_stint_id bigint generated always as identity primary key,
  person_id bigint not null references core.person,
  team_season_id integer not null references core.team_season,
  role text not null default 'player',
  jersey_number smallint,
  source_id smallint not null references meta.source,
  source_key text
);

insert into ref.country (country_code, name) values ('US', 'United States'), ('CA', 'Canada')
on conflict do nothing;
insert into ref.sport (sport_code, name) values
  ('ice_hockey', 'Ice hockey'), ('basketball', 'Basketball'),
  ('baseball', 'Baseball'), ('american_football', 'American football'),
  ('canadian_football', 'Canadian football')
on conflict do nothing;
insert into ref.league (league_code, sport_code, country_code) values
  ('nhl', 'ice_hockey', 'CA'), ('nba', 'basketball', 'US'), ('mlb', 'baseball', 'US'),
  ('nfl', 'american_football', 'US'), ('cfl', 'canadian_football', 'CA'),
  ('wha', 'ice_hockey', 'CA'), ('nha', 'ice_hockey', 'CA'),
  ('afl', 'american_football', 'US'), ('aafc', 'american_football', 'US'),
  ('pwhl', 'ice_hockey', 'CA'), ('wnba', 'basketball', 'US'),
  ('pcha', 'ice_hockey', 'CA'), ('wchl', 'ice_hockey', 'CA'),
  ('mls', 'american_football', 'US')
on conflict do nothing;
do $r$ begin
  create role anon nologin;
exception when duplicate_object then null;
end $r$;
do $r$ begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $r$;
insert into meta.source (code, name, kind, licence) values
  ('wikipedia', 'Wikipedia', 'website', 'CC BY-SA 4.0'),
  ('wikidata', 'Wikidata', 'dataset', 'CC0 1.0'),
  ('scratch', 'Scratch preview copy', 'manual', null)
on conflict (code) do nothing;

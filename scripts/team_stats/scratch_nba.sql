-- Minimal schema for scripts/team_stats/scratch_nba.sh. Not applied to DS1.
create schema if not exists meta;
create schema if not exists ref;
create schema if not exists core;
create schema if not exists legacy_wikipedia_stats;
create schema if not exists api;

create table meta.source (
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

create table ref.country (country_code text primary key, name text not null);
create table ref.sport (sport_code text primary key, name text not null);
create table ref.league (
  league_code text primary key, sport_code text not null references ref.sport
);

create type core.season_phase as enum
  ('preseason', 'regular', 'playoffs', 'all_star', 'exhibition', 'tournament');
create type core.game_status as enum
  ('scheduled', 'in_progress', 'final', 'postponed', 'suspended', 'cancelled', 'forfeit');

create table core.season (
  season_id       integer generated always as identity primary key,
  league_code     text not null references ref.league,
  start_year      smallint not null,
  end_year        smallint not null,
  label           text not null,
  games_per_team  smallint,
  unique (league_code, start_year)
);
create table core.franchise (
  franchise_id integer generated always as identity primary key,
  sport_code   text not null references ref.sport
);
create table core.franchise_identity (
  franchise_identity_id integer generated always as identity primary key,
  franchise_id          integer not null references core.franchise,
  full_name             text not null
);
create table core.team_season (
  team_season_id         integer generated always as identity primary key,
  franchise_id           integer not null references core.franchise,
  season_id              integer not null references core.season,
  franchise_identity_id  integer references core.franchise_identity,
  unique (franchise_id, season_id)
);
create table core.game (
  game_id             bigint generated always as identity primary key,
  season_id           integer not null references core.season,
  phase               core.season_phase not null,
  game_date           date not null,
  home_team_season_id integer not null references core.team_season,
  away_team_season_id integer not null references core.team_season,
  status              core.game_status not null,
  home_score          smallint,
  away_score          smallint,
  source_id           smallint not null references meta.source,
  source_key          text not null
);

create table core.team_season_stat (
  team_season_id integer not null references core.team_season on delete cascade,
  phase          core.season_phase not null default 'regular',
  games_played   smallint,
  stats          jsonb not null,
  source_id      smallint not null references meta.source,
  primary key (team_season_id, phase, source_id)
);

create table legacy_wikipedia_stats.nba_article (
  season     smallint not null,
  club       text     not null,
  page_title text     not null,
  revid      bigint   not null,
  heading    text,
  tables     smallint not null default 0,
  primary key (season, club)
);
create table legacy_wikipedia_stats.nba_line (
  season     smallint not null,
  club       text     not null,
  phase      text     not null,
  tbl        smallint not null,
  ord        smallint not null,
  name       text     not null,
  link_title text,
  cells      jsonb    not null,
  primary key (season, club, phase, tbl, ord)
);

insert into ref.country values ('US', 'United States');
insert into ref.sport values ('basketball', 'Basketball');
insert into ref.league values ('nba', 'basketball');
insert into meta.source (code, name, kind, licence, attribution, url)
values ('wikipedia', 'Wikipedia', 'dataset', 'CC BY-SA 4.0',
        'Text and tables from English Wikipedia (en.wikipedia.org), CC BY-SA 4.0; see each article''s history for its authors.',
        'https://en.wikipedia.org');

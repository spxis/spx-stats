-- Minimal schema for the meigen-people scratch test. Not for DS1 or production.
create schema if not exists meta;
create schema if not exists ref;
create schema if not exists core;
create schema if not exists api;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;
grant usage on schema api to anon, authenticated;

create table if not exists meta.source (
  source_id     smallint generated always as identity primary key,
  code          text not null unique check (code ~ '^[a-z0-9_]+$'),
  name          text not null,
  kind          text not null check (kind in
                  ('database_backup', 'file_archive', 'website', 'api', 'dataset', 'manual')),
  licence       text,
  attribution   text,
  url           text,
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
  country_code  text primary key check (country_code ~ '^[A-Z]{2}$'),
  name          text not null
);

create table if not exists core.person (
  person_id           bigint generated always as identity primary key,
  full_name           text not null,
  given_name          text,
  family_name         text,
  birth_date          date,
  birth_place         text,
  birth_country_code  text references ref.country,
  death_date          date,
  death_place         text,
  death_country_code  text,
  nationality_code    text,
  kind                text not null default 'player',
  source_id           smallint references meta.source,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists core.external_id (
  entity_kind   text not null check (entity_kind in
                  ('franchise', 'team_season', 'venue', 'person', 'game', 'season')),
  entity_id     bigint not null,
  source_id     smallint not null references meta.source,
  external_key  text not null,
  primary key (source_id, entity_kind, external_key)
);

create or replace function core.fold_text(t text) returns text
language sql immutable parallel safe as $$
  select btrim(regexp_replace(replace(replace(replace(translate(
    regexp_replace(lower(normalize(t, nfd)), '[̀-ͯ.''’]', '', 'g'),
    'øłđðı', 'olddi'), 'æ', 'ae'), 'œ', 'oe'), 'ß', 'ss'), '[^[:alnum:]]+', ' ', 'g'))
$$;

insert into meta.source (code, name, kind, licence, attribution, url, notes)
values ('wikidata', 'Wikidata', 'dataset', 'CC0 1.0',
        'Wikidata contributors, CC0.', 'https://www.wikidata.org/',
        'scratch')
on conflict (code) do nothing;

alter table core.person add column if not exists height_cm smallint;
alter table core.person add column if not exists debut_on date;
alter table core.person add column if not exists final_game_on date;
alter table core.person add column if not exists hall_of_fame_year smallint;

create table if not exists core.person_career (
  person_career_id bigint generated always as identity primary key,
  person_id   bigint not null references core.person (person_id) on delete cascade,
  kind        text not null check (kind in ('education', 'club', 'draft')),
  name        text not null,
  club_qid    text,
  level       text,
  league      text,
  start_year  smallint,
  end_year    smallint,
  detail      text,
  source_id   smallint not null references meta.source (source_id),
  source_key  text not null,
  unique (source_id, source_key)
);

-- Meigen-sports Wikidata athletes (CC0): staging on DS1, plus core.person_sport.
-- core.person_sport does not exist on origin/main (through 120) or on the
-- preview PostgREST at 7750 (GET /person_sports -> 42P01). This migration
-- creates it. 182 deletes core.person_career rows from source wikidata, so
-- sports live here with source wikidata_meigen.
-- Nothing about ethnicity, religion, health, sex or gender, family or politics.

insert into meta.source (code, name, kind, licence, attribution, url, notes)
values (
  'wikidata_meigen',
  'Wikidata (meigen-sports athletes)',
  'dataset',
  'CC0 1.0',
  'Wikidata contributors, CC0.',
  'https://www.wikidata.org/',
  'Athletes collected for meigen-sports. Sport rows use this source so db/build/182 does not delete them.'
)
on conflict (code) do nothing;

create schema if not exists legacy_wikidata_meigen;
comment on schema legacy_wikidata_meigen is
  'Wikidata SPARQL answers for meigen-sports athletes, as loaded. CC0. DS1 only; never released to production.';

create table if not exists legacy_wikidata_meigen.athlete (
  qid         text not null check (qid ~ '^Q[0-9]+$'),
  label       text not null,
  sport       text not null check (sport ~ '^[a-z][a-z0-9_]*$'),
  birth_on    date,
  birth_prec  smallint check (birth_prec is null or birth_prec between 9 and 11),
  death_on    date,
  death_prec  smallint check (death_prec is null or death_prec between 9 and 11),
  birth_place text,
  sitelinks   integer,
  batch       text not null,
  loaded_at   timestamptz not null default now(),
  primary key (qid, sport)
);
comment on table legacy_wikidata_meigen.athlete is
  'One Wikidata human per sport. birth_prec 11 = day (copied to core.person); 9/10 stay in this table only. Birthplace is P19, never citizenship.';
create index if not exists athlete_batch_idx on legacy_wikidata_meigen.athlete (batch);

create table if not exists core.person_sport (
  person_id   bigint not null references core.person (person_id) on delete cascade,
  sport_code  text not null check (sport_code ~ '^[a-z][a-z0-9_]*$'),
  source_id   smallint not null references meta.source (source_id),
  source_key  text not null,
  unique (source_id, source_key),
  primary key (person_id, sport_code, source_id)
);
comment on table core.person_sport is
  'Sports a person is known for (Wikidata P641 via meigen-sports). People with no team are allowed. Filled by db/build/215_meigen_people.sql.';
create index if not exists person_sport_sport_idx on core.person_sport (sport_code);

create or replace view api.person_sports as
select ps.person_id, ps.sport_code, src.code as source
from core.person_sport ps
join meta.source src on src.source_id = ps.source_id;
comment on view api.person_sports is
  'Sports held for a person (migration 121). Filter person_id=eq.N. Empty until 215 has run.';
grant select on api.person_sports to anon, authenticated;

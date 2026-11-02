-- Staging tables for the meigen-sports bios (Wikidata CC0 + English Wikipedia CC BY-SA 4.0), loaded by scripts/wikidata_meigen/load_bio.py.
-- DS1 only: production has no legacy_* schemas. 121 created legacy_wikidata_meigen.athlete; the core tables these feed are in 191.
-- Full wikitext stays in archive files (DS1 / Dropbox only). Nothing about ethnicity, religion, health, sex or gender, family or politics.
-- P19 birthplace is not P27 citizenship.

create table if not exists legacy_wikidata_meigen.wiki_page (
  qid                text not null check (qid ~ '^Q[0-9]+$') primary key,
  title              text not null,
  revid              bigint,
  url                text not null,
  short_description  text,
  lead_text          text,
  bytes              integer,
  sha256             text,
  file_name          text not null,
  loaded_at          timestamptz not null default now()
);
comment on table legacy_wikidata_meigen.wiki_page is
  'English Wikipedia page for a priority athlete. file_name is wikipedia/en/<qid>.wikitext (DS1/Dropbox). lead_text is the first paragraph, not the article. CC BY-SA 4.0; cite title, revid, url.';

create table if not exists legacy_wikidata_meigen.bio (
  qid                 text not null check (qid ~ '^Q[0-9]+$') primary key,
  label               text not null,
  description_en      text,
  sport               text,
  birth_on            date,
  birth_prec          smallint check (birth_prec is null or birth_prec between 9 and 11),
  death_on            date,
  death_prec          smallint check (death_prec is null or death_prec between 9 and 11),
  birth_place_qid     text,
  birth_place_label   text,
  death_place_qid     text,
  death_place_label   text,
  citizen_qid         text,
  height_cm           smallint check (height_cm is null or height_cm between 120 and 250),
  image_file          text,
  image_url           text,
  sitelinks           integer,
  enwiki_title        text,
  debut_on            date,
  debut_prec          smallint,
  final_on            date,
  final_prec          smallint,
  hof_year            smallint,
  loaded_at           timestamptz not null default now()
);
comment on table legacy_wikidata_meigen.bio is
  'Wikidata + infobox facts for a priority athlete. birth_prec 11 = day. citizen_qid is P27 (citizenship), never ethnicity. Height is P2048 in cm, 120-250.';

create table if not exists legacy_wikidata_meigen.team_stint (
  qid         text not null check (qid ~ '^Q[0-9]+$'),
  n           integer not null,
  club_qid    text,
  club_name   text,
  start_year  smallint,
  end_year    smallint,
  source      text not null check (source in ('wikidata', 'wikipedia')),
  source_key  text not null,
  primary key (qid, source, source_key)
);
comment on table legacy_wikidata_meigen.team_stint is
  'P54 member of sports team (club_qid) or Wikipedia infobox clubsN (club_name). Years when the source gives them. Never matched by person name.';

create table if not exists legacy_wikidata_meigen.honour (
  qid         text not null check (qid ~ '^Q[0-9]+$'),
  n           integer not null,
  kind        text not null check (kind in ('award', 'medal', 'championship', 'record')),
  item_qid    text,
  name        text,
  year        smallint,
  detail      text,
  source      text not null check (source in ('wikidata', 'wikipedia')),
  source_key  text not null,
  primary key (qid, source, source_key)
);
comment on table legacy_wikidata_meigen.honour is
  'P166 awards, Olympic/Paralympic medals, P2522 victories, infobox titles. Year only when the source states it.';

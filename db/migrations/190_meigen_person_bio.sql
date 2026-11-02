-- Richer bios for the meigen-sports priority 1000 (Wikidata CC0 + English
-- Wikipedia CC BY-SA 4.0). 121 already created legacy_wikidata_meigen.athlete
-- and core.person_sport; this file does not rewrite it.
-- Full wikitext stays in archive files (DS1 / Dropbox only). These tables hold
-- structured extracts. Nothing about ethnicity, religion, health, sex or
-- gender, family or politics. P19 birthplace is not P27 citizenship.
--
-- core.person already has the sports-bio columns this step fills when empty:
--   birth_place, death_place, nationality_code (citizenship country),
--   height_cm, debut_on, final_game_on, hall_of_fame_year.
-- New tables:
--   core.person_honour  awards, medals, championships, records (not league award_winner)
--   core.person_image   Commons file URL (licence lives on the file page)
-- Clubs go into existing core.person_career with source wikidata_meigen /
-- wikipedia_meigen so 182 (source wikidata) does not delete them.

insert into meta.source (code, name, kind, licence, attribution, url, notes)
values (
  'wikipedia_meigen',
  'English Wikipedia (meigen-sports priority athletes)',
  'website',
  'CC BY-SA 4.0',
  'Wikipedia contributors, CC BY-SA 4.0.',
  'https://en.wikipedia.org/',
  'Full article wikitext is archived by QID. Structured rows cite title, revision id and URL.'
)
on conflict (code) do nothing;

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

create table if not exists core.person_honour (
  person_honour_id bigint generated always as identity primary key,
  person_id        bigint not null references core.person (person_id) on delete cascade,
  kind             text not null check (kind in ('award', 'medal', 'championship', 'record')),
  name             text not null,
  year             smallint,
  item_qid         text,
  detail           text,
  source_id        smallint not null references meta.source (source_id),
  source_key       text not null,
  unique (source_id, source_key)
);
comment on table core.person_honour is
  'Awards, medals, championships and records for a person (meigen-sports 190). Not core.award_winner (that needs a league season). Filled by db/build/239_meigen_person_bio.sql.';
create index if not exists person_honour_person_idx on core.person_honour (person_id);

create table if not exists core.person_image (
  person_id     bigint not null references core.person (person_id) on delete cascade primary key,
  commons_file  text not null,
  url           text not null,
  licence       text,
  source_id     smallint not null references meta.source (source_id),
  source_key    text not null,
  unique (source_id, source_key)
);
comment on table core.person_image is
  'Wikimedia Commons file for a person (P18). Binary stays on Commons; licence is on the file page unless filled. Filled by 239.';

create or replace view api.person_honours as
select h.person_id, h.kind, h.name, h.year, h.item_qid, h.detail, src.code as source
from core.person_honour h
join meta.source src on src.source_id = h.source_id;
comment on view api.person_honours is
  'Awards and medals for a person (migration 190). Filter person_id=eq.N.';
grant select on api.person_honours to anon, authenticated;

create or replace view api.person_images as
select i.person_id, i.commons_file, i.url, i.licence, src.code as source
from core.person_image i
join meta.source src on src.source_id = i.source_id;
comment on view api.person_images is
  'Commons portrait file for a person (migration 190). Filter person_id=eq.N.';
grant select on api.person_images to anon, authenticated;

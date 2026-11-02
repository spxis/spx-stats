-- Awards, medals, championships, records and a portrait file for a person, by Wikidata id (meigen-sports bios). DS1 and production.
-- 190 holds the DS1-only staging tables; db/build/239_meigen_person_bio.sql fills these from them. Clubs go into the existing core.person_career
-- with source wikidata_meigen / wikipedia_meigen so 182 (source wikidata) does not delete them.
-- core.person already has the sports-bio columns 239 fills when empty: birth_place, death_place, nationality_code (citizenship country),
-- height_cm, debut_on, final_game_on, hall_of_fame_year. Nothing about ethnicity, religion, health, sex or gender, family or politics.

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
  'Awards, medals, championships and records for a person (meigen-sports 191). Not core.award_winner (that needs a league season). Filled by db/build/239_meigen_person_bio.sql.';
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
  'Awards and medals for a person (migration 191). Filter person_id=eq.N.';
grant select on api.person_honours to anon, authenticated;

create or replace view api.person_images as
select i.person_id, i.commons_file, i.url, i.licence, src.code as source
from core.person_image i
join meta.source src on src.source_id = i.source_id;
comment on view api.person_images is
  'Commons portrait file for a person (migration 191). Filter person_id=eq.N.';
grant select on api.person_images to anon, authenticated;

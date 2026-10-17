-- Jersey numbers a player wore, and numbers a franchise (or a whole league) has retired.
-- Raw rows: English Wikipedia retired-number lists (CC BY-SA 4.0) and Wikidata P1618
-- (CC0). core holds only matched rows; unmatched names stay in the legacy tables.
-- Nothing is guessed. api views are empty until a data release fills the tables.

insert into meta.source (code, name, kind, licence, attribution, url, notes)
values (
  'wikipedia',
  'Wikipedia',
  'website',
  'CC BY-SA 4.0',
  'English Wikipedia, CC BY-SA 4.0.',
  'https://en.wikipedia.org',
  'Retired-number lists and other articles. Provenance on each row is source_key.'
)
on conflict (code) do nothing;

insert into meta.source (code, name, kind, licence, attribution, url, notes)
values (
  'wikidata',
  'Wikidata',
  'dataset',
  'CC0 1.0',
  'Wikidata contributors, CC0.',
  'https://www.wikidata.org/',
  'Sport numbers (P1618) and other statements. Provenance on each row is source_key.'
)
on conflict (code) do nothing;

create schema if not exists legacy_wikipedia_jersey;
comment on schema legacy_wikipedia_jersey is
  'Retired numbers read from English Wikipedia list articles. CC BY-SA 4.0. DS1 only until a release copies core.';

create or replace function legacy_wikipedia_jersey.name_key(text) returns text
language sql immutable parallel safe as $$
  select regexp_replace(translate(lower($1),
    'àáâãäåāăąçćčďđéèêëēěęğíìîïīıłñńňóòôõöøōőřśšşșťţúùûüūůűýÿžźż',
    'aaaaaaaaacccddeeeeeeegiiiiiilnnnoooooooorssssttuuuuuuuyyzzz'),
    '[^a-z0-9]', '', 'g')
$$;

create table if not exists legacy_wikipedia_jersey.article (
  article_code  text primary key,
  league_code   text not null,
  title         text not null,
  url           text not null,
  revision_id   bigint,
  fetched_on    date not null,
  licence       text not null
);
comment on table legacy_wikipedia_jersey.article is
  'One English Wikipedia retired-number list. revision_id is the page revision that was read.';

create table if not exists legacy_wikipedia_jersey.retired (
  article_code   text not null references legacy_wikipedia_jersey.article,
  row_number     integer not null,
  league_code    text not null,
  team_name      text,
  team_key       text,
  jersey_number  smallint not null check (jersey_number between 0 and 99),
  player_name    text,
  player_title   text,
  player_key     text,
  tenure_text    text,
  retired_on     date,
  retired_text   text,
  league_wide    boolean not null default false,
  notes          text,
  primary key (article_code, row_number)
);
comment on table legacy_wikipedia_jersey.retired is
  'One retired number as the article''s table named it. player_title is the first wikilink, when there is one.';
create index if not exists wikipedia_jersey_retired_team on legacy_wikipedia_jersey.retired (league_code, team_key);
create index if not exists wikipedia_jersey_retired_player on legacy_wikipedia_jersey.retired (player_key);

create schema if not exists legacy_wikidata_jersey;
comment on schema legacy_wikidata_jersey is
  'Wikidata sport numbers (P1618) as SPARQL returned them. CC0. DS1 only until a release copies core.';

create table if not exists legacy_wikidata_jersey.sport_number (
  qid           text not null check (qid ~ '^Q[0-9]+$'),
  jersey_number smallint not null check (jersey_number between 0 and 99),
  team_qid      text check (team_qid is null or team_qid ~ '^Q[0-9]+$'),
  team_label    text,
  from_year     smallint,
  to_year       smallint,
  statement     text not null,
  loaded_at     timestamptz not null default now(),
  primary key (qid, jersey_number, statement)
);
comment on table legacy_wikidata_jersey.sport_number is
  'One P1618 statement: a person, a number, and the team qualifier when Wikidata has one.';

create table if not exists core.person_jersey (
  person_jersey_id  bigint generated always as identity primary key,
  person_id         bigint not null references core.person,
  franchise_id      integer references core.franchise,
  league_code       text not null,
  jersey_number     smallint not null check (jersey_number between 0 and 99),
  from_year         smallint,
  to_year           smallint,
  source_id         smallint not null references meta.source,
  source_key        text not null,
  unique (source_id, source_key)
);
comment on table core.person_jersey is
  'A number a person wore, for a club when known. Several rows per person are allowed (Bure 10 and 92). Never guessed.';
create index if not exists person_jersey_person on core.person_jersey (person_id, jersey_number);
create index if not exists person_jersey_franchise on core.person_jersey (franchise_id, jersey_number);

create table if not exists core.retired_number (
  retired_number_id  bigint generated always as identity primary key,
  league_code        text not null,
  franchise_id       integer references core.franchise,
  jersey_number      smallint not null check (jersey_number between 0 and 99),
  person_id          bigint references core.person,
  honor_name         text,
  retired_on         date,
  tenure_text        text,
  source_id          smallint not null references meta.source,
  source_key         text not null,
  unique (source_id, source_key),
  check (person_id is not null or honor_name is not null)
);
comment on table core.retired_number is
  'A number a franchise retired, or a league-wide retirement when franchise_id is null (Gretzky 99, Jackie Robinson 42). honor_name holds the printed name when no person matched.';
create index if not exists retired_number_franchise on core.retired_number (league_code, franchise_id, jersey_number);
create index if not exists retired_number_person on core.retired_number (person_id);

create or replace view api.retired_number as
select r.retired_number_id,
       r.league_code as league,
       r.franchise_id,
       r.jersey_number,
       r.person_id,
       coalesce(p.full_name, r.honor_name) as name,
       r.honor_name,
       r.retired_on,
       r.tenure_text,
       (r.franchise_id is null) as league_wide,
       src.code as source
from core.retired_number r
left join core.person p on p.person_id = r.person_id
join meta.source src on src.source_id = r.source_id;

comment on view api.retired_number is
  'Retired numbers: league, franchise (null = league-wide), number, person or printed name, date. Filter with league=eq. and or franchise_id=eq. / franchise_id=is.null.';
do $g$ begin
  execute 'grant select on api.retired_number to anon, authenticated';
exception when undefined_object then null;
end $g$;

create or replace view api.person_jersey as
select j.person_jersey_id,
       j.person_id,
       j.franchise_id,
       j.league_code as league,
       j.jersey_number,
       j.from_year,
       j.to_year,
       src.code as source
from core.person_jersey j
join meta.source src on src.source_id = j.source_id;

comment on view api.person_jersey is
  'Numbers a person wore, one row per person, club and number. Filter with person_id=eq. or franchise_id=eq.';
do $g$ begin
  execute 'grant select on api.person_jersey to anon, authenticated';
exception when undefined_object then null;
end $g$;

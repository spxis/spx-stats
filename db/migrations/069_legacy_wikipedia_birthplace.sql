-- The birth place line of the infobox of an English Wikipedia biography (CC BY-SA 4.0), as printed, for players whose Wikipedia
-- article core.external_id holds (source wikipedia). DS1 only: production never holds a legacy_* schema (AGENTS.md section 8).
-- Filled by scripts/wikipedia_birth/fetch.py and load.py; db/build/187_nhl_birth_country.sql reads it. Rerunnable.
create schema if not exists legacy_wikipedia_birth;
comment on schema legacy_wikipedia_birth is 'Birth place lines of English Wikipedia biography infoboxes, as printed. CC BY-SA 4.0.';

create table if not exists legacy_wikipedia_birth.infobox (
  title       text   not null primary key,      -- the article asked for (core.external_id, source wikipedia)
  page_title  text,                             -- the article it resolved to (after redirects); null when there is none
  revision_id bigint,                           -- the revision read
  found       boolean not null,                 -- the article exists
  birth_place text,                             -- the infobox's birth_place value as printed (wiki markup removed), null when it has none
  raw_value   text,                             -- the same value as wikitext
  fetched_on  date   not null
);
comment on table legacy_wikipedia_birth.infobox is 'One row per article read: the infobox birth_place, markup removed. Licence CC BY-SA 4.0 (en.wikipedia.org).';

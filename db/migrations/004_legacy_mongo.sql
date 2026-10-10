-- The spx-stats MongoDB of 2015 (spxn's scraper store): one row per scraped
-- page snapshot, exactly as kept, merged from every dump found. Member
-- collections (users, mailing-list) are never copied.
create schema if not exists legacy_mongo;
comment on schema legacy_mongo is 'The spx-stats and spxn MongoDB dumps (2013-2015), exactly as kept. Member data is not here.';

create table legacy_mongo.page_snapshot (
  page_key     text not null,
  taken_at     timestamptz not null,
  source_code  text,
  sport        text,
  stat_type    text,
  season_type  text,
  season_year  integer,
  url          text,
  doc          jsonb not null,
  body         text,
  _seen_in     text[] not null,
  primary key (page_key, taken_at)
);
comment on table legacy_mongo.page_snapshot is 'spx-stats pages: a scraped stats page at one moment, with its parsed rows in doc->data and the page itself in body.';

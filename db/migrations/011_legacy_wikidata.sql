-- Answers from the Wikidata query service (CC0), one row per result row, kept
-- by the query that produced them. The queries are in scripts/wikidata/.
create schema if not exists legacy_wikidata;
comment on schema legacy_wikidata is 'Wikidata (www.wikidata.org) query results, as answered. CC0.';
create table legacy_wikidata.result (
  query_name  text not null,
  row_number  integer not null,
  row         jsonb not null,
  fetched_at  timestamptz not null default now(),
  primary key (query_name, row_number)
);

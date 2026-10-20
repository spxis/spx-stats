-- The full Wikidata JSON dump (CC0), cut down to sport people, events, items and the labels they point at. DS1 only: production never
-- holds a legacy_* schema (AGENTS.md section 8), and nothing here is released.
-- Made by scripts/wikidata_dump/filter.py (on nas1, from the read-only dump) and loaded by scripts/wikidata_dump/load.py. The 150 GB dump
-- itself is not stored in the database (a bytea holds 1 GB): load_run keeps its provenance (name, size, md5, sha256, folder) and the
-- hashes of the filtered files, which stay on nas1 and in the backups folder.
-- Rows are the filter's JSON documents as they are (format: scripts/wikidata_dump/README.md, "Output format"), keyed by Q id, one snapshot:
-- a later dump replaces the rows (load.py --replace-old). Nothing about sex or gender, ethnicity, religion, politics, health or family
-- is in them (filter.py allow-list; AGENTS.md section 3).
-- Names checked free: no schema, table or file in the repository used legacy_wikidata_dump before this migration.
-- Rerunnable (create if not exists). The meta.source row for the dump comes with the first build step that reads these tables, so that
-- this migration changes nothing production compares against.
create schema if not exists legacy_wikidata_dump;
comment on schema legacy_wikidata_dump is
  'Sport people, events, items and labels filtered from the Wikidata JSON dump (CC0). DS1 only; never released to production.';

create table if not exists legacy_wikidata_dump.load_run (
  run_id          integer generated always as identity primary key,
  run_key         text not null unique,        -- filter.py run_key (its summary.json); a rerun of load.py for the same filter run reuses the row
  kind            text not null default 'extract' check (kind in ('extract', 'labels')),
  dump_name       text not null,               -- e.g. wikidata-20261012-all.json.gz
  dump_date       date,                        -- the dump's own date
  dump_path       text,                        -- where the raw dump is kept, relative to nas1's docker folder (never a host or a home path)
  dump_bytes      bigint,
  dump_md5        text,
  dump_sha256     text,
  filter_version  text not null,
  filter_options  jsonb not null,
  filter_lines    bigint,                      -- lines of the dump the filter read
  malformed_lines bigint,
  complete        boolean,                     -- the filter reached the end of the dump (false: a --limit test run)
  files           jsonb not null default '{}'::jsonb,   -- output file name -> {bytes, sha256}
  counts          jsonb not null default '{}'::jsonb,   -- rows the filter wrote, by output
  loaded          jsonb not null default '{}'::jsonb,   -- rows load.py loaded, by table
  summary         jsonb,                       -- the filter's summary.json as it was (counts by sport included)
  status          text not null default 'loading' check (status in ('loading', 'done', 'failed')),
  note            text,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz
);
comment on table legacy_wikidata_dump.load_run is
  'One filter run loaded into DS1: the dump''s provenance (name, bytes, md5, sha256, folder), the filter options, the hashes of the filtered files and the row counts.';

create table if not exists legacy_wikidata_dump.person (
  qid        text primary key check (qid ~ '^Q[0-9]+$'),
  run_id     integer not null references legacy_wikidata_dump.load_run (run_id),
  doc        jsonb not null,
  sitelinks  integer generated always as ((doc #>> '{sl,n}')::integer) stored,
  label_en   text generated always as (doc #>> '{l,en}') stored
);
comment on table legacy_wikidata_dump.person is
  'A human with a sport occupation and a sport (P106, P641) as filter.py keeps them: labels, dates with precision and calendar, birth and death place, citizenship, occupations, sports, team memberships with dates, positions, awards, participation, records, image, height, mass.';

create table if not exists legacy_wikidata_dump.event (
  qid        text primary key check (qid ~ '^Q[0-9]+$'),
  run_id     integer not null references legacy_wikidata_dump.load_run (run_id),
  doc        jsonb not null,
  sitelinks  integer generated always as ((doc #>> '{sl,n}')::integer) stored,
  label_en   text generated always as (doc #>> '{l,en}') stored
);
comment on table legacy_wikidata_dump.event is
  'A sport item with a day-precision date (P585, P580, P582) or a winner (P1346): type, sport, dates, winner, participants, place, country, part of, season, teams.';

create table if not exists legacy_wikidata_dump.item (
  qid        text primary key check (qid ~ '^Q[0-9]+$'),
  run_id     integer not null references legacy_wikidata_dump.load_run (run_id),
  doc        jsonb not null,
  sitelinks  integer generated always as ((doc #>> '{sl,n}')::integer) stored,
  label_en   text generated always as (doc #>> '{l,en}') stored
);
comment on table legacy_wikidata_dump.item is
  'A sport item that is neither a person nor an event: clubs, leagues, venues, competitions, seasons (type, sport, country, league, part of, home venue, inception, dissolution, dates).';

create table if not exists legacy_wikidata_dump.label (
  qid        text primary key check (qid ~ '^Q[0-9]+$'),
  run_id     integer not null references legacy_wikidata_dump.load_run (run_id),
  doc        jsonb not null,
  label_en   text generated always as (doc #>> '{l,en}') stored
);
comment on table legacy_wikidata_dump.label is
  'Labels (en, fr, ja, mul) of the ids the other tables point at that are not in them (places, countries, awards, positions, sports ...): type, country, parent area, ISO codes. Second filter pass.';

create index if not exists person_run_idx on legacy_wikidata_dump.person (run_id);
create index if not exists event_run_idx on legacy_wikidata_dump.event (run_id);
create index if not exists item_run_idx on legacy_wikidata_dump.item (run_id);
create index if not exists label_run_idx on legacy_wikidata_dump.label (run_id);
create index if not exists person_sitelinks_idx on legacy_wikidata_dump.person (sitelinks desc nulls last);

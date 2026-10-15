-- /admin/ops, Backups section. DS1 ONLY (schema ingest never goes to production; do not apply this on production). Add-only and rerunnable.
--
-- scripts/mac/spx-raw-export.sh copies legacy_files.raw_archive into the Dropbox folder on a Mac (machine1). At the end of every run it
-- writes one row here (rows checked, copied, already there, failed, bytes), so the runner's status snapshot can say when the last export ran
-- and how it went: no row at all means the export has never run (or the Mac cannot reach DS1). The script keeps the newest 200 rows.

create schema if not exists ingest;
create table if not exists ingest.raw_export_run (
  id          bigint generated always as identity primary key,
  finished_at timestamptz not null default now(),
  host        text,
  outcome     text not null check (outcome in ('ok', 'problems')),
  checked     integer not null default 0,
  copied      integer not null default 0,
  present     integer not null default 0,
  failed      integer not null default 0,
  bytes       bigint  not null default 0,
  seconds     integer
);
comment on table ingest.raw_export_run is 'One row per run of spx-raw-export.sh (the Dropbox copy of legacy_files.raw_archive). DS1 only.';
create index if not exists raw_export_run_finished_idx on ingest.raw_export_run (finished_at desc);
revoke all on ingest.raw_export_run from public;
do $$
declare r text;
begin
  for r in select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role', 'ingest_writer') loop
    execute format('revoke all on ingest.raw_export_run from %I', r);
  end loop;
end $$;

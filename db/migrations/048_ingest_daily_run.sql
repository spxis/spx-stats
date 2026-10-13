-- The heartbeat of the daily scores job (scripts/daily, run.py --apply): one row per run, so a missed or failed day shows on DS1.
-- DS1 only (like the rest of schema ingest); not in a release, not on production. It is not meta.load_run on purpose: meta is a
-- release schema (every row would show up as drift to publish) and that table's kind check has no 'daily'.
-- A row is written as 'running' when the run starts and closed as 'ok' or 'failed' when it ends; a row still 'running' long after
-- its started_at is a run that died. Rerunnable.
begin;
create table if not exists ingest.daily_run (
  run_id       bigint generated always as identity primary key,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  outcome      text not null default 'running' check (outcome in ('running', 'ok', 'failed')),
  host         text,
  git_sha      text,
  summary      jsonb not null default '{}'::jsonb
);
comment on table ingest.daily_run is 'One row per run of the daily scores job (run.py --apply): started, finished, outcome and counts. DS1 only.';
create index if not exists daily_run_started_idx on ingest.daily_run (started_at desc);
revoke all on ingest.daily_run from public;
do $$
declare r text;
begin
  for r in select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role', 'ingest_writer') loop
    execute format('revoke all on ingest.daily_run from %I', r);
  end loop;
end $$;
commit;

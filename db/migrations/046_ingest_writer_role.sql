-- The role that reports daily and live results: ingest_writer. NOLOGIN here; it can execute ingest.report_results(jsonb) and
-- nothing else (no table privilege, no other function, no other schema). Apply to DS1 and, in phase B, to production.
--
-- Giving it a way in is a separate, deliberate step that sets a password and is NOT part of any migration:
-- scripts/daily/ingest-writer-login.sh (it never prints the password). On Supabase connect through the pooler as
-- ingest_writer.<project ref>; keep PostgREST's exposed schemas at api only.
-- Rerunnable.
begin;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'ingest_writer') then
    create role ingest_writer nologin noinherit nocreatedb nocreaterole nosuperuser nobypassrls;
  end if;
end $$;
-- a runaway call is cut off; a writer opens at most one transaction of work at a time
alter role ingest_writer set statement_timeout = '120s';
alter role ingest_writer set lock_timeout = '10s';
alter role ingest_writer set idle_in_transaction_session_timeout = '60s';

revoke all on all tables in schema ingest from ingest_writer;
revoke all on all functions in schema ingest from ingest_writer;
grant usage on schema ingest to ingest_writer;
grant execute on function ingest.report_results(jsonb) to ingest_writer;
commit;

-- api.stat_reference is a plain table (migration 103 swapped the materialized view for a table) in the schema PostgREST serves.
-- Visitors only ever had SELECT on it (anon and authenticated hold no INSERT, UPDATE or DELETE), but Row-Level Security was off,
-- so Supabase's advisor reports it as publicly writable (rls_disabled_in_public). Turn RLS on with a read-only policy: reads
-- work as before, and a write by anon or authenticated would be refused even if a grant were ever added by mistake.
-- The table owner (the release runner and the build steps) is not subject to RLS. Rerunnable. DS1 and production.
alter table api.stat_reference enable row level security;
drop policy if exists stat_reference_read on api.stat_reference;
create policy stat_reference_read on api.stat_reference for select to anon, authenticated using (true);

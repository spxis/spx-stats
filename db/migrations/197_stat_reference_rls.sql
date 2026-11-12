-- api.stat_reference: row-level security on, with one read policy, so the public keeps read-only access
-- exactly as before (anon and authenticated hold SELECT only) and the table is no longer flagged as
-- "RLS disabled in public". Rerunnable.
alter table api.stat_reference enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'api' and tablename = 'stat_reference' and policyname = 'stat_reference_read'
  ) then
    create policy stat_reference_read on api.stat_reference for select to anon, authenticated using (true);
  end if;
end $$;

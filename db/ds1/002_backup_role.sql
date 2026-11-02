-- DS1 only (never production): spx_backup, the role the nightly backup (scripts/backup/ds1-backup.sh) logs in as. NOLOGIN here;
-- scripts/backup/backup-role-login.sh gives it a password (generated there, never in a file) and proves it.
-- It can read every table, view and sequence in every schema (pg_read_all_data, with BYPASSRLS so row security hides nothing from the
-- dump) and write nothing: every session it opens is read-only, so even a bug in a script cannot change DS1.
-- Rerunnable. Apply with: bash scripts/mac/ds1-apply.sh db/ds1/002_backup_role.sql [--dry-run]
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'spx_backup') then
    create role spx_backup nologin nosuperuser nocreatedb nocreaterole noreplication inherit bypassrls connection limit 3;
  end if;
end $$;
grant pg_read_all_data to spx_backup;
alter role spx_backup set default_transaction_read_only = on;
alter role spx_backup set lock_timeout = '2min';

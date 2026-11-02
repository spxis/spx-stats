# DS1 backups (short)

- **What:** every night at 05:30 America/Toronto a container on nas2 dumps DS1's `spx_stats` (`pg_dump -Fc`, about 9 GB of data) over the home LAN.
  14 daily and 8 weekly dumps are kept in `daily/` and `weekly/` under the folder named by `NAS2_BACKUP_DIR` in the private mapping. $0.
- **Safe by design:** a read-only login (`spx_backup`, `db/ds1/002_backup_role.sql`); written under a hidden name, read back with
  `pg_restore --list`, then renamed; a dump under 80 percent of the last one is parked and nothing is pruned; a failed run deletes nothing.
- **Is it alive?** run log job `ds1-backup` at `/admin/runs`; a failure raises the alert `backup:ds1`. `bash scripts/backup/backup-status.sh --nas2`
  (coordinating session only). `spx-check.sh` has a network line for nas2.
- **Restore drill:** `scripts/backup/restore-drill.sh <dump>` restores into a scratch Postgres and compares per-table row counts with DS1.
- **Who touches it:** only the coordinating session installs or changes anything on nas2 (`bash scripts/backup/install-nas2.sh`) or applies the DS1 role.
  Agents may read and change the code under `scripts/backup/` and `backup/` and test it on scratch Postgres (ports 7740-7749).
- **The mirror** (SPX-690: a read-only copy of what production serves) is **not built**. Only the backups are.

Install steps, the drill, recovery and the machine1 fallback: [backup/README.md](../backup/README.md).

# SPX extras (the SportsInteractive Dropbox folder)

What the folder holds and what to do with each part: [docs/spx-extras-inventory.md](../../docs/spx-extras-inventory.md). The European soccer plan:
[docs/soccer-europe.md](../../docs/soccer-europe.md).

## archive_keep.py: keep the folder as raw bytes (option A, John 2026-10-28 and 2026-10-29)

John's decision: archive the keep-only files of the SportsInteractive folder as raw bytes, to DS1 `legacy_files.raw_archive` and Dropbox
`raw/spx-extras`, and **build nothing**: no `legacy_spx_extras` load, no migration 140 on DS1 (the file `db/migrations/140_legacy_spx_extras.sql` stays
unapplied), no `core` rows, no ESPN data in any table. This covers SPX's archive of other sites' pages (ESPN Soccernet, BBC, CBS, Yahoo and the rest): bytes only.

`archive_keep.py` picks the files from an **allow list** in the script (the inventory's keep-only areas), never from a deny list. A file that is not on it is never
stat-ed, opened or copied, only counted. Inside an allowed area it also refuses, by name and without opening, anything that suggests accounts, members, users,
e-mail, addresses, passwords, credentials, connection strings, wagers, forum or site messages, GeoIP, or a database/mail/key file type; those are listed as REFUSED.
Zips and rars are stored as they are. Online-only (Dropbox placeholder), empty, linked, unreadable or changed-while-reading files are named and skipped, never stored as if
they were the file. Names: `spx-extras/<day>/<path under the folder>`.

Coordinating session, from the repo root, on the Mac that has the folder and reaches DS1 (about 6,850 files, 946 MB; a scratch run took about a minute):

    python3 -I scripts/spx_extras/archive_keep.py --check-db                 # dry run: per area counts and bytes, refused names, anything not local; reads DS1 (select only)
    python3 -I scripts/spx_extras/archive_keep.py --apply --date 2026-10-30  # archive to DS1: about 24 transactions of about 40 MB through ds1-apply.sh; prints progress

Rerun after an interruption or a Dropbox download with the same command (same `--date`): a file whose path and sha256 are already archived, under any day, is skipped.
`--only "Data/efl"` limits a run to one area; `--sql-dir DIR --date D` only writes the batch files. Exit code 2 means some files were not available locally: let Dropbox
download them and run again.

Then the Dropbox copy, either way:

    python3 scripts/dropbox_put.py --from-archive --source spx-extras --min-bytes 0     # needs DROPBOX_* and PGHOST/PGPORT/PGPASSWORD for DS1
    # or the Mac export (hourly job, `scripts/mac/spx-raw-export.sh`), which copies every raw_archive row into the synced Dropbox folder

Tests: `python3 -I scripts/spx_extras/test_archive_keep.py` (fake folder, Docker scratch Postgres on port 7741, removed afterwards).

## efl.py: the 2004 European results capture (loading is NOT approved)

`Data/efl/2004-regular/data/efl-2004-schedules.csv` is SPX's capture of ESPN Soccernet club pages. Under option A it is archived as raw bytes by `archive_keep.py` like
the rest and **not loaded**. The parser below stays for a later decision (load as confirm-only, or never); do not run the commands below, which need migration 140, without John's go.
If he approves loading (coordinating session, from the repo root; the folder path is John's Dropbox `Projects/SportsInteractive`):

    D=~/Library/CloudStorage/Dropbox/Projects/SportsInteractive/Data/efl/2004-regular
    bash scripts/mac/ds1-apply.sh db/migrations/140_legacy_spx_extras.sql
    python3 -I scripts/spx_extras/efl.py "$D/data/efl-2004-schedules.csv" spx-extras/2026-10-30/Data/efl/2004-regular/data/efl-2004-schedules.csv --sql-out efl.sql
    bash scripts/mac/ds1-apply.sh efl.sql

(The raw file is already in the archive under that name once `archive_keep.py` has run.) Expected: 8,961 rows in `legacy_spx_extras.efl_result` (2,315 with a score, 1,086 distinct scored matches), 0 unread lines. Test without a database: `python3 -I scripts/spx_extras/test_efl.py`.

Matching to SPX games (analysis, not built): an EFL name maps to a `legacy_spx.tbl_teams` row through `tbl_alternate_names` (standard name) or the team's name, short name or city, when exactly one team
fits; a game is the SPX fixture of those two clubs within a day of the date. On the 2026-10-19 scratch test 962 of 1,086 matched, all on fixtures with no score, none disagreeing.

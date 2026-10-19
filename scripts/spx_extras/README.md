# SPX extras (the SportsInteractive Dropbox folder)

What the folder holds and what to do with each part: [docs/spx-extras-inventory.md](../../docs/spx-extras-inventory.md). The European soccer plan:
[docs/soccer-europe.md](../../docs/soccer-europe.md).

## efl.py: the 2004 European results capture

`Data/efl/2004-regular/data/efl-2004-schedules.csv` is SPX's capture of ESPN Soccernet club pages. **Do not archive or load it until John has decided about ESPN-origin files.**
When he has (coordinating session, from the repo root; the folder path is John's Dropbox `Projects/SportsInteractive`):

    D=~/Library/CloudStorage/Dropbox/Projects/SportsInteractive/Data/efl/2004-regular
    mkdir -p ~/Projects/backups/spx-stats/raw/spx-extras/2026-10-19/efl && cp "$D"/data/*.csv "$D"/data/EFLGames.txt "$D"/archive/*.html ~/Projects/backups/spx-stats/raw/spx-extras/2026-10-19/efl/
    python3 -I scripts/archive_raw.py spx-extras ~/Projects/backups/spx-stats/raw/spx-extras/2026-10-19 2026-10-19 --sql-out archive.sql
    bash scripts/mac/ds1-apply.sh db/migrations/140_legacy_spx_extras.sql
    bash scripts/mac/ds1-apply.sh archive.sql
    python3 -I scripts/spx_extras/efl.py "$D/data/efl-2004-schedules.csv" spx-extras/2026-10-19/efl/efl-2004-schedules.csv --sql-out efl.sql
    bash scripts/mac/ds1-apply.sh efl.sql

Expected: 8,961 rows in `legacy_spx_extras.efl_result` (2,315 with a score, 1,086 distinct scored matches), 0 unread lines. Test without a database: `python3 -I scripts/spx_extras/test_efl.py`.
The raw copy goes to Dropbox `/Backups/spx-stats/raw/spx-extras/` with `python3 scripts/dropbox_put.py --from-archive`.

Matching to SPX games (analysis, not built): an EFL name maps to a `legacy_spx.tbl_teams` row through `tbl_alternate_names` (standard name) or the team's name, short name or city, when exactly one team
fits; a game is the SPX fixture of those two clubs within a day of the date. On the 2026-10-19 scratch test 962 of 1,086 matched, all on fixtures with no score, none disagreeing.

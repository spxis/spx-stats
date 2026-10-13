# World Cup data (soccer)

Design, model, sizes and the second check: [docs/soccer.md](../../docs/soccer.md).

Sources: jfjelstul/worldcup (Joshua C. Fjelstul, Ph.D., "The Fjelstul World Cup Database", © 2023, CC BY-SA 4.0), openfootball/worldcup (CC0),
Wikidata item ids (CC0). Never FIFA.com, FBref / Sports Reference, Transfermarkt, ESPN or the FIFA game ratings.

    day=$(date +%F); raw=~/Projects/backups/spx-stats/raw/worldcup/$day
    # 1. download (resumable; about 12 minutes, most of it the polite Wikipedia page-property requests)
    python3 -I scripts/worldcup/fetch.py $raw
    # 2. raw archive on DS1, then the Dropbox copy (before anything is loaded)
    python3 -I scripts/archive_raw.py worldcup $raw $day --sql-out archive.sql
    bash scripts/mac/ds1-apply.sh archive.sql --dry-run && bash scripts/mac/ds1-apply.sh archive.sql
    bash scripts/mac/spx-raw-export.sh --check && bash scripts/mac/spx-raw-export.sh
    # 3. legacy load (migration 065, rerunnable: the tables are emptied and refilled), then the core build step (066 first; rerunnable)
    python3 -I scripts/worldcup/load.py $raw --sql-out load.sql
    bash scripts/mac/ds1-apply.sh load.sql --dry-run && bash scripts/mac/ds1-apply.sh load.sql
    bash scripts/mac/ds1-apply.sh db/build/200_worldcup.sql --dry-run && bash scripts/mac/ds1-apply.sh db/build/200_worldcup.sql
    bash scripts/mac/ds1-apply.sh db/checks/070_soccer.sql --dry-run         # no problem rows
    # 4. production only through a data release (see docs/soccer.md for the table list)

`openfootball.py` parses the Football.TXT files; a line it cannot read is printed by `load.py` as `not read:` (today only 1938's cancelled
Sweden-Austria match, which was never played). `load.py` reads PG* variables, or with `--sql-out` writes the SQL for `ds1-apply.sh`.
`DROPBOX_*` variables are not needed: the Dropbox copy is made by `spx-raw-export.sh` from the DS1 archive.

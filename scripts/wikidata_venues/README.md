# Venue names and facts (Wikidata, Wikipedia)

Name history and basic facts (capacity, year opened, owner, surface, roof, address) of every home venue of the five leagues.
Sources: Wikidata items (CC0) and the "Former names" of English Wikipedia infoboxes (CC BY-SA 4.0). Never Sports Reference or ESPN.
Requests use the User-Agent `spx-stats/1.0 (https://spxn.com; john@spxis.com)`, 50 ids or 20 titles per request, one request every 2.5 s.

Tables: `legacy_wikidata_venues.venue` and `.name` (raw, DS1 only, migration 051) feed `core.brand_venue_name` and
`core.brand_venue_info` (migration 052) through `db/build/193_venue_names.sql`; the site reads the views `api.venue_name` and
`api.venue_info`. A name is placed by its years (`from_year`, `until_year`); a name with no year anywhere is left out (holes are fine).
`is_current` marks the Wikidata label now.

## Yearly refresh (run in February, or after a rename is announced)

Names only; no credentials besides DS1. The venue ids come from `legacy_team_brand.team_place`, so refresh the team brand data
first if a club moved. Raw files go outside the repo. On a Mac the DS1 steps go through `scripts/mac/ds1-apply.sh` (dry run first).

    day=$(date +%F); raw=~/Projects/backups/spx-stats/raw/wikidata_venues/$day
    # 1. venue ids (read-only query on DS1 -> one id per line in ids.txt), then the raw files, about 2 minutes
    python3 -I scripts/wikidata_venues/fetch.py --qids ids.txt $raw      # without --qids it reads DS1 itself (PG* variables)
    # 2. raw archive on DS1, then the Dropbox copy
    python3 -I scripts/archive_raw.py wikidata_venues $raw $day --sql-out archive.sql   # or without --sql-out with PG* set
    bash scripts/mac/ds1-apply.sh archive.sql --dry-run && bash scripts/mac/ds1-apply.sh archive.sql
    bash scripts/mac/spx-raw-export.sh --check && bash scripts/mac/spx-raw-export.sh
    # 3. legacy load, then the core build step (both rerunnable)
    python3 -I scripts/wikidata_venues/load.py $raw $day --sql-out load.sql
    bash scripts/mac/ds1-apply.sh load.sql --dry-run && bash scripts/mac/ds1-apply.sh load.sql
    # 3b. postal codes (P281, migration 058): check each code's shape and state or province with address-plus, after load.sql and before 193
    python3 -I scripts/wikidata_venues/postal_check.py <scratch dir> --sql-out postal.sql   # PG* set; npm installs the pinned package in the scratch dir
    bash scripts/mac/ds1-apply.sh postal.sql --dry-run && bash scripts/mac/ds1-apply.sh postal.sql
    bash scripts/mac/ds1-apply.sh db/build/193_venue_names.sql --dry-run && bash scripts/mac/ds1-apply.sh db/build/193_venue_names.sql
    # 4. production only through a data release (AGENTS.md section 8, item 5; John approves at /admin/data)
    python3 -I scripts/release/release.py prepare --title "Venue names and facts $day" --tables core.brand_venue_name,core.brand_venue_info

Postal codes: Wikidata P281 is stored as given (`venue.postal_code`); `postal_check.py` keeps a code in `postal_checked` only when it is a US ZIP or
Canadian postal code, matches the venue's country and belongs to its state or province; otherwise `postal_problem` says why, and the build step
logs it in `meta.data_issue` (`entity_kind = 'venue_postal_code'`) and leaves `core.brand_venue_info.postal_code` empty. No code is ever guessed.

`fetch.py` keeps files already in the folder, so a rerun the same day only fetches what is missing. `load.py` and the build step
delete and refill their tables, so a rename that Wikidata has since removed disappears too (the release shows it as a row to remove).

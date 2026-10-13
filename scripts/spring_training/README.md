# Spring training parks (Cactus League and Grapefruit League, current and past)

Which ballparks major-league clubs trained at in Arizona (`cactus`) and Florida (`grapefruit`), where they are, how big, how far the fences are,
what they were called, and which club trained at each in which years. Rarely changes: refresh once a year (after the spring) or when a club moves.

Sources (English Wikipedia and Wikidata only, through their APIs, one request at a time with a User-Agent naming spx-stats):

- English Wikipedia, "List of Major League Baseball spring training ballparks" (CC BY-SA 4.0, text by the article's editors): the parks, city,
  capacity, and every club with its years. The "Cactus League" and "Grapefruit League" articles are redirects to "Spring training", which holds
  only today's parks, so this list is the history. Revision 1369949030 (2026-08-18) is the one read; the revision is stored on every row.
- Each park's Wikipedia article (infobox): fence distances (`dimensions`) and `former_names`. Revisions in `wikipedia_revision`.
- Wikidata (CC0): coordinates, opened, closed, the city/state/country up the P131 chain, dated official names (P1448).
- gavinr/mlb-spring-training-stadiums (no licence, a 2013 list) was only the idea; nothing is taken from it. Never Sports Reference or ESPN.

Credit lines to show where the data appears: "Spring training ballparks and clubs: English Wikipedia (CC BY-SA 4.0), see the articles' histories;
coordinates and dates: Wikidata (CC0)." (`meta.source` rows `wikipedia` and `wikidata`.)

## Tables

`legacy_spring_training.*` (migration 070, DS1 only): `source_page`, `park_row`, `occupant`, `venue`, `fence`, `park_name`, as read.
`core.spring_training_venue`, `core.spring_training_venue_name`, `core.spring_training_tenant` (production, by data release) are built from them by
`db/build/201_spring_training.sql`, with `db/seed/spring_training_club.csv` mapping the list's club names to franchises. `api.spring_training_venue`
serves one row per park with tenants and names as JSON. A park is a Wikidata item; a ballpark rebuilt on the same site is one park (logged).
Rows of the list outside Arizona and Florida (Hot Springs, Baton Rouge, Long Beach ...) stay in `legacy_spring_training` and are not loaded.
Unknowns go to `meta.data_issue` (`entity_kind` like `spring_training_%`); no year, place or distance is guessed.

## Load order (DS1, through `scripts/mac/ds1-apply.sh`, `--dry-run` first)

The raw files of 2026-10-13 are in `~/Projects/backups/spx-stats/raw/spring_training/2026-10-13/` (1.4 MB). From the repo root:

    day=2026-10-13; raw=~/Projects/backups/spx-stats/raw/spring_training/$day
    python3 -I scripts/archive_raw.py spring_training $raw $day --sql-out archive.sql      # raw archive first
    bash scripts/mac/ds1-apply.sh archive.sql && bash scripts/mac/spx-raw-export.sh        # then the Dropbox copy
    bash scripts/mac/ds1-apply.sh db/migrations/070_spring_training.sql
    python3 -I scripts/spring_training/load.py $raw $day --sql-out load.sql
    bash scripts/mac/ds1-apply.sh load.sql
    bash scripts/mac/ds1-apply.sh db/build/201_spring_training.sql

To refresh: `python3 -I scripts/spring_training/fetch.py <new raw dir>` (a file that exists is kept, so use a new dated folder), then the same
`archive_raw.py`, `load.py` and build step. On production: apply the migration (add-only), then a data release of the three core tables.
A club the list names that `db/seed/spring_training_club.csv` lacks is loaded without a franchise and logged as `spring_training_club`.

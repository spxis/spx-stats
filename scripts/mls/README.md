# Major League Soccer data (soccer)

Design, model, sizes, what is missing: [docs/mls.md](../../docs/mls.md).

Sources, and what each allows:

- **openfootball/world** (`north-america/major-league-soccer/<year>_mls.txt`, 2005-2025): CC0 1.0 (its `LICENSE.md`). Date, score, extra time,
  shootout, half-time, playoff round. No stadium. The 2025 file stops part way through the season (the repository's last commit is 2026-09-23).
  openfootball has no MLS file before 2005, and no stadiums for it.
- **English Wikipedia** season articles (`<year> Major League Soccer season`) and club-season articles (`<year> <club> season`), through the
  MediaWiki API: CC BY-SA 4.0. Tables, leaders, awards, infobox, match boxes (date, score, stadium, city, attendance). One request at a time, at
  least 1.3 s apart, identified User-Agent (`spx-stats/1.0 (https://spxn.com; john@spxis.com)`), backs off on 429/503.
- **Wikidata** item ids (CC0), read from the Wikipedia pages' page properties (`wikibase_item`), also giving the redirect each club link leads to.
- **mlssoccer.com: not used.** Its Terms of Service (https://www.mlssoccer.com/legal/terms-of-service, "As of September 30, 2023") say in
  section 5.2 that a user may not engage "in spidering, screen scraping, database scraping or other such activity" (item i) nor use "browsers,
  spiders, robots, avatars or intelligent agents" "to harvest or otherwise collect information from the Services to be used for any commercial
  purpose" (item vi), and in section 1 that content may not be reproduced, republished, built on, modified, posted or compiled. The terms page was
  read once, by hand, to record this; nothing else on the site was requested. The Wikipedia match boxes carry a link to MLS's match reports and
  to FBref's: those links are neither followed nor stored.
- **Never** FBref / Sports Reference, ESPN, Transfermarkt, NWSL / CPL sites, Kaggle FIFA ratings (AGENTS.md section 3).

Run, in this order (`day` is the folder name; everything is rerunnable and resumable):

    day=$(date +%F); raw=~/Projects/backups/spx-stats/raw/mls/$day
    # 1. download, about 25 minutes (about 900 Wikipedia requests, mostly the 460 club-season articles)
    python3 -I scripts/mls/fetch.py $raw                 # stages: openfootball, seasons, clubs, pageprops (--stage NAME for one)
    # 2. raw archive on DS1, then the Dropbox copy (before anything is loaded)
    python3 -I scripts/archive_raw.py mls $raw $day --sql-out archive.sql
    bash scripts/mac/ds1-apply.sh archive.sql --dry-run && bash scripts/mac/ds1-apply.sh archive.sql
    bash scripts/mac/spx-raw-export.sh --check && bash scripts/mac/spx-raw-export.sh
    # 3. migration 078 (add-only), the legacy load (makes the legacy_mls schema itself), the core build step, the checks
    bash scripts/mac/ds1-apply.sh db/migrations/078_mls.sql --dry-run && bash scripts/mac/ds1-apply.sh db/migrations/078_mls.sql
    python3 -I scripts/mls/load.py $raw --sql-out load.sql
    bash scripts/mac/ds1-apply.sh load.sql --dry-run && bash scripts/mac/ds1-apply.sh load.sql
    bash scripts/mac/ds1-apply.sh db/build/205_mls.sql --dry-run && bash scripts/mac/ds1-apply.sh db/build/205_mls.sql
    bash scripts/mac/ds1-apply.sh db/checks/078_mls.sql --dry-run         # no problem rows
    # 4. production only through a data release (see docs/mls.md for the table list)

Files: `fetch.py` (download), `wikihtml.py` (tables of a rendered page), `season.py` (what a season article gives), `wikibox.py` (match boxes),
`openfootball.py` (the Football.TXT parser; `python3 -I scripts/mls/test_openfootball.py $raw` checks every file's match count against its header),
`load.py` (raw to `legacy_mls`), `scratch.sh` (a local Postgres on port 3130 with the repo's migrations, for trying the build; `down` removes it).
A name the loader cannot place in an MLS club is printed as `unplaced:` and left with a null club (those are other competitions' teams); a line
of an openfootball file it cannot read is printed as `not read:`.
`DROPBOX_*` variables are not needed: the Dropbox copy is made by `spx-raw-export.sh` from the DS1 archive.

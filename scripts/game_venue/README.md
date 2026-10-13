# A venue for every game

`core.game.venue_id` for NHL, NBA, MLB, NFL and CFL games, in two rerunnable build steps:

- `db/build/198_home_venue.sql` makes `core.franchise_home_venue`: where each club played its home games, as periods with no overlap.
  Best source first: `db/seed/home_venue.csv` (English Wikipedia CC BY-SA, or dated Wikidata statements CC0, checked by hand), then
  `core.franchise_brand` (step 175), then `core.franchise_venue` (step 176). Brand and franchise_venue periods are cut to the days their
  venue stood (opened_on to closed_on; `db/seed/venue_dates.csv` corrects Wikidata's dates). Step 199 then puts in the periods the games
  themselves show (basis `games`: the venue most of a club's home games had in a season in the Retrosheet, nflverse and NHL data). A Wikidata item that is a city (San Diego, Houston, Los Angeles,
  Miami: `db/seed/not_a_venue.csv`, plus any brand venue whose label is its city) is never a venue and is logged as `home_venue_city`. A venue
  missing from `core.venue` (step 176 drops a venue with no city) is added from `core.brand_venue` or `legacy_game_venue.venue`.
- `db/build/199_game_venue.sql` works out the venue of every game of the five leagues, best source first: an event row (`db/seed/game_venue_event.csv`:
  Super Bowl, Grey Cup, bubbles, games abroad, a club that moved for a season), the Retrosheet park id (MLB, `db/seed/retrosheet_park.csv`), the
  nflverse stadium (NFL 1999 on, CC BY 4.0), the NHL API venue (NHL), else the home club's venue that day. It does **not** write
  `core.game.venue_id` (production cannot take a rewrite of 380,000 rows). It writes `core.game_venue`: only the games whose venue differs from the
  home club's period that day, every event and neutral-site game, and the games it knows no venue for where the period would name one
  (`venue_id` null, basis `unknown`). A game with no row is held at the venue of its home club's period (`core.franchise_home_venue`).
  `api.game_venue` gives every game its venue; `api.venue_game` lists the games held at a venue (filter on `venue_id`; one index lookup per team season);
  `core.game_venue_of(game_id)` is the same answer as a function (migration 075).
  Names from nflverse and the NHL are matched to venues by `db/seed/venue_alias.csv`, else by any name `core.venue_name`, `core.brand_venue_name`,
  `core.brand_venue` or `legacy_game_venue.venue` holds. It also sets `is_neutral_site`, `neutral_site_reason` and `is_international` on the few
  hundred games an event row or a venue abroad changes, and remembers the old values in `legacy_game_venue.filled` so a rerun restores them first.
  What it cannot place is logged in `meta.data_issue` as `game_venue_none`, `game_venue_park`, `game_venue_name` and `game_venue_event`. Nothing is guessed.

Credits: Retrosheet (park list and game logs): "The information used here was obtained free of charge from and is copyrighted by Retrosheet.
Interested parties may contact Retrosheet at www.retrosheet.org." nflverse: CC BY 4.0. Wikidata: CC0. Wikipedia: CC BY-SA 4.0 (text by the
articles' editors). NHL: the NHL's public web API, credited "NHL". Never Sports Reference or ESPN.

## Load order (DS1, through `scripts/mac/ds1-apply.sh`, `--dry-run` first)

The raw files of 2026-10-13 are in `~/Projects/backups/spx-stats/raw/game_venue/2026-10-13/` (Wikidata items, Retrosheet's `ballparks.csv`, the
NHL API's venue strings). From the repo root:

    day=2026-10-13; raw=~/Projects/backups/spx-stats/raw/game_venue/$day
    python3 -I scripts/archive_raw.py game_venue $raw $day --sql-out archive.sql      # raw archive first
    bash scripts/mac/ds1-apply.sh archive.sql && bash scripts/mac/spx-raw-export.sh   # then the Dropbox copy
    bash scripts/mac/ds1-apply.sh db/migrations/067_game_venue.sql && bash scripts/mac/ds1-apply.sh db/migrations/073_game_venue_games.sql
    bash scripts/mac/ds1-apply.sh db/migrations/075_game_venue_table.sql
    python3 -I scripts/retrosheet/parks.py $raw/retrosheet/ballparks.csv --sql-out parks.sql
    python3 -I scripts/game_venue/load.py $raw $day --sql-out venues.sql
    bash scripts/mac/ds1-apply.sh parks.sql && bash scripts/mac/ds1-apply.sh venues.sql
    bash scripts/mac/ds1-apply.sh db/build/198_home_venue.sql && bash scripts/mac/ds1-apply.sh db/build/199_game_venue.sql

To add venues to a seed: `python3 -I scripts/game_venue/ids.py > ids.txt`, then `python3 -I scripts/game_venue/fetch.py ids.txt $raw`
(keeps the batches it already has), `load.py` again, and the two build steps. `db/seed/venue_city.csv` corrects a city Wikidata gets wrong
(a London borough, a county, no city at all) for these venues too; for an old ballpark with no usable city the step takes the city and state
of Retrosheet's park list.

`db/checks/062_game_venue.sql` must stay at 0: no game has a venue that had not opened, or had closed, more than 30 days before the game, and no
brand or franchise_venue period runs outside its venue's days.

A seed row that cannot be used (unknown club name, venue not in `core.venue`) is logged as `home_venue_seed` or `game_venue_event` and skipped.
The Wikipedia pages the seed rows cite were read by hand (the URL of each is in the row); they are not archived.

World Cup and MLS stadiums, and kyogijo's famous grounds, use this same path: `db/seed/soccer_venue_ids.csv` is read by `ids.py` (`ids.py --new <raw dirs>` lists only the items no
earlier fetch holds), `fetch.py` and `load.py` run as above, and step 198 adds the venues. See `scripts/world_stadiums/README.md`.

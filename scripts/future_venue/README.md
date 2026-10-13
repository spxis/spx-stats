# Future venues (announced, approved or under construction)

Stadiums and arenas planned for a club of the five leagues (NHL, NBA, MLB, NFL, CFL): the "Future" tab of a venue site. Changes a few times a year
(a vote, a groundbreaking, a new plan): refresh every month or two, or when a club announces a venue.

Sources (English Wikipedia and Wikidata only, through their APIs, one request at a time with a User-Agent naming spx-stats; never Sports Reference or ESPN):

- English Wikipedia (CC BY-SA 4.0, text by the articles' editors), the "future" table(s) of each league's venue list: NFL "List of current National
  Football League stadiums" (Future: Under construction, Proposed), MLB "List of Major League Baseball stadiums" (Future ballparks), NBA "List of National
  Basketball Association arenas" (Future or proposed arenas), NHL "List of National Hockey League arenas" (Future and proposed arenas), CFL "List of
  Canadian Football League stadiums" (Potential future stadiums). These lists decide which venues are future and whether one is under construction.
  The revision of every page read is stored (`legacy_future_venue.source_page`, and on each core row).
- Each venue's own article (infobox: groundbreaking, opening, capacity, coordinates; lead: "will replace ...").
- Wikidata (CC0): coordinates, capacity, places, "replaces" (P1365), dates, state of use (P5817). Wikidata alone cannot find these venues (checked
  2026-10-13: none of the 17 future venues below carries state of use, and the only US or Canadian sports-venue item that does is McDonald's Park in
  Chicago, which no league list names; `legacy_future_venue.wikidata_state` keeps that query's result for a later look). So Wikidata fills in; it does not decide.

Credit lines to show where the data appears: "Future venues: English Wikipedia (CC BY-SA 4.0), see the articles' histories; coordinates and dates:
Wikidata (CC0)." (`meta.source` rows `wikipedia` and `wikidata`.)

## Rules

- `status`: `under_construction` = the venue is in the list's "Under construction" table. `proposed` = in "Proposed". `approved` only where a sentence of the
  venue's own Wikipedia article says it was approved: `db/seed/future_venue_status.csv` holds the sentence (shown as `status_note`). Today: the
  Commanders' RFK stadium (DC Council vote) and the Rays' Tampa stadium (Tampa City Council vote, 27 August 2026). Add a row when an article says so.
- Planned year and opening text are the source's words (`2027`, `June 2028 (planned)`, `TBD`); a plan is not a promise, and a year of `TBD` stays empty.
  The list's year wins over the article's and Wikidata's; a disagreement is logged (`future_venue_opening`).
- A shared arena is one venue with two club rows (the new South Philadelphia arena: 76ers and Flyers). `venue_key` is `wikidata:Q...`, or
  `wikipedia-list:<league>:<name>` for a list row that has neither an article nor a Wikidata item with exactly that label (Mavericks, Spurs, Stars).
- A list row with no club (the CFL's Halifax and Quebec City candidates, 2026-10-13) is not loaded; it is logged (`future_venue_club`) and stays in
  `legacy_future_venue.list_row`.
- A Wikidata item that is another thing is ignored, with the reason in `load.py` (`IGNORE_ITEM`) and a data issue: Scotia Place's article is linked to
  Q21413764, which is CalgaryNEXT (2015 plan, inception 2012).
- Clubs: `db/seed/future_venue_club.csv` maps the club as the list writes it (the Athletics are "Las Vegas Athletics") to the current identity in
  `core.franchise_identity`; no exact single match gives a null `franchise_id` and a data issue (`future_venue_club`).
- Every unknown goes to `meta.data_issue` (`entity_kind` like `future_venue_%`); no year, place or distance is guessed.

## Tables

`legacy_future_venue.*` (migration 074, DS1 only): `source_page`, `list_row`, `list_club`, `article`, `wikidata_venue`, `wikidata_state`, as read.
`core.future_venue` and `core.future_venue_club` (production, by data release) are built from them by `db/build/203_future_venue.sql`.
`api.future_venue` serves one row per venue with its clubs and leagues as JSON (anon and authenticated may select).

## When a future venue opens

It moves to the normal venue tables by hand, with a source, in a later change: add it to `core.venue` and `core.franchise_home_venue` the way the
game-venue steps (`db/build/198`, `199`) do, keep its Wikidata id, then delete its rows here (`delete from core.future_venue where venue_key = ...`; the club
rows go with it) and from the seed files if nothing else needs them. After the next refresh the build step also drops a venue that is no longer in a
league list's future tables on its own, so a refresh right after an opening needs no manual delete here. Highmark Stadium (Bills) is the latest example:
the NFL list (revision 1379044883) now has it among the current stadiums (opened for the 2026 season), so it is not in this table.

## Load order (DS1, through `scripts/mac/ds1-apply.sh`, `--dry-run` first)

The raw files of 2026-10-13 are in `~/Projects/backups/spx-stats/raw/future_venue/2026-10-13/` (0.8 MB). From the repo root:

    day=2026-10-13; raw=~/Projects/backups/spx-stats/raw/future_venue/$day
    python3 -I scripts/archive_raw.py future_venue $raw $day --sql-out archive.sql      # raw archive first
    bash scripts/mac/ds1-apply.sh archive.sql && bash scripts/mac/spx-raw-export.sh        # then the Dropbox copy
    bash scripts/mac/ds1-apply.sh db/migrations/074_future_venue.sql
    python3 -I scripts/future_venue/load.py $raw $day --sql-out load.sql
    bash scripts/mac/ds1-apply.sh load.sql
    bash scripts/mac/ds1-apply.sh db/build/203_future_venue.sql

To refresh: `python3 -I scripts/future_venue/fetch.py <new raw dir>` (a file that exists is kept, so use a new dated folder), then the same `archive_raw.py`,
`load.py` and build step. On production: apply the migration (add-only), then a data release of the two core tables
(`release.py prepare --title "Future venues" --tables core.future_venue,core.future_venue_club`). About 17 venues and 18 club rows: far under 1 MB.

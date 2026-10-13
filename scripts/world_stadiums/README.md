# World soccer stadiums

Every stadium a `core.soccer_match` names (World Cup men's 1930-2026 and women's, MLS 1996-2026) plus kyogijo's 64 famous grounds become rows of
`core.venue` / `core.venue_name` through the one venue path that already exists (`scripts/game_venue/`, then `db/build/198_home_venue.sql`). Nothing here
loads venues a second way. Two more pieces: the pitch size where English Wikipedia's infobox publishes it, and `core.soccer_match.venue_id`.

| Piece | File | What it does |
|---|---|---|
| The list | `db/seed/soccer_venue_ids.csv` (`derive_ids.py`) | 336 Wikidata items: 231 World Cup 1930-2022, 16 for 2026, 102 MLS, 64 kyogijo, 4 corrections (some in several). Read by `scripts/game_venue/ids.py` |
| Corrections | `db/seed/soccer_venue_fix.csv` | a link in the soccer data that led to the wrong item (a city, a disambiguation page, a bank, a competition) and the right item. `db/seed/not_a_venue.csv` keeps the wrong item out of `core.venue` |
| Cities | `db/seed/venue_city.csv` | the usual correction file of step 198, 59 new rows (cities Wikidata does not give, municipalities and boroughs replaced by the city) |
| Venues | `legacy_game_venue.venue` -> `db/build/198_home_venue.sql` | unchanged. A venue already in `core.venue` (BC Place, BMO Field, Lumen Field, Gillette ...) is found by its Wikidata id (`source_key`) and never added twice |
| Pitch sizes | `db/migrations/079_venue_pitch.sql`, `db/seed/venue_pitch.csv`, `db/build/206_world_venue.sql` | `core.venue_pitch` (177 rows) and `api.venue_pitch` |
| The check | `db/build/206_world_venue.sql`, `db/checks/079_world_venue.sql` | an item of the list that is not in `core.venue` is a `meta.data_issue` row (`world_venue`) with the reason |
| The fill | `db/build/207_soccer_match_venue.sql` | `core.soccer_match.venue_id` by `venue_wikidata_id`, only where null; the only column of `core.soccer_*` it writes. Apply it LATER, see below |

## Sources

- Wikidata (CC0): the items, coordinates, capacity, opened and closed dates, the places up the P131 chain (`scripts/game_venue/fetch.py`, one request per 2.5 s,
  User-Agent `spx-stats/1.0 (https://spxn.com; john@spxis.com)`).
- English Wikipedia (CC BY-SA 4.0, text by the articles' editors): the infobox `dimensions` of each stadium, the article revision cited in
  `core.venue_pitch.wikipedia_key` (`enwiki:<title>@<revision id>`). 42 sizes are kyogijo's own readings at its revisions (`grounds.data.json`, not fetched
  again); the other 135 are read by `pitch_size.py`: exactly one "length x width" pair, in metres, yards or feet, that a football pitch can have (length
  90-120 m, width 50-90 m). A range, several sizes, a baseball outfield or a stadium with no size gets no row. `international` is true when the size is within
  Law 1's 100-110 x 64-75 m.
- jfjelstul/worldcup (CC BY-SA 4.0), openfootball (CC0) and the MLS Wikipedia articles name the stadiums (already credited by `docs/soccer.md` and `docs/mls.md`).
- Never FIFA.com or any of the sources AGENTS.md section 3 forbids.

## Commands

Raw files: `~/Projects/backups/spx-stats/raw/world_stadiums/2026-10-13/` (`wikidata/` the items and places of `fetch.py`, `wikipedia/` the articles of
`fetch_wikipedia.py`, `kyogijo/grounds.data.json`). From the repo root:

    wc=~/Projects/backups/spx-stats/raw/worldcup/2026-10-13; mls=~/Projects/backups/spx-stats/raw/mls/2026-10-13
    raw=~/Projects/backups/spx-stats/raw/world_stadiums/2026-10-13; old=~/Projects/backups/spx-stats/raw/game_venue/2026-10-13
    kyo=~/Projects/kyogijo/scripts/grounds.data.json
    python3 -I scripts/world_stadiums/derive_ids.py $wc $mls $kyo > db/seed/soccer_venue_ids.csv      # the list, from the raw files of the soccer loads
    python3 -I scripts/game_venue/ids.py --new $raw $old > ids.txt                                    # only the items not fetched yet
    python3 -I scripts/game_venue/fetch.py ids.txt $raw                                                # Wikidata, politely
    python3 -I scripts/world_stadiums/fetch_wikipedia.py $raw $kyo $raw $old                          # the stadium articles (not kyogijo's 42)
    python3 -I scripts/world_stadiums/pitch_size.py $raw $kyo > db/seed/venue_pitch.csv                # the sizes (stderr lists what it left out)
    python3 -I scripts/game_venue/load.py $raw 2026-10-13 --sql-out venues.sql                         # legacy_game_venue.venue, upsert by Wikidata id

## Apply order on DS1 (`bash scripts/mac/ds1-apply.sh <file> [--dry-run]`)

(a) Now, the stadiums:

    day=2026-10-13; raw=~/Projects/backups/spx-stats/raw/world_stadiums/$day
    python3 -I scripts/archive_raw.py world_stadiums $raw $day --sql-out archive.sql      # raw archive first (about 20 MB of SQL)
    bash scripts/mac/ds1-apply.sh archive.sql && bash scripts/mac/spx-raw-export.sh       # then the Dropbox copy
    bash scripts/mac/ds1-apply.sh db/migrations/079_venue_pitch.sql
    python3 -I scripts/game_venue/load.py $raw $day --sql-out venues.sql
    bash scripts/mac/ds1-apply.sh venues.sql --dry-run && bash scripts/mac/ds1-apply.sh venues.sql
    bash scripts/mac/ds1-apply.sh db/build/198_home_venue.sql      # adds the venues to core.venue / core.venue_name; rebuilds franchise_home_venue
    bash scripts/mac/ds1-apply.sh db/build/199_game_venue.sql      # always after 198 (it puts back the periods the games show)
    bash scripts/mac/ds1-apply.sh db/build/206_world_venue.sql     # pitch sizes and the world_venue issues
    bash scripts/mac/ds1-apply.sh db/checks/062_game_venue.sql --dry-run    # must stay 0
    bash scripts/mac/ds1-apply.sh db/checks/079_world_venue.sql --dry-run   # must print no problem rows

Production: migration 079 first (add-only), then a data release of `core.venue, core.venue_name, core.venue_pitch, core.franchise_home_venue, core.game_venue,
meta.data_issue`, in that order of dependence (see AGENTS.md section 8, item 5).

(b) Later, only after the World Cup and MLS releases are on production (a `core.soccer_match` release carries `venue_id`, and a venue id that production's
`core.venue` lacks would break it):

    bash scripts/mac/ds1-apply.sh db/build/207_soccer_match_venue.sql --dry-run && bash scripts/mac/ds1-apply.sh db/build/207_soccer_match_venue.sql
    bash scripts/mac/ds1-apply.sh db/checks/079_world_venue.sql --dry-run

then a data release of `core.soccer_match` (and `meta.data_issue`). The last query of the step prints, per league, the matches, those with a venue, those whose
Wikidata id has no venue and those whose source gave no Wikidata id (`meta.data_issue` `soccer_match_venue` names each one).

## Known gaps

- MLS match boxes that name a stadium without a link have no `venue_wikidata_id`; their `venue_id` stays null and each stadium name is a `soccer_match_venue`
  issue. That is fixed in the MLS build (db/build/205_mls.sql), not here. A few links in the soccer data point at a club, a city or a disambiguation page
  (Sporting Kansas City, Real Salt Lake, Kansas City, "Olympic Stadium"): those matches also stay null.
- `scripts/game_venue/load.py` no longer takes "city in the United States" for a state (its test for "state" matched the word inside "United States"), so
  a rerun for the older raw files gives some venues a city that they had as null on 2026-10-13; `db/seed/venue_city.csv` still wins.

# Venue names and facts (Wikidata, Wikipedia)

Name history and basic facts (capacity, year opened, owner, surface, roof, address) of every home venue of the five leagues.
Sources: Wikidata items (CC0) and the "Former names" of English Wikipedia infoboxes (CC BY-SA 4.0). Never Sports Reference or ESPN.
Requests use the User-Agent `spx-stats/1.0 (https://spxn.com; john@spxis.com)`, 50 ids or 20 titles per request, one request every 2.5 s.

Tables: `legacy_wikidata_venues.venue`, `.name` and `.fact` (raw, DS1 only, migrations 051 and 089) feed `core.brand_venue_name` and
`core.brand_venue_info` (migration 052) through `db/build/193_venue_names.sql`; the site reads the views `api.venue_name` and
`api.venue_info`. A name is placed by its years (`from_year`, `until_year`); a name with no year anywhere is left out (holes are fine).
`is_current` marks the Wikidata label now.

## Surface, roof, opening and closing (migration 089)

- **Surface** is one of `ref.venue_surface` (grass, artificial, hybrid, ice, wood, multi, other). `ref.venue_surface_rule` (from `db/seed/venue_surface_rule.csv`: the lowest
  rank whose regular expression finds the text wins) maps what a source says ("AstroTurf 3D Xtreme", "Kentucky bluegrass") to it; several statements that map to different
  values are `multi`; a text no rule covers gets no value, stays in `core.brand_venue_info.surface_raw` and is logged (`meta.data_issue` `venue_surface`). Add a rule, never a guess.
  Step `211_venue_surface.sql` puts the same list on `core.venue.surface` and `core.venue_feature.surface`.
- **Periods** (`core.brand_venue_period`): a surface or a roof for the years a source dates it, from the infobox lines `AstroTurf (1989-2004)<br>FieldTurf (2005-2010)`
  (`legacy_wikidata_venues.fact`, loaded by `load.py`), else Wikidata P765 with start and end time. `db/seed/venue_period.csv` (checked by hand against a cited article revision)
  replaces the computed rows of its venue and kind. The surface now in `core.brand_venue_info` is the open-ended or latest period, else the infobox's first undated line, else Wikidata's
  (its statements carry no years and list old surfaces too: Oakland Coliseum, Lambeau Field). Roof: the periods, else Wikidata's type, else the infobox, else the roof the first paragraph of
  the article names ("a multi-purpose retractable roof stadium"). Anything from the English Wikipedia is marked in `wikipedia_fields` with the revision in `wikipedia_key` (CC BY-SA 4.0).
- **Closing**: Wikidata P3999 else P576, else the infobox `closed` when it is one clean date (a renovation, a temporary closing, a range or two dates are refused and logged,
  `venue_closed`), else the first year of `demolished`. `core.brand_venue_info.status` is `closed` (a year is known), `demolished` (a source says it is gone, no year; logged) or `open` (neither
  source records a closing: the building stands, or the sources do not say otherwise; whether a club plays there is in `core.franchise_home_venue`).
- `db/seed/venue_fact.csv` (hand-checked, cites the article revision) sets a capacity, opening or closing year the sources lack or get wrong, and lists claims no source supports
  (`unsourced`, logged, not used). A hole is logged, never filled by a guess.
- A city is not a venue: step 175 gives a club item that has no home venue statement (only its headquarters city) the venues of `db/seed/home_venue.csv`, step 176 keeps no city item in
  `core.brand_venue`, and `db/checks/063_venue_city.sql` must find none.

One-off for a folder loaded before migration 089 (it leaves the names and the postal checks alone):

    python3 -I scripts/wikidata_venues/load.py $raw $day --facts-only --sql-out facts.sql
    bash scripts/mac/ds1-apply.sh db/migrations/089_venue_period.sql && bash scripts/mac/ds1-apply.sh facts.sql
    # then 175, 176_venue_place, 193, 198, 199, 206, 207, 211, 197, 203, 204 and 209 in order

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
    python3 -I scripts/release/release.py prepare --title "Venue names and facts $day" --tables core.brand_venue_name,core.brand_venue_info,core.brand_venue_period,ref.venue_surface,ref.venue_surface_rule

Street addresses: `193_venue_names.sql` takes `legacy_franchise_info.place.address_street`, then Wikidata P6375 (`venue.address`), then P669 street with the
P670 house number (`venue.street_address`, the street names are in `wikidata/streets-*.json`), then the street line of the English Wikipedia infobox's
address or location field (`venue.wp_address`: a house number and street, or two crossing streets; an area or a corner description gives none). An
address from the infobox is marked in `core.brand_venue_info.wikipedia_fields` (`address`). A venue with none stays empty.

Home venue mapping: `db/build/175_team_brand.sql` gives a team the venues Wikidata dates; venues with no dates take the years of the venue itself
(opened to closed), and a club item of another era (its `inception` and `dissolved`) gives an identity of the same name no venue. A statement known to
be wrong is left out through `db/seed/venue_fix.csv` (team item, venue item, why) and logged in `meta.data_issue` (`team_home_venue`).

Postal codes: Wikidata P281 is stored as given (`venue.postal_code`); `postal_check.py` keeps a code in `postal_checked` only when it is a US ZIP or
Canadian postal code, matches the venue's country and belongs to its state or province; otherwise `postal_problem` says why, and the build step
logs it in `meta.data_issue` (`entity_kind = 'venue_postal_code'`) and leaves `core.brand_venue_info.postal_code` empty. No code is ever guessed.

`fetch.py` keeps files already in the folder, so a rerun the same day only fetches what is missing. `load.py` and the build step
delete and refill their tables, so a rename that Wikidata has since removed disappears too (the release shows it as a row to remove).

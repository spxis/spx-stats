# Cities (the city pages, `/city/<slug>` and `/cities`)

Which club played in which city in each season is **data**, decided by rules and seed files, not by code in the site.
Tables: `ref.metro`, `ref.city`, `ref.city_alias` (all three from `db/seed/*.csv`) and `core.team_season_city`
(worked out by `db/build/197_city.sql`); views `api.city` and `api.team_season_city` (migration 061). The site adds the
seasons up (`web/src/lib/cityModel.ts`, tested by `pnpm test:city`).

## Seed files (`db/seed/`)

| File | What | Source |
|---|---|---|
| `city.csv` | one row per city page: slug, name, French name where it differs, ISO 3166-2 region, country, metro, note | editorial; the list is every place in the data (club locations and venue towns) |
| `city_place.csv` | each city's Wikidata item and coordinates | Wikidata (CC0), made by `fetch.py` and `make_seed.py` below |
| `city_alias.csv` | every spelling in the data and the city it means (`Montréal`, `Montreal` -> montreal; `Brooklyn` -> new-york) | editorial |
| `metro.csv` | metro areas: a name for cities that make up one urban area | editorial |
| `place_region.csv` | the state or province a region-name stands in (`Golden State` -> US-CA), used only to find a venue | editorial |

## How a team season gets its city (`197_city.sql`)

1. **identity**: the city in the club's name that season (`core.franchise_identity.location`) when `city_alias.csv` knows the
   name. The name wins over the venue: the New York Giants play in East Rutherford and are a club of New York; the Anaheim
   Angels of 1997-2004 are a club of Anaheim, the Los Angeles Angels of 1961-65 and 2005- of Los Angeles.
2. **venue**: else, a club whose name has no city (Minnesota, Golden State, Tampa Bay, BC) takes the city of the home venue whose
   brand era covers the end of the season (the rule the site's maps use).
3. **venue_nearest**: else the nearest era with a venue in the same state or province (so California Angels 1966-96 are in Anaheim).
   `core.team_season_city.basis` says which rule applied, and the venue itself is kept for the map.
4. Anything else is **not placed**: left off the city pages and logged in `meta.data_issue` (`entity_kind = 'city_unplaced'`).
   No city is guessed. A name with no row in `city_alias.csv` that is a real city is added to the file; a region is left alone.

## Decisions (change them in the CSVs, then rebuild)

- **Brooklyn, Manhattan, the Bronx, New York City are New York.** Brooklyn was a separate city until 1898; here the borough
  is part of the city page, and the club keeps its own name (Brooklyn Dodgers) on it.
- **Metro areas group, they do not merge.** Every town keeps its own page (`/city/anaheim`, `/city/oakland`, `/city/san-francisco`).
  A city page lists the clubs of the city itself, then the clubs "elsewhere in the area"; the map shows the whole area's venues; the
  ranking shows the city and the metro area side by side. Anaheim, Inglewood and Carson are in the Los Angeles area; East Rutherford,
  Newark, Uniondale and the other New Jersey and Long Island towns in the New York area; San Francisco, Oakland, San Jose and Santa Clara in the Bay Area
  (two pages, one metro). A town is put in a metro area only when a club of the five leagues played there and it is part of the
  same urban area on any map (the same US Census metropolitan area, Statistics Canada's census metropolitan area).
- **Washington** (the name alone) is Washington, D.C.: no club of the five leagues has played in another Washington.
- **Vegas** is Las Vegas; **L.A. Lakers**, **Los Angeles Rams** (SPX writes the club into the location) are Los Angeles.
- **Quebec City** is `quebec-city`, **Montreal** is `montreal` (French display names Québec and Montréal).
- Non-league clubs that appear as team seasons without a record (the PCHA's Vancouver Millionaires and Seattle Metropolitans, who met the
  NHL champion in the Cup final) are shown with their seasons and "no record in the archive"; they have no win share.

## Rank method (shown on every city page)

Titles = championships won while the club was in the city. Rate = titles per 100 club seasons. Winning share = every club's wins
and ties over games decided there (a tie counts half a win, an overtime loss is a loss). Rate and share are ranked only for places
with at least 100 club seasons. Ties share a rank. A metro area adds up its cities.

## Refresh (rare: a new club, a move, a new venue town)

Run from the repo root. Raw files go outside the repo; DS1 steps go through `scripts/mac/ds1-apply.sh` (dry run first).

    day=$(date +%F); raw=~/Projects/backups/spx-stats/raw/wikidata_city/$day
    python3 -I scripts/city/fetch.py $raw                       # about 25 minutes: one request each 2.5 s plus the query
    python3 -I scripts/city/make_seed.py $raw                   # writes db/seed/city_place.csv; read the CHECK lines
    python3 -I scripts/archive_raw.py wikidata_city $raw $day --sql-out archive.sql
    bash scripts/mac/ds1-apply.sh archive.sql --dry-run && bash scripts/mac/ds1-apply.sh archive.sql
    bash scripts/mac/spx-raw-export.sh --check && bash scripts/mac/spx-raw-export.sh     # the Dropbox copy
    bash scripts/mac/ds1-apply.sh db/migrations/061_city.sql --dry-run    # once
    bash scripts/mac/ds1-apply.sh db/build/197_city.sql --dry-run && bash scripts/mac/ds1-apply.sh db/build/197_city.sql
    # production only through a data release (AGENTS.md section 8; John approves at /admin/data), after the migration is applied there:
    python3 -I scripts/release/release.py prepare --title "Cities" --tables ref.metro,ref.city,ref.city_alias,core.team_season_city

`fetch.py` matches the English label inside the state or province by the ISO 3166-2 code (P300 of an administrative area the item is
located in, P131), among human settlements. `make_seed.py` takes the item when there is one, or the one with five times the population
of the next; every other case is printed as `CHECK` and left out, never guessed.

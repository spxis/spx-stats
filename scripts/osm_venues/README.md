# Venue outlines, pitches and bearings (OpenStreetMap, ODbL)

For each home venue (and the World Cup stadiums): the stadium outline, the playing fields inside it with their sport, the field's bearing, and a
mapped baseball outfield wall. Source: OpenStreetMap through the Overpass API, **(c) OpenStreetMap contributors, ODbL 1.0, openstreetmap.org/copyright**
(John approved it on 2026-10-13). No tile server, and the site never calls Overpass: the data is extracted here, kept in our database, and drawn from it.

## Licence: keep it apart

ODbL is share-alike. Everything derived from these elements is ODbL data, so:
- It lives only in `legacy_osm.*` (raw, DS1 only) and `core.brand_venue_osm` (migration 077), and is never copied into a CC0 table (`core.brand_venue_info`,
  `brand_venue_name`, ...). Every row carries `licence = 'ODbL-1.0'`, `source_id` of `meta.source` code `openstreetmap`, `source_key` `osm:<type>/<id>@v<version>`
  and `external_id` `<type>/<id>`.
- Credit line, wherever the data is shown or republished: `(c) OpenStreetMap contributors, ODbL 1.0, openstreetmap.org/copyright` (link the last part).
  `api.venue_osm` returns it in its `attribution` column.
- A published copy of the derived data is an ODbL "Derivative Database" and must be offered under the ODbL with the credit line. Publish
  `venues-osm.geojson` (`load.py --geojson-out`; it carries the licence and credit in the file) wherever the data is offered, for example `web/public/data/`.
  A map or a drawing made from it (a "Produced Work") needs only the credit.
- Mixing with our own data in a database (a join in a query) is not a derivative; copying OSM geometry into a non-ODbL table or file is.

## Rules the extraction follows (load.py has the exact code)

- **Footprint.** A closed way or multipolygon tagged `wikidata=<venue id>` (`leisure=stadium` first, then `building=stadium`, then the largest); else a
  `leisure=stadium` or `building=stadium` polygon with no Wikidata tag that holds our coordinates, or lies within 150 m with no other candidate within
  100 m of it, or shares a word with the venue's name (one such candidate only, within 400 m). A polygon tagged with another Wikidata item is another venue.
  `matched_by` is `wikidata` or `proximity`, `distance_m` is metres from our coordinates to the outline (0 = inside).
- **Pitches.** `leisure=pitch` or `ice_rink` polygons with sport baseball, american_football, canadian_football, soccer, ice_hockey or basketball whose
  centre lies inside the footprint (`matched_by = inside_footprint`); with no footprint, one holding our coordinates or within 60 m (`proximity`).
- **Bearing**, degrees clockwise from north.
  - Baseball (`bearing_kind = home_to_center`, 0-360): from home plate to centre field. The pitch polygon must be fan-shaped: two straight runs of
    edges (consecutive edges turning by at most 6 degrees count as one run) each at least 60 m long and within a factor 1.5 of each other, whose lines
    cross at 90 degrees (+-8); the crossing point is home plate (`ref_lat`, `ref_lon`; it may be a cut-off corner, so it need not be a vertex, but it must
    lie within 5 m of the polygon), and every vertex lies inside the wedge between the two lines. The bearing halves that wedge; the polygon's centre must
    lie within 25 degrees of it, its farthest point at least 50 m from home plate (`length_m`) and its area at least half the quarter circle of that radius.
    Two different answers, or none, give no bearing. Most mapped ballparks are not fan-shaped (the grass is drawn with the stands or the dirt cut out), so
    on 2026-10-13 only 2 of 50 baseball pitches qualified (Rogers Centre, Atlanta-Fulton County Stadium). Looser rules gave wrong answers (two parks 180
    degrees off), so they were not used; a hand-checked bearing per park, or a fan-shaped polygon added to OSM, is the way to fill the rest.
  - Everything else (`long_axis`, 0-180; 90 is east-west): the long side of the smallest rectangle that encloses the pitch polygon; `length_m`, `width_m` are
    its sides. A pitch within 10 percent of square gets no bearing.
- **Wall.** A `barrier=wall|fence|retaining_wall` way with `sport=baseball|softball` within 200 m of a baseball pitch's home plate. Often not mapped.
- Geometry is simplified to 1 m and written with 6 decimals. The raw responses (and `legacy_osm.element`) keep everything as OSM returned it.
- **Unknowns** (no outline, no pitch, no bearing, and for MLB venues no baseball bearing) go to `meta.data_issue` with `entity_kind = 'venue_osm'`
  (rebuilt each run); the reason is in `legacy_osm.verdict`.

## Overpass politeness

Policy (wiki.openstreetmap.org/wiki/Overpass_API): one-off use is fine under 10,000 queries and 1 GB a day and 10 minutes of processing in all; regular use should
divide that by 100. This is a yearly run: one request at a time, 8 s apart, a User-Agent naming spx-stats and john@spxis.com, 429/406 wait at least 30 s,
502/503/504 wait longer each time. One wikidata request per 40 venues and one search of a 400 m box round each venue per 4 venues: about 130
requests and 30-50 MB for 460 venues. If the gateway overpass-api.de answers 504 to everything (it did on 2026-10-13), set
`OVERPASS_URL=https://lambert.openstreetmap.de/api/interpreter`, the endpoint its own `/api/status` announces; same service, same policy.
Never run it twice in a day or from two places at once; a rerun only fetches files that are missing.

## Run it (yearly, or when venues are added)

Raw files go outside the repo. DS1 steps go through `scripts/mac/ds1-apply.sh` (dry run first). Migrations 076 and 077 once (077 also on production, before any release).

    day=$(date +%F); raw=~/Projects/backups/spx-stats/raw/osm_venues/$day
    # 1. the venues we hold come from production's public api.venue_place; add the world stadiums (ids from DS1, coordinates from Wikidata)
    psql -At -c "select distinct venue_wikidata_id from core.soccer_match where venue_wikidata_id is not null" > wc-qids.txt     # PG* for DS1
    python3 -I scripts/osm_venues/fetch.py $raw --extra-qids wc-qids.txt            # one to two hours; resumable
    # 2. raw archive on DS1, then the Dropbox copy
    python3 -I scripts/archive_raw.py osm_venues $raw $day --sql-out archive.sql
    bash scripts/mac/ds1-apply.sh archive.sql --dry-run && bash scripts/mac/ds1-apply.sh archive.sql
    bash scripts/mac/spx-raw-export.sh --check && bash scripts/mac/spx-raw-export.sh
    # 3. migrations, load, build
    bash scripts/mac/ds1-apply.sh db/migrations/076_legacy_osm.sql && bash scripts/mac/ds1-apply.sh db/migrations/077_venue_osm.sql
    python3 -I scripts/osm_venues/load.py $raw $day --sql-out load.sql --geojson-out venues-osm.geojson
    bash scripts/mac/ds1-apply.sh load.sql --dry-run && bash scripts/mac/ds1-apply.sh load.sql
    bash scripts/mac/ds1-apply.sh db/build/204_venue_osm.sql --dry-run && bash scripts/mac/ds1-apply.sh db/build/204_venue_osm.sql
    bash scripts/mac/ds1-apply.sh db/checks/061_venue_osm.sql --dry-run             # must print no problem rows
    # 4. production only through a data release (AGENTS.md section 8, item 5; John approves at /admin/data), after migration 077 is on production
    python3 -I scripts/release/release.py prepare --title "Venue outlines (OpenStreetMap) $day" --tables core.brand_venue_osm

`meta.source` gets its OpenStreetMap row from migration 077. If `source_id` for `openstreetmap` differs between DS1 and production, include `meta.source`
in the release tables.

## Size

Raw responses a few MB to tens of MB (about 40 KB per venue); `legacy_osm.element` holds the same geometry as text, so expect the same again on DS1. The
production table holds only simplified geometry: a few hundred rows, about 1 MB with its index.

# Venue names and facts (Wikidata, Wikipedia)

Name history and basic facts (capacity, year opened, owner, surface, roof, address) of every home venue of the five leagues.
Sources: Wikidata items (CC0) and the "Former names" of English Wikipedia infoboxes (CC BY-SA 4.0). Never Sports Reference or ESPN.

## Yearly refresh (run in February, or after a rename is announced)

Names only; credentials are not needed. Venue ids come from `legacy_team_brand.team_place`, so refresh the team brand data first if a club moved.

    day=$(date +%F)
    python3 scripts/wikidata_venues/fetch.py ~/spx-raw/wikidata_venues/$day       # raw files + manifest.jsonl, about 2 minutes
    python3 scripts/wikidata_venues/load.py ~/spx-raw/wikidata_venues/$day $day   # legacy_wikidata_venues (migration 043)
    python3 scripts/archive_raw.py wikidata-venues ~/spx-raw/wikidata_venues/$day $day   # DS1 legacy_files.raw_archive
    python3 scripts/dropbox_put.py <file> wikidata_venues $day                    # Dropbox copy, per file
    psql -f db/build/193_venue_names.sql                                          # core.brand_venue_name, core.brand_venue_info
    python3 scripts/wikidata_venues/to_sql.py --update > /tmp/venue_names.sql     # production SQL; run it, then check counts

All scripts read PGHOST, PGPORT, PGUSER, PGDATABASE and PGPASSWORD. `to_sql.py` without `--update` is insert-only.
`api.venue_name` and `api.venue_info` are views over the core tables; pages cache for an hour.

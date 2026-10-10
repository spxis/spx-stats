#!/usr/bin/env bash
# Merge the pages collection of one restored MongoDB database into
# legacy_mongo.page_snapshot, tagging each snapshot with the dump it came from.
# Usage: load_pages.sh <mongo database> <dump tag, e.g. 2015-07-10-prod>
set -euo pipefail
DB=$1; TAG=$2; S=${SPX_WORK:?set SPX_WORK}; D=$(cd "$(dirname "$0")" && pwd)
W=$S/mongo/export/$TAG; mkdir -p "$W"
docker exec spxmongo mongoexport --quiet --db "$DB" --collection pages --out /tmp/pages.json
docker cp spxmongo:/tmp/pages.json "$W/pages.json" >/dev/null
python3 -I "$D/pages_to_csv.py" "$W/pages.json" "$W/pages.csv" "$TAG"
psql -h /tmp -p 55432 -U postgres -d spx_stats -v ON_ERROR_STOP=1 -q -At <<SQL
create temp table _in (like legacy_mongo.page_snapshot);
\copy _in from '$W/pages.csv' with (format csv, null '\N')
insert into legacy_mongo.page_snapshot select * from _in
on conflict (page_key, taken_at) do update set _seen_in = page_snapshot._seen_in || excluded._seen_in
  where not page_snapshot._seen_in @> excluded._seen_in;
select '$TAG ' || count(*) || ' snapshots' from _in;
SQL

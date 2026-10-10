#!/usr/bin/env bash
# Merge the parsed player season stats of one restored spx-stats MongoDB
# database into legacy_mongo.player_season_stat. A later as_of wins; the
# same line seen in another dump only adds that dump to _seen_in.
# Usage: load_pages.sh <mongo database> <dump tag, e.g. 2015-07-10-prod>
set -euo pipefail
DB=$1; TAG=$2; S=${SPX_WORK:?set SPX_WORK}; D=$(cd "$(dirname "$0")" && pwd)
W=$S/mongo/export/$TAG; mkdir -p "$W"
docker exec spxmongo mongoexport --quiet --db "$DB" --collection pages --out /tmp/pages.json
docker cp spxmongo:/tmp/pages.json "$W/pages.json" >/dev/null
python3 -I "$D/pages_to_csv.py" "$W/pages.json" "$W/rows.csv" "$TAG"
rm -f "$W/pages.json"
psql -h /tmp -p 55432 -U postgres -d spx_stats -v ON_ERROR_STOP=1 -q -At <<SQL
create temp table _in (like legacy_mongo.player_season_stat);
\copy _in from '$W/rows.csv' with (format csv, null '\N')
insert into legacy_mongo.player_season_stat as t select * from _in
on conflict (sport, season_year, season_type, stat_type, player_key, team_key) do update
  set player_name = case when excluded.as_of > t.as_of then excluded.player_name else t.player_name end,
      stats       = case when excluded.as_of > t.as_of then excluded.stats else t.stats end,
      source_note = case when excluded.as_of > t.as_of then excluded.source_note else t.source_note end,
      source_url  = case when excluded.as_of > t.as_of then excluded.source_url else t.source_url end,
      as_of       = greatest(t.as_of, excluded.as_of),
      _seen_in    = case when t._seen_in @> excluded._seen_in then t._seen_in else t._seen_in || excluded._seen_in end;
select '$TAG ' || count(*) || ' player lines' from _in;
SQL

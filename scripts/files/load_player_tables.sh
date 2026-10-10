#!/usr/bin/env bash
# Merge a folder of saved league season stat tables into legacy_files.
# Usage: load_player_tables.sh <folder> <tag, e.g. spxstats-2007-08-14>
set -euo pipefail
DIR=$1; TAG=$2; S=${SPX_WORK:?set SPX_WORK}; D=$(cd "$(dirname "$0")" && pwd)
OUT=$S/files/$TAG.csv; mkdir -p "$(dirname "$OUT")"
python3 -I "$D/player_tables_to_csv.py" "$DIR" "$OUT" "$TAG"
psql -h /tmp -p 55432 -U postgres -d spx_stats -v ON_ERROR_STOP=1 -q -At <<SQL
create temp table _in (like legacy_files.player_season_table);
\copy _in from '$OUT' with (format csv, null '\N')
insert into legacy_files.player_season_table select * from _in
on conflict (league, season, season_type, table_name, player_key, team) do update
  set _seen_in = player_season_table._seen_in || excluded._seen_in
  where not player_season_table._seen_in @> excluded._seen_in;
select '$TAG ' || count(*) || ' player lines' from _in;
SQL

#!/usr/bin/env bash
# Merge a folder of saved NHL.com season tables into legacy_nhlcom.
# Usage: load_season_tables.sh <folder> <tag, e.g. spxstats-2007-08-14>
set -euo pipefail
DIR=$1; TAG=$2; S=${SPX_WORK:?set SPX_WORK}; D=$(cd "$(dirname "$0")" && pwd)
OUT=$S/nhlcom/$TAG.csv; mkdir -p "$(dirname "$OUT")"
python3 -I "$D/season_tables_to_csv.py" "$DIR" "$OUT" "$TAG"
psql -h /tmp -p 55432 -U postgres -d spx_stats -v ON_ERROR_STOP=1 -q -At <<SQL
create temp table _in (like legacy_nhlcom.player_season_table);
\copy _in from '$OUT' with (format csv, null '\N')
insert into legacy_nhlcom.player_season_table select * from _in
on conflict (season, season_type, table_name, nhl_player_id, team) do update
  set _seen_in = player_season_table._seen_in || excluded._seen_in
  where not player_season_table._seen_in @> excluded._seen_in;
select '$TAG ' || count(*) || ' player lines' from _in;
SQL

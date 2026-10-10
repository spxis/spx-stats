#!/usr/bin/env bash
# Load games and player box-score lines from a restored spxn MongoDB (2013).
# Usage: load_spxn.sh <mongo database> <dump tag, e.g. 2013-07-29>
set -euo pipefail
DB=$1; TAG=$2; S=${SPX_WORK:?set SPX_WORK}; D=$(cd "$(dirname "$0")" && pwd)
W=$S/mongo/export/$TAG; mkdir -p "$W"
for c in games teamgames players; do
  docker exec spxmongo mongoexport --quiet --db "$DB" --collection $c --out /tmp/$c.json
  docker cp spxmongo:/tmp/$c.json "$W/$c.json" >/dev/null
done
python3 -I "$D/spxn_to_csv.py" "$W/games.json" "$W/teamgames.json" "$W/players.json" "$W" "$TAG"
rm -f "$W"/*.json
psql -h /tmp -p 55432 -U postgres -d spx_stats -v ON_ERROR_STOP=1 -q -At <<SQL
create temp table _g (like legacy_mongo.game);
\copy _g from '$W/game.csv' with (format csv, null '\N')
insert into legacy_mongo.game select distinct on (sport, source_gameid) * from _g order by sport, source_gameid
on conflict (sport, source_gameid) do update set _seen_in = game._seen_in || excluded._seen_in
  where not game._seen_in @> excluded._seen_in;
create temp table _p (like legacy_mongo.player_game_stat);
\copy _p from '$W/player_game_stat.csv' with (format csv, null '\N')
insert into legacy_mongo.player_game_stat select distinct on (sport, source_gameid, player_key, stats) * from _p
  order by sport, source_gameid, player_key, stats
on conflict (sport, source_gameid, player_key, stats) do update set _seen_in = player_game_stat._seen_in || excluded._seen_in
  where not player_game_stat._seen_in @> excluded._seen_in;
select '$TAG games ' || (select count(*) from _g) || ', player lines ' || (select count(*) from _p);
SQL

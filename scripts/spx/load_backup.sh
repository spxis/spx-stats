#!/usr/bin/env bash
# Load the sports tables of one restored SPX SQL Server database into the
# local legacy_spx schema, tagging every row with the backup it was seen in.
# Usage: load_backup.sh <mssql database name> <backup tag, e.g. 2012-01-17>
#    or: SPX_RAW=<folder from sql2000/decode.py --raw> load_backup.sh - <backup tag>
#        (a SQL Server 2000 backup decoded without SQL Server)
set -euo pipefail
DB=$1; TAG=$2
S=${SPX_WORK:?set SPX_WORK to the working folder}
W=$S/spx/export/$TAG; mkdir -p "$W"; chmod 777 "$W"
PW=$(cat $S/jm_sa.txt)
P="psql -h /tmp -p 55432 -U postgres -d spx_stats -v ON_ERROR_STOP=1 -q"
$P -c "create or replace function legacy_spx._norm(j jsonb) returns jsonb language sql immutable as \$\$ select coalesce(jsonb_object_agg(k, v), '{}') from jsonb_each(j - '_seen_in') e(k, v) where v <> 'null' and v <> '\"\"' \$\$"
$P -c "create table if not exists legacy_spx._superseded (table_name text not null, row_key jsonb not null, old_row jsonb not null, seen_in text not null, primary key (table_name, row_key, seen_in))"
if [ -n "${SPX_RAW:-}" ]; then
  existing=$(cd "$SPX_RAW" && ls *.cols | sed 's/\.cols$//')
else
existing=$(docker exec spxsql /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P "$PW" -d "$DB" -h -1 -W -Q "SET NOCOUNT ON; SELECT name FROM sys.tables")
fi
while IFS=$'\t' read -r src tgt srccols tgtcols pks; do
  pks=${pks//|/,}
  if ! grep -qx "$src" <<<"$existing"; then echo "skip $src (not in $DB)"; continue; fi
  # Columns this backup actually has (older backups may lack newer columns).
  if [ -n "${SPX_RAW:-}" ]; then have=$(cat "$SPX_RAW/$src.cols"); else
  have=$(docker exec spxsql /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P "$PW" -d "$DB" -h -1 -W -Q "SET NOCOUNT ON; SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='$src'"); fi
  sel=(); ins=()
  IFS='|' read -ra sc <<<"$srccols"; IFS='|' read -ra tc <<<"$tgtcols"
  for i in "${!sc[@]}"; do
    if grep -qx "${sc[$i]}" <<<"$have"; then sel+=("[${sc[$i]}]"); ins+=("\"${tc[$i]}\""); fi
  done
  q="SELECT $(IFS=,; echo "${sel[*]}") FROM [$src]"
  if [ -n "${SPX_RAW:-}" ]; then cp "$SPX_RAW/$src.raw" "$W/$tgt.raw"; else
  docker exec spxsql /opt/mssql-tools18/bin/bcp "$q" queryout "/var/opt/mssql/x.tsv" -d "$DB" -S localhost -U sa -P "$PW" -C 65001 -c -t '~^~' -r '~#~\n' -u >/dev/null
  docker cp spxsql:/var/opt/mssql/x.tsv "$W/$tgt.raw" >/dev/null; fi
  python3 -I "$S/spx/to_csv.py" "$W/$tgt.raw" "$W/$tgt.csv" "${#sel[@]}" "$TAG" "$([ -z "$pks" ] && echo hash || echo pk)"
  cols="$(IFS=,; echo "${ins[*]}"),_seen_in$([ -z "$pks" ] && echo ,_row_hash || true)"
  if [ -n "$pks" ]; then
    conflict="($pks)"; kp=""
    IFS=',' read -ra pkl <<<"$pks"
    for k in "${pkl[@]}"; do k=$(echo $k | tr -d ' "'); kp+="'$k', _n.\"$k\","; done
    keyexpr="jsonb_build_object(${kp%,})"
  else
    conflict="(_row_hash)"; keyexpr="jsonb_build_object('_row_hash', _n._row_hash)"
  fi
  $P <<SQL
create temp table _incoming (like legacy_spx.$tgt);
\copy _incoming ($cols) from '$W/$tgt.csv' with (format csv, null '\N')
insert into legacy_spx._superseded
  select '$tgt', $keyexpr, to_jsonb(_n) - '_seen_in', '$TAG'
  from _incoming _n join legacy_spx.$tgt _o using ($(echo "${pks:-_row_hash}" | tr -d ' '))
  where legacy_spx._norm(to_jsonb(_n)) <> legacy_spx._norm(to_jsonb(_o))   -- an empty string and a null are the same value
on conflict do nothing;
insert into legacy_spx.$tgt select * from _incoming
on conflict $conflict do update set _seen_in = legacy_spx.$tgt._seen_in || excluded._seen_in
  where not legacy_spx.$tgt._seen_in @> excluded._seen_in;
SQL
  echo "$tgt $(($(wc -l < "$W/$tgt.csv")))"
done < "${SPX_TABLEMAP:-$S/spx/tablemap.tsv}"

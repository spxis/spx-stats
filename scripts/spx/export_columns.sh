#!/usr/bin/env bash
# Write columns.tsv (the column definitions of the sports tables listed in
# keep.txt) from a restored SPX database, then generate the legacy_spx schema
# and tablemap.tsv from it with gen_legacy.py.
# Usage: SPX_WORK=<folder> export_columns.sh <mssql database name>
set -euo pipefail
DB=${1:-SPX}; S=${SPX_WORK:?set SPX_WORK}; D=$(cd "$(dirname "$0")" && pwd)
PW=$(cat $S/jm_sa.txt)
IN=$(tr -s ' \n' '\n' < "$D/keep.txt" | grep . | sed "s/.*/'&'/" | paste -sd,)
docker exec spxsql /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P "$PW" -d "$DB" -h -1 -W -s $'\t' -Q "SET NOCOUNT ON; SELECT c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE, ISNULL(c.NUMERIC_PRECISION,0), ISNULL(c.NUMERIC_SCALE,0), c.IS_NULLABLE, c.ORDINAL_POSITION, CASE WHEN k.COLUMN_NAME IS NULL THEN 0 ELSE k.ORDINAL_POSITION END FROM INFORMATION_SCHEMA.COLUMNS c LEFT JOIN (SELECT ku.TABLE_NAME, ku.COLUMN_NAME, ku.ORDINAL_POSITION FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku ON ku.CONSTRAINT_NAME=tc.CONSTRAINT_NAME WHERE tc.CONSTRAINT_TYPE='PRIMARY KEY') k ON k.TABLE_NAME=c.TABLE_NAME AND k.COLUMN_NAME=c.COLUMN_NAME WHERE c.TABLE_NAME IN ($IN) ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION" > "$D/columns.tsv"
python3 -I "$D/gen_legacy.py" "$D/columns.tsv" "$D/../../db/migrations/002_legacy_spx.sql" "$D/tablemap.tsv"

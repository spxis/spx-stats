#!/usr/bin/env bash
# Restore every downloaded SPX backup archive in manifest order (newest first),
# merge its sports tables into legacy_spx, then drop it and delete its files.
set -uo pipefail
S=${SPX_WORK:?set SPX_WORK to the working folder}
PW=$(cat $S/jm_sa.txt)
SQL="docker exec spxsql /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P $PW -h -1 -W"
for d in SPX2013 SPX2011; do $SQL -Q "DROP DATABASE IF EXISTS [$d]" >/dev/null; done
while IFS=$'\t' read -r tag name url; do
  ext=${name##*.}; A=$S/dl/q/$tag.$ext; X=$S/dl/q/x_$tag
  echo "=== $tag ($name)"
  rm -rf "$X"; mkdir -p "$X"; unar -q -o "$X" "$A" >/dev/null 2>&1 || { echo "UNPACK FAILED"; continue; }
  find "$X" -type f -printf '  %s %P\n'
  i=0
  while IFS= read -r -d '' f; do
    i=$((i+1)); db="B_${tag//[-.]/_}_$i"
    case "${f,,}" in
      *.bak)
        docker cp "$f" spxsql:/var/opt/mssql/in.bak >/dev/null
        moves=$($SQL -s '|' -Q "SET NOCOUNT ON; RESTORE FILELISTONLY FROM DISK='/var/opt/mssql/in.bak'" | awk -F'|' -v d="$db" 'NF>3{printf "MOVE '"'"'%s'"'"' TO '"'"'/var/opt/mssql/data/%s_%d.%s'"'"', ", $1, d, NR, ($3=="L"?"ldf":"mdf")}')
        $SQL -Q "RESTORE DATABASE [$db] FROM DISK='/var/opt/mssql/in.bak' WITH ${moves} REPLACE" | tail -1
        docker exec spxsql rm -f /var/opt/mssql/in.bak ;;
      *.mdf)
        docker cp "$f" spxsql:/var/opt/mssql/data/$db.mdf >/dev/null; docker exec -u 0 spxsql chown mssql /var/opt/mssql/data/$db.mdf
        $SQL -Q "CREATE DATABASE [$db] ON (FILENAME='/var/opt/mssql/data/$db.mdf') FOR ATTACH_REBUILD_LOG" 2>&1 | tail -1 ;;
    esac
    if $SQL -d "$db" -Q "SET NOCOUNT ON; SELECT TOP 1 1 FROM tblGames" >/dev/null 2>&1; then
      $SQL -d "$db" -s '|' -Q "SET NOCOUNT ON; SELECT 'SPX db', COUNT(*), MAX(GameDate), MAX(GameTimestamp) FROM tblGames"
      $SQL -d "$db" -Q "SET NOCOUNT ON; SELECT 'extra table: '+name FROM sys.tables WHERE name NOT IN (SELECT name FROM SPX.sys.tables)"
      bash $S/spx/load_backup.sh "$db" "$tag" 2>&1 | grep -vE 'NOTICE|^[a-z_0-9]+ [0-9]+$|^skip ' || true
    else
      echo "  not an SPX database: $f"
    fi
    $SQL -Q "DROP DATABASE IF EXISTS [$db]" >/dev/null 2>&1
  done < <(find "$X" -type f \( -iname '*.bak' -o -iname '*.mdf' \) -print0)
  [ $i -eq 0 ] && echo "  no database files in archive"
  rm -rf "$X" "$A"
done < $S/dl/manifest.tsv
echo "=== ALL DONE"
psql -h /tmp -p 55432 -U postgres -d spx_stats -Atc "select 'games', count(*), count(*) filter (where not _seen_in @> '{2012-01-17}') from legacy_spx.tbl_games union all select 'odds', count(*), count(*) filter (where not _seen_in @> '{2012-01-17}') from legacy_spx.tbl_game_odds union all select 'superseded', count(*), count(distinct table_name) from legacy_spx._superseded"

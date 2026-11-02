#!/bin/bash
# Is the nightly DS1 backup alive? Reads the note ds1-backup.sh leaves in its folder (last-run.txt) and counts the dumps.
#   bash scripts/backup/backup-status.sh [folder]         a local folder (default ~/Projects/backups/spx-stats, the machine1 fallback)
#   bash scripts/backup/backup-status.sh --nas2           nas2's folder over ssh (NAS2_SSH_ALIAS and NAS2_BACKUP_DIR from the private mapping)
# Exit 0 = last run ok and newer than BACKUP_MAX_AGE_H hours (default 36); exit 1 = failed, too old or no note; exit 2 = cannot read it.
# Only the coordinating session uses --nas2 (it is the one that may log in to nas2).
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$HERE/../mac/lib/hosts.sh"
max_h="${BACKUP_MAX_AGE_H:-36}"
if [ "${1:-}" = "--nas2" ]; then
  spx_hosts_need NAS2_SSH_ALIAS NAS2_BACKUP_DIR || exit 2
  d="$NAS2_BACKUP_DIR"
  out="$(ssh -o BatchMode=yes -o ConnectTimeout=8 "$NAS2_SSH_ALIAS" "cat '$d/last-run.txt' 2>/dev/null; echo '--daily'; ls -1 '$d/daily' 2>/dev/null; echo '--weekly'; ls -1 '$d/weekly' 2>/dev/null")" \
    || { echo "backup status: cannot log in to nas2 (ssh $NAS2_SSH_ALIAS)" >&2; exit 2; }
  where=nas2
else
  d="${1:-${BACKUP_DIR:-$HOME/Projects/backups/spx-stats}}"
  [ -d "$d" ] || { echo "backup status: no folder $d" >&2; exit 2; }
  out="$(cat "$d/last-run.txt" 2>/dev/null; echo '--daily'; ls -1 "$d/daily" 2>/dev/null; echo '--weekly'; ls -1 "$d/weekly" 2>/dev/null)"
  where=local
fi
echo "$out" | awk -F= -v now="$(date +%s)" -v max="$max_h" -v where="$where" '
  /^--daily/ { sec = "d"; next } /^--weekly/ { sec = "w"; next }
  sec == "d" && /ds1-nightly\.dump$/ { nd++; if ($0 > newest) newest = $0; next }
  sec == "w" && /ds1-nightly\.dump$/ { nw++; next }
  sec == "" { k[$1] = $2 }
  END {
    if (!("finished_epoch" in k)) { printf "backup status (%s): no last-run note; dumps daily %d, weekly %d\n", where, nd, nw; exit 1 }
    age = (now - k["finished_epoch"]) / 3600
    printf "backup status (%s): last run %s, %s, %s, %.1f MB, %s s; %.1f h ago; dumps daily %d (newest %s), weekly %d\n", where, k["finished"], k["outcome"], k["file"], k["bytes"] / 1048576, k["seconds"], age, nd, newest, nw
    if (k["outcome"] != "ok") { print "  PROBLEM: the last run did not succeed"; exit 1 }
    if (age > max) { printf "  PROBLEM: older than %d hours\n", max; exit 1 }
  }'

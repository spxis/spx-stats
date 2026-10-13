#!/bin/bash
# Fails when two files in db/migrations share a number. 030 and 031 are the only known duplicates (AGENTS.md section 8, item 4).
# Usage: bash scripts/check_migration_numbers.sh      Run after `git fetch && git rebase origin/main`, before every push.
# Prints "ok" and the next free number, or each clash and exits 1.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIR="${MIGRATIONS_DIR:-$HERE/../db/migrations}"
ALLOWED="030 031"

bad=0 max=0
for n in $(ls "$DIR" | sed -n 's/^\([0-9][0-9]*\)_.*\.sql$/\1/p' | sort | uniq -d); do
  case " $ALLOWED " in *" $n "*) continue;; esac
  bad=1
  echo "migration number $n is used twice: $(cd "$DIR" && ls "${n}"_*.sql | tr '\n' ' ')"
done
for n in $(ls "$DIR" | sed -n 's/^\([0-9][0-9]*\)_.*\.sql$/\1/p'); do
  n=$((10#$n)); [ "$n" -gt "$max" ] && max=$n
done
if [ "$bad" = 1 ]; then
  echo "fix: git fetch && git rebase origin/main, then rename your file to the next free number (next is $(printf '%03d' $((max + 1))))"
  exit 1
fi
echo "migration numbers: ok (no clashes besides 030 and 031; next free is $(printf '%03d' $((max + 1))))"

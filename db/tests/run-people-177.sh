#!/bin/bash
# db/build/177_people.sql must delete only the Wikidata person ids it owns (the people an award winner points at), never
# the ones 179, 181, 184 or 187 added. It ran against DS1 twice and cut core.external_id person/wikidata rows by 11,073.
# Runs the real step 177 TWICE (each run commits) on a scratch copy of DS1 and fails when
#   1. a person/wikidata id that no award linked before is gone afterwards (a seeded one included), or
#   2. the second run changes the set the first run left.
# Optional steps between the two runs, to prove 177 -> 179 -> 181 -> 187 -> 177:
#   --between "179_players_wikidata 181_players_nflverse 187_nhl_birth_country"
# Scratch Postgres on this Mac only (localhost); it refuses DS1's port and any remote host. NEVER point it at DS1 or production.
# Usage: bash db/tests/run-people-177.sh [--between "<step names>"] [psql args; default -h 127.0.0.1 -p 7740 -U postgres -d spx_stats]
# Exit 0 when it passes. The test leaves its counts in the output and removes its seeded row.
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
between=""
if [ "${1:-}" = "--between" ]; then between="$2"; shift 2; fi
if [ $# -eq 0 ]; then set -- -h 127.0.0.1 -p 7740 -U postgres -d spx_stats; fi
case " $* " in
  *" 55440 "*|*" -p55440 "*|*" --port=55440 "*) echo "refused: that is DS1's port"; exit 3;;
esac
host=""; prev=""
for a in "$@"; do
  [ "$prev" = "-h" ] && host="$a"
  case "$a" in -h?*) host="${a#-h}";; --host=*) host="${a#--host=}";; esac
  prev="$a"
done
case "$host" in 127.0.0.1|localhost|/*) ;; *) echo "refused: scratch databases on this Mac only (give -h 127.0.0.1)"; exit 3;; esac
export PGOPTIONS="-c client_min_messages=warning"
S177="${STEP_177:-$REPO/db/build/177_people.sql}"
PSQL=(psql -X -q -At -v ON_ERROR_STOP=1 "$@")
q() { "${PSQL[@]}" -c "$1"; }
cnt() { q "select count(*) from core.external_id where entity_kind = 'person' and source_id = (select source_id from meta.source where code = 'wikidata')"; }
snap() { q "drop table if exists public.t177_$1; create table public.t177_$1 as select external_key, entity_id from core.external_id where entity_kind = 'person' and source_id = (select source_id from meta.source where code = 'wikidata')" >/dev/null; }

cleanup() {
  q "drop table if exists public.t177_s0, public.t177_s1, public.t177_s2, public.t177_linked;
     delete from core.external_id where entity_kind = 'person' and external_key = 'Q-test-other-step';
     delete from core.person where full_name = 'Test Other Step'" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

# a Wikidata person no award links to (what another step holds), so the test has teeth on any copy
q "with p as (insert into core.person (full_name, kind, source_id) select 'Test Other Step', 'player', source_id from meta.source where code = 'wikidata' returning person_id)
   insert into core.external_id (entity_kind, entity_id, source_id, external_key)
   select 'person', p.person_id, (select source_id from meta.source where code = 'wikidata'), 'Q-test-other-step' from p" >/dev/null
q "create table public.t177_linked as select distinct person_id from core.award_winner where person_id is not null"
snap s0
echo "person/wikidata ids before:           $(cnt)"

"${PSQL[@]}" -f "$S177" >/dev/null
snap s1
echo "after 177:                            $(cnt)"
"${PSQL[@]}" -f "$S177" >/dev/null
snap s2
echo "after 177 again:                      $(cnt)"

if [ -n "$between" ]; then
  for s in $between; do
    echo "running $s ..."
    "${PSQL[@]}" -f "$REPO/db/build/$s.sql" >/dev/null
    echo "  after $s:                          $(cnt)"
  done
  snap s1
  "${PSQL[@]}" -f "$S177" >/dev/null
  snap s2
  echo "after 177 once more:                  $(cnt)"
fi

lost="$(q "select count(*) from public.t177_s0 a where a.entity_id not in (select person_id from public.t177_linked) and not exists (select 1 from public.t177_s2 b where b.external_key = a.external_key)")"
changed="$(q "select count(*) from ((select * from public.t177_s1 except select * from public.t177_s2) union all (select * from public.t177_s2 except select * from public.t177_s1)) d")"
echo "unowned ids lost to 177: $lost (must be 0)   ids changed by the last run of 177: $changed (must be 0)"
if [ "$lost" = 0 ] && [ "$changed" = 0 ]; then echo "RESULT: OK"; else echo "RESULT: FAILED"; exit 1; fi

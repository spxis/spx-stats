#!/bin/bash
# db/build/185_person_merge.sql merges two core.person records whose birth dates differ in exactly one digit ONLY when the names are the same
# (spaced initials joined), a league is in common and the careers touch; it must NOT merge C.J. Wilson the pitcher and C.J. Wilson the
# football player (a different league), people whose careers are apart, two digits apart, a nickname, two ids of one source, or a different
# hand. It must keep the date of the record Wikidata keys, delete only the people it merges (each with a redirect), leave other
# meta.data_issue rows alone, and a second run must change nothing.
# Seeds fixtures named "Zzqtest ..." into a scratch copy of DS1, runs the real step 185 TWICE (each run commits) and checks. The run also
# merges real people on the copy: that is the point of a copy. Fixtures are removed at the end.
# Scratch Postgres on this Mac only (localhost); it refuses DS1's port and any remote host. NEVER point it at DS1 or production.
# Usage: bash db/tests/person-typo-merge.sh [psql args; default -h 127.0.0.1 -p 7740 -U postgres -d spx_stats]
# Exit 0 when it passes.
set -eu
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
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
S185="${STEP_185:-$REPO/db/build/185_person_merge.sql}"
PSQL=(psql -X -q -At -v ON_ERROR_STOP=1 "$@")
q() { "${PSQL[@]}" -c "$1"; }
fail=0
check() { # name, expected, actual
  if [ "$2" = "$3" ]; then echo "ok    $1: $3"; else echo "FAIL  $1: expected '$2', got '$3'"; fail=1; fi
}

cleanup() {
  q "delete from core.all_star_selection where source_key = 'zzqtest-allstar';
     delete from core.person_redirect where old_name like 'Zzqtest%' or person_id in (select person_id from core.person where full_name like 'Zzqtest%');
     delete from meta.data_issue where issue like '%Zzqtest%' or entity_key = 'zzqtest-keep';
     delete from core.external_id where entity_kind = 'person' and external_key like 'zzqtest%';
     delete from core.roster_stint where person_id in (select person_id from core.person where full_name like 'Zzqtest%');
     delete from core.person where full_name like 'Zzqtest%'" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

# --- fixtures -------------------------------------------------------------------------------------------------------------------
"${PSQL[@]}" >/dev/null <<'SQL'
create function pg_temp.mk(nm text, bd date, src text, key_src text, key text, hand text default null) returns bigint language plpgsql as $$
declare pid bigint;
begin
  insert into core.person (full_name, kind, birth_date, bats, source_id)
  values (nm, 'player', bd, hand, (select source_id from meta.source where code = src)) returning person_id into pid;
  if key is not null then
    insert into core.external_id (entity_kind, entity_id, source_id, external_key) values ('person', pid, (select source_id from meta.source where code = key_src), key);
  end if;
  return pid;
end $$;
create function pg_temp.st(pid bigint, lg text, yr int) returns void language sql as $$
  insert into core.roster_stint (person_id, team_season_id, role)
  select pid, min(t.team_season_id), 'player' from core.team_season t join core.season s using (season_id) where s.league_code = lg and s.start_year = yr $$;
do $$
declare a bigint; b bigint; c bigint;
begin
  -- 1. a real typo: Wikidata keys the poorer record (the SPX record is kept) and holds the date that must win
  a := pg_temp.mk('Zzqtest Eller', '1942-02-25', 'spx_database', 'lahman', 'zzqtest-l1', 'R');  perform pg_temp.st(a, 'nfl', 1973); perform pg_temp.st(a, 'nfl', 1974);
  b := pg_temp.mk('Zzqtest Eller', '1942-01-25', 'wikidata', 'wikidata', 'zzqtest-q1');           perform pg_temp.st(b, 'nfl', 1965); perform pg_temp.st(b, 'nfl', 1972);
  -- an All-Star roster line that points at the Wikidata record (the one merged away): the merge must move it to the record kept
  insert into core.all_star_selection (league_code, year, event_no, seq, name, person_id, source_id, source_key)
  select 'nfl', 2026, 1, 999999, 'Zzqtest Eller', b, (select source_id from meta.source where code = 'spx_stats_derived'), 'zzqtest-allstar';
  -- 2. spaced initials: "L. C." and "L.C."
  a := pg_temp.mk('Zzqtest L. C. Hill', '1950-03-04', 'wikidata', 'wikidata', 'zzqtest-q2');      perform pg_temp.st(a, 'nfl', 1968); perform pg_temp.st(a, 'nfl', 1972);
  b := pg_temp.mk('Zzqtest L.C. Hill', '1950-03-14', 'nflverse', 'nflverse', 'zzqtest-n2');       perform pg_temp.st(b, 'nfl', 1973); perform pg_temp.st(b, 'nfl', 1976);
  -- 3. C.J. Wilson: one digit apart, careers touch, but the pitcher played MLB and the football player the NFL
  a := pg_temp.mk('Zzqtest C.J. Wilson', '1980-11-18', 'wikidata', 'wikidata', 'zzqtest-q3');     perform pg_temp.st(a, 'mlb', 2012); perform pg_temp.st(a, 'mlb', 2013);
  b := pg_temp.mk('Zzqtest C. J. Wilson', '1989-11-18', 'nflverse', 'nflverse', 'zzqtest-n3');    perform pg_temp.st(b, 'nfl', 2013); perform pg_temp.st(b, 'nfl', 2014);
  -- 4. one digit apart, same league, careers 33 years apart
  a := pg_temp.mk('Zzqtest Apart', '1940-05-05', 'wikidata', 'wikidata', 'zzqtest-q4');           perform pg_temp.st(a, 'nfl', 1965);
  b := pg_temp.mk('Zzqtest Apart', '1940-05-15', 'nflverse', 'nflverse', 'zzqtest-n4');           perform pg_temp.st(b, 'nfl', 1998);
  -- 5. two digits apart
  a := pg_temp.mk('Zzqtest Twodigit', '1940-05-05', 'wikidata', 'wikidata', 'zzqtest-q5');        perform pg_temp.st(a, 'nfl', 1972);
  b := pg_temp.mk('Zzqtest Twodigit', '1940-06-15', 'nflverse', 'nflverse', 'zzqtest-n5');        perform pg_temp.st(b, 'nfl', 1973);
  -- 6. a nickname is not enough on a different date
  a := pg_temp.mk('Zzqtest Bob Nick', '1940-05-05', 'wikidata', 'wikidata', 'zzqtest-q6');        perform pg_temp.st(a, 'nfl', 1972);
  b := pg_temp.mk('Zzqtest Robert Nick', '1940-05-15', 'nflverse', 'nflverse', 'zzqtest-n6');     perform pg_temp.st(b, 'nfl', 1973);
  -- 7. a record in two pairs is left alone
  a := pg_temp.mk('Zzqtest Triple', '1941-01-01', 'wikidata', 'wikidata', 'zzqtest-q7');          perform pg_temp.st(a, 'nfl', 1972);
  b := pg_temp.mk('Zzqtest Triple', '1941-01-02', 'nflverse', 'nflverse', 'zzqtest-n7');          perform pg_temp.st(b, 'nfl', 1972);
  c := pg_temp.mk('Zzqtest Triple', '1941-01-03', 'lahman', 'lahman', 'zzqtest-l7');              perform pg_temp.st(c, 'nfl', 1972);
  -- 8. two different ids of one source are two people, whatever the dates
  a := pg_temp.mk('Zzqtest Samesource', '1940-05-05', 'lahman', 'lahman', 'zzqtest-l8a');         perform pg_temp.st(a, 'nfl', 1972);
  b := pg_temp.mk('Zzqtest Samesource', '1940-05-15', 'lahman', 'lahman', 'zzqtest-l8b');         perform pg_temp.st(b, 'nfl', 1973);
  -- 9. a different batting hand
  a := pg_temp.mk('Zzqtest Handed', '1940-05-05', 'wikidata', 'wikidata', 'zzqtest-q9', 'L');     perform pg_temp.st(a, 'nfl', 1972);
  b := pg_temp.mk('Zzqtest Handed', '1940-05-15', 'nflverse', 'nflverse', 'zzqtest-n9', 'R');     perform pg_temp.st(b, 'nfl', 1973);
  -- a data_issue row that is not 185's: it must survive
  insert into meta.data_issue (source_id, entity_kind, entity_key, issue, resolution)
  values ((select source_id from meta.source where code = 'spx_stats_derived'), 'person', 'zzqtest-keep', 'Zzqtest keep me', 'none');
end $$;
SQL

people_before=$(q "select count(*) from core.person where full_name not like 'Zzqtest%'")
cj_before=$(q "select count(*) from core.person p where exists (select 1 from core.external_id x where x.entity_kind = 'person' and x.entity_id = p.person_id and x.external_key in ('wilsocj01', '00-0030141'))")

n() { q "select count(*) from core.person where full_name = '$1'"; }
bd() { q "select coalesce(string_agg(birth_date::text, ','), '') from core.person where full_name = '$1'"; }

echo "--- run 1"
"${PSQL[@]}" -f "$S185" >/dev/null
check "typo pair (Eller) is one record"            1 "$(n 'Zzqtest Eller')"
check "typo pair keeps the Wikidata date"          1942-01-25 "$(bd 'Zzqtest Eller')"
check "typo pair: the SPX record is the one kept"  1 "$(q "select count(*) from core.person where full_name = 'Zzqtest Eller' and source_id = (select source_id from meta.source where code = 'spx_database')")"
check "typo pair: the stints all moved"            4 "$(q "select count(*) from core.roster_stint s join core.person p using (person_id) where p.full_name = 'Zzqtest Eller'")"
check "typo pair: both external ids on the kept"   2 "$(q "select count(*) from core.external_id x join core.person p on p.person_id = x.entity_id where x.entity_kind = 'person' and p.full_name = 'Zzqtest Eller'")"
check "typo pair: the old id redirects"            1 "$(q "select count(*) from core.person_redirect r join core.person p using (person_id) where p.full_name = 'Zzqtest Eller' and r.old_name = 'Zzqtest Eller'")"
check "typo pair: merge is logged with both dates" 1 "$(q "select count(*) from meta.data_issue where entity_key like 'merge:%' and issue like '%Zzqtest Eller%' and issue like '%1942-02-25%' and issue like '%1942-01-25%'")"
check "an All-Star link follows the merge to the kept" 1 "$(q "select count(*) from core.all_star_selection a join core.person p using (person_id) where a.source_key = 'zzqtest-allstar' and p.full_name = 'Zzqtest Eller' and p.source_id = (select source_id from meta.source where code = 'spx_database')")"
check "spaced initials is one record"              1 "$(q "select count(*) from core.person where full_name like 'Zzqtest L%C. Hill'")"
check "C.J. Wilson pitcher and footballer stay two" 2 "$(q "select count(*) from core.person where full_name like 'Zzqtest C%J. Wilson'")"
check "different careers apart stay two"           2 "$(n 'Zzqtest Apart')"
check "two digits apart stay two"                  2 "$(n 'Zzqtest Twodigit')"
check "nickname on a typo date stays two"          2 "$(q "select count(*) from core.person where full_name in ('Zzqtest Bob Nick', 'Zzqtest Robert Nick')")"
check "a record in two pairs: all three stay"      3 "$(n 'Zzqtest Triple')"
check "two ids of one source stay two"             2 "$(n 'Zzqtest Samesource')"
check "a different hand stays two"                 2 "$(n 'Zzqtest Handed')"
check "another step's data_issue row survives"     1 "$(q "select count(*) from meta.data_issue where entity_key = 'zzqtest-keep'")"
if [ "$cj_before" = 2 ]; then check "the real C.J. Wilsons (pitcher and 1989 footballer) stay two" 2 "$(q "select count(*) from core.person p where exists (select 1 from core.external_id x where x.entity_kind = 'person' and x.entity_id = p.person_id and x.external_key in ('wilsocj01', '00-0030141'))")"; fi
people_after=$(q "select count(*) from core.person where full_name not like 'Zzqtest%'")
check "every redirect points at a person"          0 "$(q "select count(*) from core.person_redirect r where not exists (select 1 from core.person p where p.person_id = r.person_id)")"
check "no redirected id is still a person"         0 "$(q "select count(*) from core.person_redirect r where exists (select 1 from core.person p where p.person_id = r.old_person_id)")"
echo "real people before $people_before, after $people_after"

echo "--- run 2 (must change nothing)"
snap() { q "select (select count(*) from core.person) || ' ' || (select count(*) from core.person_redirect) || ' ' || (select count(*) from meta.data_issue where entity_kind = 'person' and entity_key like 'merge:%') || ' ' || (select count(*) from core.roster_stint) || ' ' || (select count(*) from core.external_id where entity_kind = 'person') || ' ' || (select coalesce(sum(person_id), 0) from core.person) || ' ' || (select coalesce(sum(birth_date - date '1900-01-01'), 0) from core.person)"; }
s1=$(snap)
"${PSQL[@]}" -f "$S185" >/dev/null
s2=$(snap)
check "second run changes no count, id or date"   "$s1" "$s2"

[ "$fail" = 0 ] && echo "PASS" || { echo "FAILED"; exit 1; }

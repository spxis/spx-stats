#!/usr/bin/env bash
# Scratch-test NBA team stats for 1979 and 2023. Own Docker container, port 7740, removed by name.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
NAME=spx-nba-team-stats
PORT=7740
RAW=${SPX_NBA_STATS_RAW:-$HOME/Projects/backups/spx-stats/raw/wikipedia_nba_stats/2026-10-14}
export PGHOST=127.0.0.1 PGPORT=$PORT PGUSER=postgres PGDATABASE=spx_stats

if ! [ -d "$RAW" ]; then echo "missing raw dir $RAW" >&2; exit 1; fi
if docker inspect "$NAME" >/dev/null 2>&1; then docker rm -f "$NAME" >/dev/null; fi

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=spx_stats \
  -p 127.0.0.1:$PORT:5432 postgres:17-alpine >/dev/null
for i in $(seq 1 30); do
  pg_isready -h 127.0.0.1 -p $PORT -U postgres >/dev/null 2>&1 && break
  sleep 0.4
done
pg_isready -h 127.0.0.1 -p $PORT -U postgres >/dev/null

cd "$ROOT"
psql -X -v ON_ERROR_STOP=1 -q -f "$ROOT/scripts/team_stats/scratch_nba.sql"
python3 -I "$ROOT/scripts/team_stats/scratch_nba_load.py" "$RAW"
psql -X -v ON_ERROR_STOP=1 -q -f "$ROOT/db/build/185_team_season_stat_nba.sql"

psql -X -v ON_ERROR_STOP=1 -At -c "
select format('%s %s reb=%s pts=%s fg=%s', s.start_year, fi.full_name, t.stats->>'a_reb', t.stats->>'a_pts', t.stats->>'p_fg')
from core.team_season_stat t
join core.team_season ts using (team_season_id)
join core.season s using (season_id)
join core.franchise_identity fi on fi.franchise_identity_id = ts.franchise_identity_id
order by s.start_year, fi.full_name;
" | tee /tmp/spx-nba-team-stats.out

python3 -I - <<'PY'
import sys
rows = {}
for ln in open("/tmp/spx-nba-team-stats.out"):
    year, rest = ln.strip().split(" ", 1)
    club, *kv = rest.rsplit(" ", 2) if False else [rest]
    # "2023 Boston Celtics reb=46.2 pts=120.6 fg="
    parts = ln.strip().split()
    year = parts[0]
    # last three tokens are reb= pts= fg=
    reb, pts, fg = parts[-3], parts[-2], parts[-1]
    club = " ".join(parts[1:-3])
    rows[(int(year), club)] = {x.split("=",1)[0]: x.split("=",1)[1] for x in (reb, pts, fg)}

def num(s):
    return None if s in ("", "\\N") else float(s)

ok = True
def check(year, club, key, lo, hi):
    global ok
    r = rows.get((year, club))
    if not r:
        print("FAIL missing", year, club); ok = False; return
    v = num(r[key])
    if v is None or not (lo <= v <= hi):
        print(f"FAIL {year} {club} {key}={v} want {lo}..{hi}"); ok = False
    else:
        print(f"ok {year} {club} {key}={v}")

check(2023, "Golden State Warriors", "reb", 46.5, 47.0)
check(2023, "Boston Celtics", "reb", 46.0, 46.5)
check(2023, "Indiana Pacers", "pts", 123.0, 123.6)
if (1979, "Utah Jazz") in rows:
    print("FAIL 1979 Utah Jazz should be omitted (incomplete minutes)"); ok = False
else:
    print("ok 1979 Utah Jazz omitted")
if (1979, "Seattle SuperSonics") not in rows:
    print("FAIL 1979 Seattle SuperSonics missing"); ok = False
else:
    print("ok 1979 Seattle SuperSonics present", rows[(1979, "Seattle SuperSonics")])
n23 = sum(1 for y,c in rows if y == 2023)
n79 = sum(1 for y,c in rows if y == 1979)
print(f"rows 1979={n79} 2023={n23}")
if n23 < 25:
    print("FAIL expected at least 25 of 30 2023 teams"); ok = False
if n79 < 5:
    print("FAIL expected several 1979 teams"); ok = False
sys.exit(0 if ok else 1)
PY

echo "scratch NBA team stats: ok"

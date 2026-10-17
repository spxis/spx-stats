#!/usr/bin/env python3
"""Copy franchise names and people from the read-only preview PostgREST into scratch.

Not for DS1 or production. Preview default http://127.0.0.1:7750/
"""
import json, os, sys, urllib.request

REST = os.environ.get("SPX_PREVIEW_REST", "http://127.0.0.1:7750/").rstrip("/") + "/"
PG = {
    "host": os.environ.get("PGHOST", "127.0.0.1"),
    "port": os.environ.get("PGPORT", "7745"),
    "user": os.environ.get("PGUSER", "postgres"),
    "dbname": os.environ.get("PGDATABASE", "spx_stats"),
}


def get(view, query):
    req = urllib.request.Request(REST + view + "?" + query, headers={"Accept-Profile": "api"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def pages(view, select, extra=""):
    out, offset = [], 0
    while True:
        qy = f"select={select}&limit=1000&offset={offset}" + (f"&{extra}" if extra else "")
        chunk = get(view, qy)
        out.extend(chunk)
        if len(chunk) < 1000:
            return out
        offset += 1000


def sport_of(league):
    return {
        "nhl": "ice_hockey", "pwhl": "ice_hockey", "nha": "ice_hockey", "pcha": "ice_hockey",
        "wchl": "ice_hockey", "wha": "ice_hockey",
        "nba": "basketball", "wnba": "basketball",
        "mlb": "baseball",
        "nfl": "american_football", "afl": "american_football", "aafc": "american_football",
        "cfl": "canadian_football",
    }.get(league, "ice_hockey")


def main():
    import subprocess
    teams = pages("team_index", "franchise_id,league,name,former_names")
    people = pages("player_index", "person_id,name")
    print("preview teams", len(teams), "people", len(people))
    sql = ["begin;"]
    seen_f = set()
    for t in teams:
        f, lg, name = t["franchise_id"], t["league"], t["name"]
        if f not in seen_f:
            sql.append(
                f"insert into ref.league (league_code, sport_code, country_code) values "
                f"({q(lg)}, {q(sport_of(lg))}, 'US') on conflict do nothing;"
            )
            sql.append(
                f"insert into core.franchise (franchise_id, sport_code, source_id) values "
                f"({f}, {q(sport_of(lg))}, (select source_id from meta.source where code='scratch')) "
                f"on conflict do nothing;"
            )
            seen_f.add(f)
        sql.append(
            f"insert into ref.league (league_code, sport_code, country_code) values "
            f"({q(lg)}, {q(sport_of(lg))}, 'US') on conflict do nothing;"
        )
        sql.append(
            f"insert into core.franchise_league (franchise_id, league_code) values ({f}, {q(lg)}) "
            f"on conflict do nothing;"
        )
        names = [name] + list(t.get("former_names") or [])
        for n in names:
            if not n:
                continue
            sql.append(
                f"insert into core.franchise_identity (franchise_id, full_name, location, nickname, country_code) "
                f"values ({f}, {q(n)}, '', '', 'US');"
            )
    for p in people:
        if not p.get("name") or p.get("person_id") is None:
            continue
        sql.append(
            f"insert into core.person (person_id, full_name, source_id) values "
            f"({int(p['person_id'])}, {q(p['name'])}, (select source_id from meta.source where code='scratch')) "
            f"on conflict do nothing;"
        )
    sql.append("select count(*) from core.franchise;")
    sql.append("select count(*) from core.person;")
    sql.append("commit;")
    cmd = ["psql", "-v", "ON_ERROR_STOP=1", "-q",
           "-h", PG["host"], "-p", PG["port"], "-U", PG["user"], "-d", PG["dbname"]]
    proc = subprocess.run(cmd, input="\n".join(sql), text=True, capture_output=True)
    sys.stdout.write(proc.stdout)
    if proc.returncode:
        sys.stderr.write(proc.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

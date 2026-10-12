#!/usr/bin/env python3
"""Copy the head coaches and captains from the local working copy into Supabase without emptying anything.

  SUPABASE_ACCESS_TOKEN=... python3 -I scripts/staff/prod_load.py [--ref REF] [--dry-run]

Apply db/migrations/040_team_season_staff.sql to production first. Same pattern as scripts/players/prod_load.py: each table is read from the
local database (PG* variables, as scripts/supabase/load.py) with a filter and inserted `on conflict do nothing`. The local database must match
DS1 (the person and roster_stint ids are sent as they are). Run `select api.refresh();` afterwards (not needed for the view itself)."""
import argparse, importlib.util, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("pl", os.path.join(HERE, "..", "players", "prod_load.py"))
P = importlib.util.module_from_spec(spec); spec.loader.exec_module(P)
L = P.L
if os.environ.get("PGDATABASE") or os.environ.get("PGHOST"): L.LOCAL = ["psql", "-X", "-At", "-v", "ON_ERROR_STOP=1"]

STINTS = "(role = 'head_coach' or captaincy is not null)"
PEOPLE = f"person_id in (select person_id from core.roster_stint where {STINTS})"
LOADS = [
    ("meta.source", "code = 'wikipedia'"),
    ("core.person", PEOPLE),
    ("core.external_id", f"entity_kind = 'person' and entity_id in (select person_id from core.roster_stint where {STINTS})"),
    ("core.roster_stint", STINTS),
]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref", default="njpvfrceahkvnrduerkk")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if not token: raise SystemExit("SUPABASE_ACCESS_TOKEN is not set")
    L.preflight(a.ref, token, [t for t, _ in LOADS])
    if a.dry_run:
        for t, w in LOADS: print(t, L.local(f"select count(*) from {t} where {w}").strip())
        return
    L.api(a.ref, token, "update meta.source set attribution = $a$" + L.local("select attribution from meta.source where code = 'wikipedia'").strip() + "$a$, notes = $n$"
          + L.local("select notes from meta.source where code = 'wikipedia'").strip() + "$n$ where code = 'wikipedia'")
    for t, w in LOADS[1:]: P.load_part(a.ref, token, t, w)

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Copy core.team_season_stat from the local working copy into Supabase without emptying anything.

  SUPABASE_ACCESS_TOKEN=... python3 -I scripts/team_stats/prod_load.py [--ref REF] [--dry-run]

Apply db/migrations/042_team_season_stat.sql to production first (the schema check refuses otherwise; 041 is for DS1 only). Same pattern as scripts/players/prod_load.py: rows read with the PG* variables, inserted
`on conflict do nothing`. The local database must match DS1."""
import argparse, importlib.util, os
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("pl", os.path.join(HERE, "..", "players", "prod_load.py"))
P = importlib.util.module_from_spec(spec); spec.loader.exec_module(P)
L = P.L
if os.environ.get("PGDATABASE") or os.environ.get("PGHOST"): L.LOCAL = ["psql", "-X", "-At", "-v", "ON_ERROR_STOP=1"]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref", default="njpvfrceahkvnrduerkk")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if not token: raise SystemExit("SUPABASE_ACCESS_TOKEN is not set")
    L.preflight(a.ref, token, ["core.team_season_stat"])
    if a.dry_run:
        print("core.team_season_stat", L.local("select count(*) from core.team_season_stat").strip())
        return
    for code in ("nhl_api", "lahman", "nflverse"):
        L.api(a.ref, token, "update meta.source set notes = $n$" + L.local(f"select notes from meta.source where code = '{code}'").strip() + f"$n$ where code = '{code}'")
    P.load_part(a.ref, token, "core.team_season_stat", "true")

if __name__ == "__main__":
    main()

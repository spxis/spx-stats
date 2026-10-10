#!/usr/bin/env python3
"""Load the NHL API raw cache into legacy_nhlapi.game and .standing (upsert, so it can be rerun).

Usage: load.py [--cache DIR] [--seasons 20012002,...] [psql connection args after --]
Default connection: -h /tmp -p 55432 -U postgres -d spx_stats
"""
import argparse, csv, glob, io, json, os, subprocess, sys

def n(v): return "\\N" if v is None else v

def game_rows(cache, seasons):
    seen = {}
    for p in sorted(glob.glob(f"{cache}/club/*/*.json")):
        sea = p.split("/")[-2]
        if seasons and sea not in seasons: continue
        for g in json.load(open(p)).get("games", []):
            if g.get("gameType") not in (2, 3) or g["id"] in seen: continue
            a, h = g["awayTeam"], g["homeTeam"]
            seen[g["id"]] = [g["id"], g["season"], g["gameType"], g["gameDate"], a["abbrev"], h["abbrev"],
                             n(a.get("score")), n(h.get("score")), n((g.get("gameOutcome") or {}).get("lastPeriodType")),
                             n(g.get("gameState")), n((g.get("venue") or {}).get("default")), json.dumps(g)]
    return list(seen.values())

def rec(r, pre, sea):
    """w-l-t before 1999, w-l-t-otl 1999-2004, w-l-otl from 2005 (ties went, overtime losses stayed)."""
    y = int(sea[:4]); w, l = r.get(pre + "Wins"), r.get(pre + "Losses")
    if w is None: return None
    t, o = r.get(pre + "Ties") or 0, r.get(pre + "OtLosses") or 0
    return f"{w}-{l}-{t}" if y < 1999 else (f"{w}-{l}-{t}-{o}" if y < 2005 else f"{w}-{l}-{o}")

def standing_rows(cache, seasons):
    out = []
    for p in sorted(glob.glob(f"{cache}/standings/*.json")):
        sea, as_of = os.path.basename(p)[:-5].split("_")
        if seasons and sea not in seasons: continue
        d = json.load(open(p))
        rows = d.get("standings", [])
        # ties were counted until 2004-05, overtime losses from 1999-2000 on (both, 1999-2004)
        has_ties = int(sea[:4]) < 2005
        for r in rows:
            out.append([sea, as_of, r["teamAbbrev"]["default"], r.get("gamesPlayed"), r.get("wins"), r.get("losses"),
                        n(r.get("otLosses")), n(r.get("ties") if has_ties else None), r.get("points"),
                        r.get("goalFor"), r.get("goalAgainst"),
                        n(rec(r, "home", sea)), n(rec(r, "road", sea)), json.dumps(r)])
    return out

def copy(psql, table, cols, rows):
    buf = io.StringIO()
    csv.writer(buf, lineterminator="\n").writerows(rows)
    sql = f"create temp table t (like {table} including defaults); \\copy t ({cols}) from stdin with (format csv, null '\\N')"
    return sql, buf.getvalue()

def run(psql, sql, data):
    p = subprocess.run(psql + ["-v", "ON_ERROR_STOP=1", "-q", "-f", "-"], input=sql + ("\n" + data + "\\.\n" if data else ""),
                       text=True, capture_output=True)
    if p.returncode: sys.exit(p.stderr)
    return p.stdout

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--cache", default="raw/nhlapi"); ap.add_argument("--seasons")
    ap.add_argument("conn", nargs="*")
    a = ap.parse_args()
    psql = ["psql"] + (a.conn or ["-h", "/tmp", "-p", "55432", "-U", "postgres", "-d", "spx_stats"])
    seasons = set(a.seasons.split(",")) if a.seasons else None
    g, s = game_rows(a.cache, seasons), standing_rows(a.cache, seasons)
    gcols = "nhl_game_id,season,game_type,game_date,away_abbrev,home_abbrev,away_score,home_score,last_period_type,game_state,venue,row"
    scols = "season,as_of,team_abbrev,gp,w,l,ot_losses,ties,points,goals_for,goals_against,home_record,road_record,row"
    for table, cols, rows, key in (("legacy_nhlapi.game", gcols, g, "nhl_game_id"), ("legacy_nhlapi.standing", scols, s, "season,as_of,team_abbrev")):
        if not rows: continue
        sql, data = copy(psql, table, cols, rows)
        upd = ",".join(f"{c}=excluded.{c}" for c in cols.split(",") if c not in key.split(","))
        sql = f"begin; {sql}\n{data}\\.\ninsert into {table} ({cols}) select {cols} from t on conflict ({key}) do update set {upd}; commit;"
        run(psql, sql, "")
        print(f"{table}: {len(rows)} rows upserted")

if __name__ == "__main__":
    main()

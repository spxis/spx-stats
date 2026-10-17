#!/usr/bin/env python3
"""Load 1979 and 2023 Wikipedia NBA player-stat tables into a scratch database.

  scratch_nba_load.py <raw dir>   # connection from PGHOST/PGPORT (default 127.0.0.1:7740)
"""
import importlib.util, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "../.."))
spec = importlib.util.spec_from_file_location(
    "nba_wp_parse", os.path.join(ROOT, "scripts/player_stats/nba_wp_parse.py"))
P = importlib.util.module_from_spec(spec)
spec.loader.exec_module(P)

SEASONS = {1979, 2023}

def tsv(v):
    if v is None: return "\\N"
    return str(v).replace("\\", "\\\\").replace("\t", " ").replace("\n", " ").replace("\r", " ")

def q(s):
    return "'" + s.replace("'", "''") + "'"

def main(raw):
    arts, lines, clubs = [], [], []
    seen = set()
    for f in sorted(os.listdir(raw)):
        if not re.fullmatch(r"statpages-\d{3}\.json", f): continue
        for a in json.load(open(f"{raw}/{f}", encoding="utf-8"))["articles"]:
            if a["season"] not in SEASONS: continue
            ts = P.tables(a["html"]) if a.get("html") else []
            arts.append((a["season"], a["club"], a["title"], a["revid"], a.get("heading"), len(ts)))
            if (a["season"], a["club"]) not in seen:
                seen.add((a["season"], a["club"]))
                clubs.append((a["season"], a["club"]))
            for t in ts:
                for i, r in enumerate(t["rows"], 1):
                    lines.append((a["season"], a["club"], t["phase"], t["tbl"], i, r["name"], r["title"],
                                  json.dumps(r["cells"], ensure_ascii=False, separators=(",", ":"))))
    sql = [
        "begin;",
        "insert into core.season (league_code, start_year, end_year, label, games_per_team) values",
        "  ('nba', 1979, 1980, '1979-80', 82), ('nba', 2023, 2024, '2023-24', 82);",
    ]
    for i, (season, club) in enumerate(clubs, 1):
        sql.append(
            f"insert into core.franchise (franchise_id, sport_code) overriding system value values ({i}, 'basketball');\n"
            f"insert into core.franchise_identity (franchise_identity_id, franchise_id, full_name) overriding system value values ({i}, {i}, {q(club)});\n"
            f"insert into core.team_season (franchise_id, season_id, franchise_identity_id)\n"
            f"  select {i}, season_id, {i} from core.season where league_code = 'nba' and start_year = {season};"
        )
    sql += [
        "select setval(pg_get_serial_sequence('core.franchise', 'franchise_id'), (select max(franchise_id) from core.franchise));",
        "select setval(pg_get_serial_sequence('core.franchise_identity', 'franchise_identity_id'), (select max(franchise_identity_id) from core.franchise_identity));",
        "copy legacy_wikipedia_stats.nba_article (season, club, page_title, revid, heading, tables) from stdin;",
        *["\t".join(tsv(v) for v in a) for a in arts],
        "\\.",
        "copy legacy_wikipedia_stats.nba_line (season, club, phase, tbl, ord, name, link_title, cells) from stdin;",
        *["\t".join(tsv(v) for v in l) for l in lines],
        "\\.",
        "commit;",
    ]
    env = os.environ.copy()
    env.setdefault("PGHOST", "127.0.0.1")
    env.setdefault("PGPORT", "7740")
    env.setdefault("PGUSER", "postgres")
    env.setdefault("PGDATABASE", "spx_stats")
    p = subprocess.run(["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", "-"],
                       input="\n".join(sql) + "\n", text=True, env=env)
    if p.returncode: sys.exit(p.returncode)
    print(len(arts), "articles,", len(lines), "lines,", len(clubs), "clubs")

if __name__ == "__main__":
    if len(sys.argv) < 2: sys.exit(__doc__)
    main(sys.argv[1].rstrip("/"))

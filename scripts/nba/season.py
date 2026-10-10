#!/usr/bin/env python3
"""One NBA season at a time: fetch -> archive the raw wikitext -> parse -> load -> build.

  season.py YEAR [YEAR ...]   (2012 = 2012-13; BAA seasons 1946-1948 included)

For each season: fetch.py saves the season article, its standings templates and every club's
season article under CACHE (raw, never edited); every file is copied byte for byte into
legacy_files.raw_archive (name 'wikipedia/2026-10-10/<kind>/<file>') BEFORE anything is parsed;
the parsed rows replace that season's rows in legacy_wikipedia_nba; then db/build/147 is run so the
season shows in core at once. Never run build_core.sh from here.
Source: English Wikipedia (CC BY-SA 4.0), action=raw, one request per 2.5 s.
"""
import datetime, hashlib, io, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch as F, parse as P

PSQL = ["psql", "-h", "/tmp", "-p", "55432", "-U", "postgres", "-d", "spx_stats", "-v", "ON_ERROR_STOP=1", "-q"]
RUN_DATE = "2026-10-10"
BUILD = os.path.join(HERE, "..", "..", "db", "build", "147_nba_from_wikipedia.sql")

def psql(sql, inp=None):
    p = subprocess.run(PSQL + ["-c", sql] if inp is None else PSQL + ["-f", "-"], input=inp, text=True, capture_output=True)
    if p.returncode: raise RuntimeError(p.stderr)
    return p.stdout

def q(s):
    return "null" if s is None else "'" + str(s).replace("'", "''") + "'"

def archive(files):
    """Copy each raw file, byte for byte, into legacy_files.raw_archive (server reads the file itself)."""
    for f in files:
        path = os.path.join(F.CACHE, f)
        data = open(path, "rb").read()
        sha = hashlib.sha256(data).hexdigest()
        name = f"wikipedia/{RUN_DATE}/{f}"
        psql(f"insert into legacy_files.raw_archive (name, saved_on, sha256, data) values ({q(name)}, {q(RUN_DATE)}, {q(sha)}, pg_read_binary_file({q(path)})) "
             f"on conflict (name) do nothing")
        got = psql(f"select encode(sha256(data),'hex') = {q(sha)} from legacy_files.raw_archive where name = {q(name)}  ").split()
        if "t" not in got: raise RuntimeError("archive checksum mismatch " + name)

def read(sub, title):
    return F.page(sub, title)

def run(y):
    files, tpl, teams = F.fetch_season(y)
    if not files: print(y, "no season article"); return
    archive(files)
    stext = read("season", F.season_title(y))
    teams_set = set()
    title_of = {}
    for t in teams:
        nm = " ".join(t[len(F.season_label(y)) + 1: -7].replace("\xa0", " ").split())
        teams_set.add(nm); title_of[nm] = t
    views, unp, logn = {}, [], {}
    for nm, t in title_of.items():
        v, bad = P.parse_team_page(read("team", t), y, nm)
        views[nm] = v; logn[nm] = len(v)
        unp += [(t, b) for b in bad]
    games, unres = P.pair(views, teams_set)
    unp += [("(unresolved opponent)", u) for u in unres]
    st = []
    for t in tpl:
        for r in P.parse_standings(read("template", "Template:" + t), y):
            r["division"] = t; st.append(r)
    for r in st: r["team"] = " ".join(r["team"].replace("\xa0", " ").split())
    out = [f"begin;",
           f"delete from legacy_wikipedia_nba.season where season = {y};",
           f"delete from legacy_wikipedia_nba.team_season where season = {y};",
           f"delete from legacy_wikipedia_nba.game where season = {y};",
           f"delete from legacy_wikipedia_nba.standing where season = {y};",
           f"delete from legacy_wikipedia_nba.unparsed where season = {y};",
           f"insert into legacy_wikipedia_nba.season values ({y}, {q(F.season_title(y))}, {len(teams_set)}, {q(RUN_DATE)});"]
    for nm, t in title_of.items():
        out.append(f"insert into legacy_wikipedia_nba.team_season values ({y}, {q(nm)}, {q(t)}, {logn[nm]});")
    for g in games:
        out.append("insert into legacy_wikipedia_nba.game values (%d,%s,%s,%s,%s,%s,%d,%d,%s,%s,%d,%s,%s,%d);" % (
            y, q(g["phase"]), q(g["date"]), q(g["round"]), q(g["home"]), q(g["away"]), g["home_pts"], g["away_pts"],
            "true" if g["ot"] else "false", "true" if g["neutral"] else "false", g["views"],
            q("; ".join(x for x in (g["conflict"], "opponent guessed" if g["ambiguous"] else None) if x) or None), q(g["src"]), g["seq"]))
    seen = set()
    for r in st:
        k = (r["team"], r["division"])
        if k in seen: continue
        seen.add(k)
        gp = r.get("gp") or ((r["w"] or 0) + (r["l"] or 0) if r.get("w") is not None else None)
        out.append("insert into legacy_wikipedia_nba.standing values (%d,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s);" % (
            y, q(r["team"]), q(r["division"]), q(gp) if gp is None else gp, q(r.get("w")) if r.get("w") is None else r["w"],
            q(r.get("l")) if r.get("l") is None else r["l"], q(r.get("pct")), q(r.get("gb")), q(r.get("home")), q(r.get("road")),
            q(r.get("div")), q(r["src"])))
    for page, txt in unp:
        out.append(f"insert into legacy_wikipedia_nba.unparsed values ({y}, {q(page)}, {q(txt)});")
    out.append("commit;")
    subprocess.run(PSQL + ["-f", "-"], input="\n".join(out) + "\n", text=True, check=True)
    if os.environ.get("NOBUILD"):
        print(f"{y}: files={len(files)} teams={len(teams_set)} games={len(games)} standings={len(seen)} unparsed={len(unp)} (147 not run)"); return
    p = subprocess.run(PSQL[:-1] + ["-f", BUILD], capture_output=True, text=True)
    if p.returncode: raise RuntimeError("147 failed: " + p.stderr)
    print(f"{y}: files={len(files)} teams={len(teams_set)} games={len(games)} standings={len(seen)} unparsed={len(unp)}")
    print(p.stdout.strip().split("\n")[-12:] and "\n".join(p.stdout.strip().split("\n")[-12:]))

if __name__ == "__main__":
    for a in sys.argv[1:]: run(int(a))

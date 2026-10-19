#!/usr/bin/env python3
"""Parse the NBA club-season articles already archived on DS1 again, with the current parse.py. No fetching, no new download.

  reparse.py [--write] [--dir DIR] [--all | YEAR ...]       YEAR = the year a season starts (1985 = 1985-86); --all = every season with team pages

Why: parse.py learned more layouts (a date with its year, {{dow tooltip}} dates, header cells, a Visitor | Score | Home table, a weekday in the
date, colour spans), so articles whose game log it used to skip now give their games. The raw wikitext does not change: it is read from
legacy_files.raw_archive (name 'wikipedia/2026-10-10/team/<page>.wikitext', archived by season.py), and the page list is
legacy_wikipedia_nba.team_season.

Without --write it only prints, per season, the games now in legacy_wikipedia_nba.game against the games this parse gives (nothing is written).
With --write it replaces, for the named seasons only, the rows of legacy_wikipedia_nba.game, .team_season and .unparsed (standings and season
rows are not touched), each season in one transaction. Then run db/build/147_nba_from_wikipedia.sql, which rebuilds the Wikipedia games of core.
--dir DIR reads DIR/<season>_<team name with _>.wikitext files instead of DS1's archive (offline test).

DS1 is reached with scripts/daily/ds1.sh; NBA_PSQL (a command that reads SQL on stdin, e.g. "psql -h 127.0.0.1 -p 7741 -U postgres -q -At")
points it at a scratch database instead. Only the coordinating session writes DS1.
"""
import base64, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import parse as P   # noqa: E402

DS1 = os.path.join(HERE, "..", "daily", "ds1.sh")
S = "legacy_wikipedia_nba"
RAW = "wikipedia/2026-10-10/team/"

def psql(sql):
    cmd = os.environ["NBA_PSQL"].split() if os.environ.get("NBA_PSQL") else ["bash", DS1, "-q", "-At", "-f", "-"]
    p = subprocess.run(cmd, input=sql, text=True, capture_output=True)
    if p.returncode: raise RuntimeError(p.stderr[-1500:])
    return p.stdout

def q(s):
    return "null" if s is None else "'" + str(s).replace("'", "''") + "'"

def fname(title):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", title) + ".wikitext"

def team_pages(season):
    out = psql(f"select team_name || E'\\t' || page_title from {S}.team_season where season = {season} order by team_name;")
    return [tuple(l.split("\t")) for l in out.splitlines() if "\t" in l]

def page_text(season, team, title, dirname):
    if dirname:
        path = os.path.join(dirname, f"{season}_{team.replace(' ', '_')}.wikitext")
        return open(path, encoding="utf-8").read() if os.path.exists(path) else None
    b64 = psql(f"select replace(encode(data, 'base64'), E'\\n', '') from legacy_files.raw_archive where name = {q(RAW + fname(title))};").strip()
    if not b64: return None
    t = base64.b64decode(b64).decode("utf-8")
    return None if t.startswith("#MISSING 404") else t

def reparse(season, dirname):
    pages = team_pages(season)
    views, unp, logn, missing = {}, [], {}, []
    for team, title in pages:
        t = page_text(season, team, title, dirname)
        if t is None: missing.append(title); logn[team] = 0; views[team] = []; continue
        v, bad = P.parse_team_page(t, season, team)
        views[team] = v; logn[team] = len(v)
        unp += [(title, b) for b in bad]
    games, unres = P.pair(views, {t for t, _ in pages})
    unp += [("(unresolved opponent)", u) for u in unres]
    return pages, games, unp, logn, missing

def sql_for(season, pages, games, unp, logn):
    out = ["begin;", f"delete from {S}.team_season where season = {season};", f"delete from {S}.game where season = {season};",
           f"delete from {S}.unparsed where season = {season};"]
    for team, title in pages:
        out.append(f"insert into {S}.team_season values ({season}, {q(team)}, {q(title)}, {logn[team]});")
    for g in games:
        out.append("insert into %s.game values (%d,%s,%s,%s,%s,%s,%d,%d,%s,%s,%d,%s,%s,%d);" % (
            S, season, q(g["phase"]), q(g["date"]), q(g["round"]), q(g["home"]), q(g["away"]), g["home_pts"], g["away_pts"],
            "true" if g["ot"] else "false", "true" if g["neutral"] else "false", g["views"],
            q("; ".join(x for x in (g["conflict"], "opponent guessed" if g["ambiguous"] else None) if x) or None), q(g["src"]), g["seq"]))
    for page, txt in unp:
        out.append(f"insert into {S}.unparsed values ({season}, {q(page)}, {q(txt)});")
    out.append("commit;")
    return "\n".join(out) + "\n"

def main(argv):
    write = "--write" in argv
    dirname = None
    args = [a for a in argv if a != "--write"]
    if "--dir" in args:
        k = args.index("--dir"); dirname = args[k + 1]; del args[k:k + 2]
    if args == ["--all"]:
        seasons = [int(x) for x in psql(f"select distinct season from {S}.team_season order by 1;").split()]
    else:
        seasons = [int(a) for a in args]
    if not seasons: sys.exit(__doc__)
    tot_old = tot_new = 0
    for y in seasons:
        pages, games, unp, logn, missing = reparse(y, dirname)
        old = psql(f"select count(*) filter (where phase = 'regular') || ' ' || count(*) filter (where phase = 'playoffs') from {S}.game where season = {y};").split()
        reg = sum(1 for g in games if g["phase"] == "regular"); po = len(games) - reg
        tot_old += int(old[0]) + int(old[1]); tot_new += len(games)
        print(f"{y}: regular {old[0]} -> {reg}, playoffs {old[1]} -> {po}, unparsed {len(unp)}, pages without a raw file {len(missing)}", flush=True)
        if write:
            if missing: print(f"  {y}: skipped, raw pages missing: {missing[:3]}"); continue
            psql(sql_for(y, pages, games, unp, logn))
    print(f"games {tot_old} -> {tot_new}" + ("" if write else "  (nothing written; add --write)"))

if __name__ == "__main__":
    main(sys.argv[1:])

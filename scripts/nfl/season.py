#!/usr/bin/env python3
"""One football season at a time: fetch -> archive the raw wikitext -> parse -> load legacy_wikipedia_<league>.

  season.py [--league nfl|afl|aafc] [--dry] [--no-archive] YEAR [YEAR ...]       (1987 = the 1987 NFL season; the NFL's seasons 1920 on)
  season.py [--league L] [--dry] --range 1973 1998

Leagues: nfl (the default; the APFA of 1920-21 is the same league under its first name, so it loads as NFL), afl (the American Football
League, 1960-1969) and aafc (the All-America Football Conference, 1946-1949; fetched and checked, loaded only when John says so).
The NFL's rows go to legacy_wikipedia_nfl (migration 054), the AFL's to legacy_wikipedia_afl (migration 109); the core tables are built
from them by db/build/151_nfl_from_wikipedia.sql, which is a separate, reviewed step.

For each season: fetch.py saves the season article, its standings templates and every club's season
article under the cache (raw, never edited); every file is copied byte for byte into DS1's
legacy_files.raw_archive (name 'wikipedia-<league>/<year>/<kind>/<file>', so the Dropbox copy made by
scripts/mac/spx-raw-export.sh lands in one folder per year) BEFORE anything is parsed; the parsed
rows replace that season's rows in the league's legacy schema.
--dry fetches and parses and prints the counts and the checks, and writes nothing to DS1.
Source: English Wikipedia (CC BY-SA 4.0), action=raw, one request per 2.5 s.
DS1 is reached with scripts/daily/ds1.sh (host and keychain password are found inside it; nothing is printed).
NFL_RUN_DATE and NFL_CACHE name the day and the folder of the raw files (fetch.py).
"""
import collections, hashlib, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch as F, parse as P

DS1 = os.path.join(HERE, "..", "daily", "ds1.sh")
NO_ARCHIVE = "--no-archive" in sys.argv   # a re-parse of files already archived


def psql(sql):
    # NFL_PSQL: a command that reads SQL on stdin and runs it somewhere else (a scratch Postgres for a test run); unset = DS1
    cmd = os.environ["NFL_PSQL"].split() if os.environ.get("NFL_PSQL") else ["bash", DS1, "-q", "-f", "-"]
    p = subprocess.run(cmd, input=sql, text=True, capture_output=True)
    if p.returncode: raise RuntimeError(p.stderr[-1500:])
    return p.stdout


def q(s):
    return "null" if s is None else "'" + str(s).replace("'", "''") + "'"


def schema_of(league): return "legacy_wikipedia_nfl" if league == "nfl" else f"legacy_wikipedia_{league}"


def archive(league, year, files):
    """Copy each raw file, byte for byte, into legacy_files.raw_archive and check the stored hash."""
    for f in files:
        data = open(os.path.join(F.CACHE, f), "rb").read()
        sha = hashlib.sha256(data).hexdigest()
        name = f"wikipedia-{league}/{year}/{f}"
        psql(f"insert into legacy_files.raw_archive (name, saved_on, sha256, data) values ({q(name)}, {q(F.RUN_DATE)}, {q(sha)}, decode('{data.hex()}', 'hex')) "
             f"on conflict (name) do nothing;")
        got = psql(f"select encode(sha256(data), 'hex') = {q(sha)} from legacy_files.raw_archive where name = {q(name)};").split()
        if "t" not in got: raise RuntimeError("archive checksum mismatch " + name)


def check(games, nodate, std):
    """Published standings against the games as parsed: W-L-T and points for/against per club."""
    tot = collections.defaultdict(lambda: [0, 0, 0, 0, 0])
    for g in games + nodate:
        if g["phase"] != "regular": continue
        for side, f, a in (("home", g["home_pts"], g["away_pts"]), ("away", g["away_pts"], g["home_pts"])):
            t = tot[g[side]]
            t[0 if f > a else 1 if f < a else 2] += 1
            t[3] += f; t[4] += a
    out = []
    seen = set()
    for r in std:
        if r["team"] in seen: continue
        seen.add(r["team"])
        t = tot.get(r["team"], [0, 0, 0, 0, 0])
        pub = (r["w"], r["l"], r["t"], r.get("pf"), r.get("pa"))
        if tuple(t) != pub: out.append((r["team"], pub, tuple(t)))
    return out


def champion_of(text):
    """The champion the season article's infobox names (NFLchampion, AFLchampion, ...), as plain text, or None."""
    m = re.search(r"^\s*\|\s*(?:NFL|AFL|AAFC)?\s*champion\s*=\s*(.+)$", text, re.I | re.M)
    if not m: return None
    return P.clean(m.group(1)) or None


def inline_standings(text, y):
    """Standings a season article carries as its own wikitable (no standings template): the first table of a
    'standings' section that has a W column. -> rows, as P.parse_standings reads a template."""
    for m in re.finditer(r"^(={2,4})\s*[^=\n]*standings[^=\n]*\1\s*$", text, re.I | re.M):
        rest = text[m.end():]
        nxt = re.search(r"^={2,4}[^=]", rest, re.M)
        rows = P.parse_standings(rest[:nxt.start()] if nxt else rest, y)
        if rows: return rows
    return []


def run(y, dry=False, league="nfl"):
    files, tpl, teams = F.fetch_season(y, league)
    if not files:
        print(league, y, "no season article"); return
    if not dry and not NO_ARCHIVE: archive(league, y, files)
    stext = F.page("season", F.season_title(y, league)) or ""
    title_of = {}
    for t in teams:
        nm = re.sub(r"\s*\([^)]*\)$", "", t[len(str(y)) + 1:-7].strip())
        title_of[nm] = t
    title_of.update(F.extra_clubs(y, league))
    views, unp, logn = {}, [], {}
    for nm, t in title_of.items():
        v, bad = P.parse_team_page(F.page("team", t), y, nm)
        views[nm] = v
        unp += [(t, b) for b in bad]
    # a season article that lists every game of the league (1920): add the games the clubs' own articles lack
    # (the 1920 table names the Cardinals by their Racine home)
    tv, skipped = P.table_views(P.parse_league_table(stext, y), set(title_of), {"Racine Cardinals": "Chicago Cardinals"})
    added = 0
    for nm, vs in tv.items():
        have = views.setdefault(nm, [])
        for v in vs:
            if any(P.resolve(h["opp_text"], h["opp_link"], set(title_of), me=nm) == [v["opp_text"]] and h["date"] is not None and abs((h["date"] - v["date"]).days) <= 1
                   for h in have): continue
            have.append(v); added += 1
    unp += [("(league table)", s) for s in skipped if not re.search(r"dagger", s, re.I)]
    for nm in title_of: logn[nm] = len(views.get(nm, []))
    games, unres, nodate = P.pair(views, set(title_of))
    unp += [("(unresolved opponent)", u) for u in unres]
    unp += [("(no date in either log)", f"{g['phase']} {g['away']} {g['away_pts']} at {g['home']} {g['home_pts']}: {g['src']}") for g in nodate]
    st = []
    for t in tpl:
        for r in P.parse_standings(F.page("template", "Template:" + t), y):
            r["division"] = t; st.append(r)
    if not st:
        for r in inline_standings(stext, y):
            r["division"] = f"{y} {F.LEAGUE_TITLE[league]} standings"; st.append(r)
    seen_st, st_u = set(), []
    for r in st:
        if (r["team"], r["division"]) in seen_st: continue
        seen_st.add((r["team"], r["division"])); st_u.append(r)
    games = P.adjudicate(games, st_u)
    mism = check(games, nodate, st_u)
    reg = sum(1 for g in games if g["phase"] == "regular")
    champ = champion_of(stext)
    summary = (f"{league} {y}: files={len(files)} teams={len(title_of)} games={len(games)} (regular {reg}, playoffs {len(games) - reg}) "
               f"standings={len(st_u)} unparsed={len(unp)} nodate={len(nodate)} log-conflicts={sum(1 for g in games if g['conflict'])} "
               f"standing-vs-games differences={len(mism)} table-games-added={added} champion={champ}")
    print(summary)
    for m in mism[:6]: print("   differs:", m)
    for b in unp[:6]: print("   unparsed:", b)
    if dry: return
    S = schema_of(league)
    out = ["begin;",
           f"delete from {S}.season where season = {y};",
           f"delete from {S}.team_season where season = {y};",
           f"delete from {S}.game where season = {y};",
           f"delete from {S}.standing where season = {y};",
           f"delete from {S}.unparsed where season = {y};",
           f"insert into {S}.season (season, page_title, teams, fetched_on, champion) values ({y}, {q(F.season_title(y, league))}, {len(title_of)}, {q(F.RUN_DATE)}, {q(champ)});"]
    for nm, t in title_of.items():
        out.append(f"insert into {S}.team_season values ({y}, {q(nm)}, {q(t)}, {logn[nm]});")
    for g in games:
        out.append("insert into %s.game values (%d,%s,%s,%s,%s,%s,%s,%d,%d,%s,%s,%d,%s,%s,%d);" % (
            S, y, q(g["phase"]), q(g["date"]), q(g["week"]) if g["week"] is None else g["week"], q(g["round"]), q(g["home"]), q(g["away"]),
            g["home_pts"], g["away_pts"], "true" if g["ot"] else "false", "true" if g["neutral"] else "false", g["views"],
            q("; ".join(x for x in (g["conflict"], "opponent guessed" if g["ambiguous"] else None) if x) or None), q(g["src"]), g["seq"]))
    n = lambda v: "null" if v is None else str(v)
    for r in st_u:
        out.append("insert into %s.standing values (%d,%s,%s,%d,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s);" % (
            S, y, q(r["team"]), q(r["division"]), r["rank"], n(r.get("seed")), n(r.get("w")), n(r.get("l")), n(r.get("t")), q(r.get("pct")),
            q(r.get("div")), q(r.get("conf")), n(r.get("pf")), n(r.get("pa")), q(r.get("stk")), q(r["src"])))
    for page, txt in unp:
        out.append(f"insert into {S}.unparsed values ({y}, {q(page)}, {q(txt)});")
    out.append("commit;")
    psql("\n".join(out) + "\n")


if __name__ == "__main__":
    a = sys.argv[1:]
    dry = "--dry" in a
    lg = "nfl"
    if "--league" in a:
        i = a.index("--league"); lg = a[i + 1]; del a[i:i + 2]
    if lg not in F.LEAGUE_TITLE: raise SystemExit("league must be one of " + ", ".join(F.LEAGUE_TITLE))
    a = [x for x in a if x not in ("--dry", "--no-archive")]
    if a and a[0] == "--range": years = range(int(a[1]), int(a[2]) + 1)
    else: years = [int(x) for x in a]
    for y in years: run(y, dry, lg)

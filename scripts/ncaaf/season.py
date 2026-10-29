#!/usr/bin/env python3
"""One college football season at a time: read the cached Wikipedia pages (fetch.py) -> parse -> write the archive and load SQL files.

  season.py [--out DIR] [--dry] YEAR [YEAR ...]        e.g. season.py --out ~/scratch 2005 2019
  season.py [--out DIR] [--dry] --range 2000 2025

For each year it writes, into DIR (default ./out, outside the repository for real runs):
  archive-<year>.sql   the raw pages of that year, byte for byte, into legacy_files.raw_archive as 'wikipedia-ncaaf/<year>/<kind>/<file>' (on conflict do nothing)
  load-<year>.sql      replaces that year's rows in legacy_wikipedia_ncaaf (migration 159)
Nothing is written to a database here. NCAAF_PSQL names a command that reads SQL on stdin (a scratch Postgres for a test run); with it set each
file is applied after it is written, archive first. The coordinating session applies the files to DS1 with scripts/mac/ds1-apply.sh.
--dry parses and prints the counts and the checks, writes nothing.
Source: English Wikipedia (CC BY-SA 4.0). NCAAF_CACHE names the raw folder (fetch.py).
"""
import collections, hashlib, json, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch as F, parse as P


def q(s): return "null" if s is None else "'" + str(s).replace("'", "''") + "'"
def n(v): return "null" if v is None else str(int(v)) if not isinstance(v, bool) else ("true" if v else "false")


def read(sub, title, y):
    p = os.path.join(F.CACHE, str(y), sub, F.fname(title))
    if not os.path.exists(p): return None
    t = open(p, encoding="utf-8").read()
    return None if t.startswith("#MISSING 404") else t


def build(y):
    log = F.load_log()
    stext = read("season", F.season_title(y), y)
    if stext is None: return None
    info = P.parse_season(stext)
    tpl = F.template_titles(y, stext)
    standings, files = [], [("season", F.fname(F.season_title(y)))]
    for t in tpl:
        tx = read("template", "Template:" + t, y)
        files.append(("template", F.fname("Template:" + t)))
        if tx: standings += P.parse_standings(tx, y, t)
    resolved = {}
    for r in standings:
        if r["team_title"]:
            e = log.get(f"{y}/team/{F.fname(r['team_title'])}")
            if e: resolved[r["team_title"]] = e["title"]
    season = P.Season(y, standings, resolved)
    views, infos, unp, titles, missing = {}, {}, [], {}, []
    for r in standings:
        if not r.get("team_name"):
            unp.append(("standings", f"{r['team_text']}: no team-season article linked")); continue
        nm, t = r["team_name"], r["team_title"]
        titles[nm] = t
        tx = read("team", t, y)
        files.append(("team", F.fname(t)))
        if tx is None: missing.append(nm); views[nm] = []; infos[nm] = {}; continue
        inf, vs, bad = P.parse_team(tx, y, t)
        views[nm], infos[nm] = vs, inf
        unp += [(t, b) for b in bad]
    games, notes = P.pair(season, views)
    unp += [("(pairing)", x) for x in notes]
    # published records against the games
    tot = collections.defaultdict(lambda: [0, 0, 0])
    for g in games:
        for side, f, a in (("home", g["home_pts"], g["away_pts"]), ("away", g["away_pts"], g["home_pts"])):
            tot[g[side]][0 if f > a else 1 if f < a else 2] += 1
    diff = [(r["team_name"], (r["w"], r["l"], r["t"] or 0), tuple(tot.get(r["team_name"], [0, 0, 0]))) for r in standings
            if r.get("team_name") and (r["w"], r["l"], r["t"] or 0) != tuple(tot.get(r["team_name"], [0, 0, 0]))]
    # outside opponents
    outside = sorted({g["outside_team"] for g in games if g.get("outside_team")})
    logn = collections.Counter()
    for g in games:
        logn[g["home"]] += 1; logn[g["away"]] += 1
    return {"y": y, "info": info, "standings": standings, "infos": infos, "titles": titles, "missing": missing, "games": games, "unparsed": unp,
            "diff": diff, "outside": outside, "outside_school": season.outside_school, "files": files, "log": log, "tpl": tpl, "logn": logn}


def champion_of(b):
    """The national champion: the winner of the national championship game. The game is the one the season infobox names ('championship_bowl',
    e.g. '2006 Rose Bowl'); failing that, a game whose name says National Championship. -> (team name, basis) or (None, None)."""
    po = [g for g in b["games"] if g["phase"] == "playoffs" and g["home_pts"] != g["away_pts"]]
    cb = (b["info"].get("championship_bowl") or "")
    m = re.match(r"\s*(\d{4})\s+(.*?)\s*$", cb)
    cand = []
    if m:
        yr, nm = int(m.group(1)), m.group(2).lower()
        cand = [g for g in po if g["date"].year == yr and nm and nm in (g["round"] or "").lower()]
    if not cand:
        cand = [g for g in po if re.search(r"National Championship|BCS (?:NCG|National)|BCS Championship", g["round"] or "", re.I)]
    if not cand: return None, None
    g = max(cand, key=lambda g: g["date"])
    return (g["home"] if g["home_pts"] > g["away_pts"] else g["away"]), "game: " + (g["round"] or "")


def sql_for(b):
    y, S = b["y"], "legacy_wikipedia_ncaaf"
    info, log = b["info"], b["log"]
    champ, basis = champion_of(b)
    rev = lambda sub, title: (log.get(f"{y}/{sub}/{F.fname(title)}") or {}).get("revid")
    out = ["begin;"] + [f"delete from {S}.{t} where season = {y};" for t in ("game", "standing", "team_season", "unparsed", "season")]
    out.append(f"insert into {S}.season (season, page_title, revid, fetched_on, teams, champion, champion_basis, infobox_champions, system, bowl_start) values "
               f"({y}, {q(F.season_title(y))}, {n(rev('season', F.season_title(y)))}, {q(F.RUN_DATE)}, {len(b['standings'])}, {q(champ)}, {q(basis)}, {q(info.get('champions'))}, {q(info.get('system'))}, {q(info.get('bowl_start'))});")
    rows = {}
    for r in b["standings"]:
        nm = r.get("team_name")
        if not nm: continue
        inf = b["infos"].get(nm, {})
        rows[nm] = (r["team_text"], b["titles"][nm], rev("team", b["titles"][nm]), "fbs", r["conference"], r["division"], inf.get("conference"), inf.get("division"))
    for nm in b["outside"]:
        rows.setdefault(nm, (b["outside_school"].get(nm), None, None, "other", None, None, None, None))
    for nm, (school, title, rv, cl, conf, div, iconf, idiv) in sorted(rows.items()):
        out.append(f"insert into {S}.team_season values ({y}, {q(nm)}, {q(school)}, {q(title)}, {n(rv)}, {q(cl)}, {q(conf)}, {q(div)}, {q(iconf)}, {q(idiv)}, {b['logn'].get(nm, 0)});")
    for r in b["standings"]:
        nm = r.get("team_name")
        if not nm: continue
        out.append(f"insert into {S}.standing values ({y}, {q(nm)}, {q(r['conference'])}, {q(r['division'])}, {r['rank']}, {n(r['cw'])}, {n(r['cl'])}, {n(r['ct'])}, {n(r['w'])}, {n(r['l'])}, {n(r['t'])}, "
                   f"{n(r['div_champ'])}, {n(r['conf_champ'])}, {n(r['natl_champ'])}, {n(r['co_champ'])});")
    for g in b["games"]:
        out.append(f"insert into {S}.game values ({y}, {q(g['phase'])}, {q(g['date'])}, {q(g['round'])}, {q(g['home'])}, {q(g['away'])}, {g['home_pts']}, {g['away_pts']}, "
                   f"{n(g['ot'])}, {n(g['neutral'])}, {q(g['venue'])}, {n(g['attend'])}, {g['views']}, {q(g['conflict'])}, {q(g['src'])}, {g['seq']}, {n(g['nonconf'])});")
    for page, txt in b["unparsed"]:
        out.append(f"insert into {S}.unparsed values ({y}, {q(page)}, {q(txt)});")
    out.append("commit;")
    return "\n".join(out) + "\n"


def archive_sql(b):
    y, out = b["y"], []
    for sub, f in sorted(set(b["files"])):
        p = os.path.join(F.CACHE, str(y), sub, f)
        if not os.path.exists(p): continue
        data = open(p, "rb").read()
        name = f"wikipedia-ncaaf/{y}/{sub}/{f}"
        out.append(f"insert into legacy_files.raw_archive (name, saved_on, sha256, data) values ({q(name)}, {q(F.RUN_DATE)}, {q(hashlib.sha256(data).hexdigest())}, decode('{data.hex()}', 'hex')) on conflict (name) do nothing;")
    return "\n".join(out) + "\n"


def psql(sql):
    cmd = os.environ["NCAAF_PSQL"].split()
    p = subprocess.run(cmd, input=sql, text=True, capture_output=True)
    if p.returncode: raise RuntimeError(p.stderr[-1500:])


def summary(b):
    g = b["games"]
    reg = sum(1 for x in g if x["phase"] == "regular")
    champ, basis = champion_of(b)
    return (f"{b['y']}: teams={len(b['standings'])} missing-pages={len(b['missing'])} games={len(g)} (regular {reg}, postseason {len(g) - reg}) "
            f"vs-outside={sum(1 for x in g if not x['inside'])} outside-teams={len(b['outside'])} conflicts={sum(1 for x in g if x['conflict'])} "
            f"unparsed={len(b['unparsed'])} record-differences={len(b['diff'])} champion={champ}")


if __name__ == "__main__":
    a = sys.argv[1:]
    dry = "--dry" in a
    outdir = "out"
    if "--out" in a: i = a.index("--out"); outdir = os.path.expanduser(a[i + 1]); del a[i:i + 2]
    a = [x for x in a if x != "--dry"]
    years = range(int(a[1]), int(a[2]) + 1) if a and a[0] == "--range" else [int(x) for x in a]
    if not dry: os.makedirs(outdir, exist_ok=True)
    for y in years:
        b = build(y)
        if b is None: print(y, "no season article"); continue
        print(summary(b))
        if dry: continue
        arc, load = archive_sql(b), sql_for(b)
        open(os.path.join(outdir, f"archive-{y}.sql"), "w").write(arc)
        open(os.path.join(outdir, f"load-{y}.sql"), "w").write(load)
        if os.environ.get("NCAAF_PSQL"): psql(arc); psql(load)

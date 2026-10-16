#!/usr/bin/env python3
"""One WNBA season at a time: fetch -> archive the raw wikitext -> parse -> load legacy_wikipedia_wnba (migration 126).

  season.py [--dry] [--no-archive] YEAR [YEAR ...]       (1997 = the 1997 WNBA season)
  season.py [--dry] [--no-archive] --range 1997 2024

For each season: fetch.py saves the season article, its standings templates and every club's season
article under the cache (raw, never edited); every file is copied byte for byte into
legacy_files.raw_archive (name 'wikipedia-wnba/<year>/<kind>/<file>') BEFORE anything is parsed;
the parsed rows replace that season's rows in legacy_wikipedia_wnba.
--dry fetches and parses and prints the counts and the checks, and writes nothing.
Source: English Wikipedia (CC BY-SA 4.0), action=raw, one request per 2.5 s.
DS1 is reached with scripts/daily/ds1.sh; WNBA_PSQL (a command that reads SQL on stdin) points the
loader at a scratch database instead. WNBA_RUN_DATE and WNBA_CACHE name the day and the folder of the raw files.
The core tables are built from these rows by db/build/216_wnba_from_wikipedia.sql, a separate, reviewed step.
Never used: Sports Reference, ESPN, the WNBA's own feeds.
"""
import collections, hashlib, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch as F, parse as P

DS1 = os.path.join(HERE, "..", "daily", "ds1.sh")
S = "legacy_wikipedia_wnba"
NO_ARCHIVE = "--no-archive" in sys.argv


def psql(sql):
    cmd = os.environ["WNBA_PSQL"].split() if os.environ.get("WNBA_PSQL") else ["bash", DS1, "-q", "-f", "-"]
    p = subprocess.run(cmd, input=sql, text=True, capture_output=True)
    if p.returncode: raise RuntimeError(p.stderr[-1500:])
    return p.stdout


def q(s):
    return "null" if s is None else "'" + str(s).replace("'", "''") + "'"


def n(v):
    return "null" if v is None else str(v)


def archive(year, files):
    """Copy each raw file, byte for byte, into legacy_files.raw_archive and check the stored hash."""
    for f in files:
        data = open(os.path.join(F.CACHE, f), "rb").read()
        sha = hashlib.sha256(data).hexdigest()
        name = f"wikipedia-wnba/{year}/{f}"
        psql(f"insert into legacy_files.raw_archive (name, saved_on, sha256, data) values ({q(name)}, {q(F.RUN_DATE)}, {q(sha)}, decode('{data.hex()}', 'hex')) "
             f"on conflict (name) do nothing;")
        got = psql(f"select encode(sha256(data), 'hex') = {q(sha)} from legacy_files.raw_archive where name = {q(name)};").split()
        if "t" not in got: raise RuntimeError("archive checksum mismatch " + name)


def champion_of(text):
    """The champion the season article's infobox names (finals_champ), as plain text, or None."""
    m = re.search(r"^\s*\|\s*finals_champ\s*=\s*(.+)$", text, re.I | re.M)
    if not m: return None
    t = m.group(1).strip()
    t = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"\{\{[^}]*\}\}|<[^>]*>|'''|''", "", t)
    t = re.sub(r"\s*\([^)]*title[^)]*\)\s*", " ", t, flags=re.I)
    t = re.sub(r"\s+", " ", t).strip(" |")
    return t or None


def check(games, std):
    """Published standings against the games as parsed: W-L per club."""
    tot = collections.defaultdict(lambda: [0, 0])
    for g in games:
        if g["phase"] != "regular": continue
        for side, f, a in (("home", g["home_pts"], g["away_pts"]), ("away", g["away_pts"], g["home_pts"])):
            t = tot[g[side]]
            t[0 if f > a else 1] += 1
    out = []
    seen = set()
    for r in std:
        if r["team"] in seen: continue
        seen.add(r["team"])
        t = tot.get(r["team"], [0, 0])
        pub = (r.get("w"), r.get("l"))
        if tuple(t) != pub: out.append((r["team"], pub, tuple(t)))
    return out


def run(y, dry=False):
    files, tpl, teams = F.fetch_season(y)
    if not files: print(y, "no season article"); return
    if not dry and not NO_ARCHIVE: archive(y, files)
    stext = F.page("season", F.season_title(y))
    champ = champion_of(stext or "")
    teams_set = set()
    title_of = {}
    for t in teams:
        nm = " ".join(t[len(str(y)) + 1: -7].replace("\xa0", " ").split())
        teams_set.add(nm); title_of[nm] = t
    views, unp, logn = {}, [], {}
    for nm, t in title_of.items():
        v, bad = P.parse_team_page(F.page("team", t) or "", y, nm)
        views[nm] = v; logn[nm] = len(v)
        unp += [(t, b) for b in bad]
    games, unres = P.pair(views, teams_set)
    unp += [("(unresolved opponent)", u) for u in unres]
    st = []
    for t in tpl:
        for r in P.parse_standings(F.page("template", "Template:" + t) or "", y):
            r["division"] = t; st.append(r)
    for r in st: r["team"] = " ".join(r["team"].replace("\xa0", " ").split())
    diffs = check(games, st)
    reg = sum(1 for g in games if g["phase"] == "regular")
    print(f"{y}: teams={len(teams_set)} standings={len(st)} games={len(games)} (regular {reg}, playoffs {len(games) - reg}) "
          f"unparsed={len(unp)} standing-vs-games differences={len(diffs)} champion={champ}")
    for d in diffs[:6]: print("   differs:", d)
    for page, txt in unp[:6]: print("   unparsed:", page, txt[:120])
    if dry: return
    out = ["begin;",
           f"delete from {S}.season where season = {y};",
           f"delete from {S}.team_season where season = {y};",
           f"delete from {S}.game where season = {y};",
           f"delete from {S}.standing where season = {y};",
           f"delete from {S}.unparsed where season = {y};",
           f"insert into {S}.season (season, page_title, teams, fetched_on, champion) values ({y}, {q(F.season_title(y))}, {len(teams_set)}, {q(F.RUN_DATE)}, {q(champ)});"]
    for nm, t in title_of.items():
        out.append(f"insert into {S}.team_season values ({y}, {q(nm)}, {q(t)}, {logn[nm]});")
    seq = {}
    for g in games:
        k = (g["phase"], g["date"], g["home"], g["away"])
        seq[k] = seq.get(k, 0) + 1
        g["seq"] = seq[k]
        out.append("insert into %s.game values (%d,%s,%s,%s,%s,%s,%d,%d,%s,%s,%d,%s,%s,%d);" % (
            S, y, q(g["phase"]), q(g["date"]), q(g.get("round")), q(g["home"]), q(g["away"]), g["home_pts"], g["away_pts"],
            "true" if g["ot"] else "false", "true" if g["neutral"] else "false", g["views"],
            q("; ".join(x for x in (g.get("conflict"), "opponent guessed" if g.get("ambiguous") else None) if x) or None),
            q(g["src"]), g["seq"]))
    seen = set()
    for r in st:
        k = (r["team"], r["division"])
        if k in seen: continue
        seen.add(k)
        gp = r.get("gp") or ((r["w"] or 0) + (r["l"] or 0) if r.get("w") is not None else None)
        out.append("insert into %s.standing values (%d,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s);" % (
            S, y, q(r["team"]), q(r["division"]), n(gp), n(r.get("w")), n(r.get("l")), q(r.get("pct")), q(r.get("gb")),
            q(r.get("home")), q(r.get("road")), q(r["src"])))
    for page, txt in unp:
        out.append(f"insert into {S}.unparsed values ({y}, {q(page)}, {q(txt)});")
    out.append("commit;")
    psql("\n".join(out) + "\n")


if __name__ == "__main__":
    a = [x for x in sys.argv[1:] if x not in ("--dry", "--no-archive")]
    dry = "--dry" in sys.argv
    if a[:1] == ["--range"] and len(a) >= 3:
        ys = list(range(int(a[1]), int(a[2]) + 1))
    elif a:
        ys = [int(x) for x in a]
    else:
        raise SystemExit(__doc__)
    for y in ys:
        run(y, dry)

#!/usr/bin/env python3
"""One NWSL season at a time: fetch -> archive the raw wikitext -> parse -> load legacy_wikipedia_nwsl (migration 129).

  season.py [--dry] [--no-archive] YEAR [YEAR ...]       (2013 = the 2013 NWSL season)
  season.py [--dry] [--no-archive] --range 2013 2025

For each season: fetch.py saves the season article, its standings templates, the playoff page and every
club's season article under the cache (raw, never edited); every file is copied byte for byte into
legacy_files.raw_archive (name 'wikipedia-nwsl/<year>/<kind>/<file>') BEFORE anything is parsed;
the parsed rows replace that season's rows in legacy_wikipedia_nwsl.
--dry fetches and parses and prints the counts and the checks, and writes nothing.
Source: English Wikipedia (CC BY-SA 4.0), action=raw, one request per 2.5 s.
DS1 is reached with scripts/daily/ds1.sh; NWSL_PSQL (a command that reads SQL on stdin) points the
loader at a scratch database instead. NWSL_RUN_DATE and NWSL_CACHE name the day and the folder of the raw files.
The core tables are built from these rows by db/build/219_nwsl_from_wikipedia.sql, a separate, reviewed step.
Never used: Sports Reference, ESPN, the NWSL's own feeds.
"""
import collections, hashlib, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch as F, parse as P

DS1 = os.path.join(HERE, "..", "daily", "ds1.sh")
S = "legacy_wikipedia_nwsl"
NO_ARCHIVE = "--no-archive" in sys.argv


def psql(sql):
    cmd = os.environ["NWSL_PSQL"].split() if os.environ.get("NWSL_PSQL") else ["bash", DS1, "-q", "-f", "-"]
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
        name = f"wikipedia-nwsl/{year}/{f}"
        psql(f"insert into legacy_files.raw_archive (name, saved_on, sha256, data) values ({q(name)}, {q(F.RUN_DATE)}, {q(sha)}, decode('{data.hex()}', 'hex')) "
             f"on conflict (name) do nothing;")
        got = psql(f"select encode(sha256(data), 'hex') = {q(sha)} from legacy_files.raw_archive where name = {q(name)};").split()
        if "t" not in got: raise RuntimeError("archive checksum mismatch " + name)


def nick_key(name):
    """A stable key so 'Portland Thorns FC' and 'Portland Thorns' are one club."""
    t = re.sub(r"\s+", " ", (name or "").replace("\xa0", " ").strip())
    t = re.sub(r"^(FC|CF|SC)\s+", "", t, flags=re.I)
    t = re.sub(r"\s+(FC|CF|SC)$", "", t, flags=re.I)
    t = re.sub(r"^(NJ/NY|NY/NJ|NJ-NY|NY-NJ|NWSL)\s+", "", t, flags=re.I)
    t = re.sub(r"\s+NWSL$", "", t, flags=re.I)
    return t.lower()


def remap(name, canon):
    """The season's own spelling of a club. 'Kansas City NWSL' and 'Kansas City Current' are the
    standings' 'Kansas City' when exactly one known club's key is a word-prefix of the other."""
    k = nick_key(name)
    if k in canon: return canon[k]
    hits = {v for ck, v in canon.items() if k.startswith(ck + " ") or ck.startswith(k + " ")}
    return hits.pop() if len(hits) == 1 else name


def drop_miscopied(rows, title_of):
    """A club article that names the wrong opponent for a match (2021: Chicago's page gave its 22 May game to Kansas City;
    Gotham's page and the standings say Gotham) leaves one line no other article repeats. Drop a line only when its
    opponent's own article (loaded) lacks it AND a third club's article lists a match of the same club on that date
    that the first club's article lacks. The dropped line is reported in unparsed; nothing else is guessed."""
    art = {}   # club (whose article it is) -> {(date, frozenset pair)}
    for g in rows:
        for nm, t in title_of.items():
            if g["src"].startswith(t + " ") or g["src"].startswith(t):
                art.setdefault(nm, set()).add((g["date"], frozenset((g["home"], g["away"]))))
                break
    keep, drop = [], []
    for g in rows:
        owner = next((nm for nm, t in title_of.items() if g["src"].startswith(t)), None)
        if owner is None or owner not in (g["home"], g["away"]):
            keep.append(g); continue
        other = g["away"] if owner == g["home"] else g["home"]
        pair = frozenset((owner, other))
        if other not in art or (g["date"], pair) in art[other]:
            keep.append(g); continue
        third = [c for c, ks in art.items() if c not in (owner, other)
                 and any(d == g["date"] and owner in pr and (d, pr) not in art.get(owner, set()) for d, pr in ks)]
        (drop if third else keep).append(g)
    return keep, drop


def arbitrate_by_standings(games, st):
    """Two club articles disagree on a score and the published standings (a third, independent table) agree with only one:
    take the side the standings support, keep both readings in conflict. Only a game with that disagreement is touched,
    and only when the swap lowers the number of standings differences."""
    for g in games:
        m = re.match(r".*?Wikipedia logs disagree: (\d+)\u2013(\d+) vs (\d+)\u2013(\d+)", g.get("conflict") or "")
        if not m or g["phase"] != "regular": continue
        dh, da, kh, ka = map(int, m.groups())
        if (dh, da) == (kh, ka) or (g["home_pts"], g["away_pts"]) != (kh, ka): continue
        before = len(P.check(games, st))
        g["home_pts"], g["away_pts"] = dh, da
        if len(P.check(games, st)) < before:
            g["conflict"] += "; standings table supports " + f"{dh}\u2013{da}"
        else:
            g["home_pts"], g["away_pts"] = kh, ka
    return games


def run(y, dry=False):
    files, tpl, teams = F.fetch_season(y)
    if not files: print(y, "no season article"); return
    if not dry and not NO_ARCHIVE: archive(y, files)
    stext = F.page("season", F.season_title(y)) or F.page("season", F.season_title_short(y)) or ""
    champ = P.champion_of(stext)
    ttexts = []
    for t in tpl:
        x = F.page("template", "Template:" + t)
        if x: ttexts.append((t, x))
    ptexts = []
    for t in F.playoff_titles(y):
        x = F.page("playoffs", t)
        if x: ptexts.append((t, x))

    st = []
    for t, tx in ttexts:
        st += P.parse_standings_module(tx, t)
    if not st:
        st = P.parse_standings_module(stext, "season article")
    canon = {}
    for r in st:
        canon.setdefault(nick_key(r["team"]), r["team"])
        r["team"] = " ".join(r["team"].replace("\xa0", " ").split())

    title_of = {}
    for t in teams:
        rest = re.sub(r"^\d{4} ", "", t)
        nm = rest[:-7] if rest.endswith(" season") else rest
        nm = " ".join(nm.replace("\xa0", " ").split())
        nm = remap(nm, canon) if canon else nm
        title_of[nm] = t
        canon.setdefault(nick_key(nm), nm)

    raw_games, unp = [], []
    for nm, t in title_of.items():
        gs, bad = P.games_from_boxes(P.B.boxes(F.page("team", t) or "", y), t)
        raw_games += gs
        unp += bad
    gs, bad = P.games_from_boxes(P.B.boxes(stext, y), F.season_title(y))
    raw_games += gs
    unp += bad
    for pt, ptext in ptexts:
        gs, bad = P.games_from_boxes(P.B.boxes(ptext, y), pt)
        raw_games += gs
        unp += bad

    for g in raw_games:
        g["home"] = remap(g["home"], canon)
        g["away"] = remap(g["away"], canon)
    # a club that is not in the season's standings or club-season articles is a friendly (a college side, a foreign club)
    known = set(canon.values())
    outside = [g for g in raw_games if g["home"] not in known or g["away"] not in known]
    raw_games = [g for g in raw_games if g["home"] in known and g["away"] in known]
    unp += [(g["src"][:40], f"club outside the league: {g['home']} / {g['away']} {g['date']}") for g in outside]
    raw_games, miscopied = drop_miscopied(raw_games, title_of)
    unp += [(g["src"][:40], f"opponent contradicted by the other club's article: {g['home']} / {g['away']} {g['date']}") for g in miscopied]
    games = P.merge_games(raw_games)

    games = arbitrate_by_standings(games, st)
    diffs = P.check(games, st)
    reg = sum(1 for g in games if g["phase"] == "regular")
    print(f"{y}: teams={len(title_of) or len(canon)} standings={len(st)} games={len(games)} (regular {reg}, playoffs {len(games) - reg}) "
          f"unparsed={len(unp)} standing-vs-games differences={len(diffs)} champion={champ}")
    for d in diffs[:8]: print("   differs:", d)
    for page, txt in unp[:6]: print("   unparsed:", page, str(txt)[:120])
    if dry: return
    teams_n = len(title_of) or len({nick_key(r["team"]) for r in st})
    page_title = F.season_title(y) if F.page("season", F.season_title(y)) else F.season_title_short(y)
    out = ["begin;",
           f"delete from {S}.season where season = {y};",
           f"delete from {S}.team_season where season = {y};",
           f"delete from {S}.game where season = {y};",
           f"delete from {S}.standing where season = {y};",
           f"delete from {S}.unparsed where season = {y};",
           f"insert into {S}.season (season, page_title, teams, fetched_on, champion) values ({y}, {q(page_title)}, {teams_n}, {q(F.RUN_DATE)}, {q(champ)});"]
    logn = collections.Counter()
    for g in games:
        logn[g["home"]] += 1; logn[g["away"]] += 1
    if title_of:
        for nm, t in title_of.items():
            out.append(f"insert into {S}.team_season values ({y}, {q(nm)}, {q(t)}, {logn.get(nm, 0)});")
    else:
        for r in st:
            out.append(f"insert into {S}.team_season values ({y}, {q(r['team'])}, {q(page_title)}, {logn.get(r['team'], 0)});")
    seq = {}
    for g in games:
        k = (g["phase"], g["date"], g["home"], g["away"])
        seq[k] = seq.get(k, 0) + 1
        out.append("insert into %s.game values (%d,%s,%s,%s,%s,%s,%d,%d,%s,%s,%s,%d,%s,%s,%d);" % (
            S, y, q(g["phase"]), q(g["date"]), q(g.get("round")), q(g["home"]), q(g["away"]),
            g["home_pts"], g["away_pts"],
            "true" if g["ot"] else "false", "true" if g.get("so") else "false",
            "true" if g["neutral"] else "false", g["views"],
            q(g.get("conflict")), q(g["src"]), seq[k]))
    seen = set()
    for r in st:
        k = (r["team"], r["division"])
        if k in seen: continue
        seen.add(k)
        out.append("insert into %s.standing values (%d,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s);" % (
            S, y, q(r["team"]), q(r["division"]), n(r.get("gp")), n(r.get("w")), n(r.get("d")), n(r.get("l")),
            n(r.get("pts")), n(r.get("gf")), n(r.get("ga")), q(r["src"])))
    for page, txt in unp:
        out.append(f"insert into {S}.unparsed values ({y}, {q(page)}, {q(str(txt))});")
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

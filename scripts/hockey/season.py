#!/usr/bin/env python3
"""One hockey season at a time: fetch -> archive the raw wikitext -> parse -> load legacy_wikipedia_hockey (migration 113).

  season.py LEAGUE [--dry] [--no-archive] [YEAR ...]       LEAGUE: nha | pcha | wchl | wha; YEAR = the year a season starts (1909 = 1909-10); none = every season
  season.py --extras [--dry]                                 archive the league articles and the club articles the franchise seed rests on

Leagues and the years they played are in fetch.py. For each season: fetch.py saves the season article, its standings templates and, once per league,
the league article (raw, never edited); every file is copied byte for byte into DS1's legacy_files.raw_archive (name
'wikipedia-hockey/<league>/<year>/<kind>/<file>', one folder per season in the Dropbox copy made by scripts/mac/spx-raw-export.sh) BEFORE anything is
parsed; the parsed rows replace that season's rows. --dry fetches and parses, prints the counts and the checks, and writes nothing.
The core tables are built from these rows by db/build/154_hockey_rivals_from_wikipedia.sql, a separate, reviewed step.
Source: English Wikipedia (CC BY-SA 4.0), action=raw, one request per 2.5 s. DS1 is reached with scripts/daily/ds1.sh; HOCKEY_PSQL (a command that
reads SQL on stdin) points the loader at a scratch database instead. HOCKEY_RUN_DATE and HOCKEY_CACHE name the day and the folder of the raw files.
"""
import hashlib, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch as F, parse as P   # noqa: E402  (this folder's own modules; scripts/nfl's are loaded under other names)

DS1 = os.path.join(HERE, "..", "daily", "ds1.sh")
S = "legacy_wikipedia_hockey"
NO_ARCHIVE = "--no-archive" in sys.argv
SERIES_SEED = os.path.join(HERE, "..", "..", "db", "seed", "hockey_series.csv")


def psql(sql):
    cmd = os.environ["HOCKEY_PSQL"].split() if os.environ.get("HOCKEY_PSQL") else ["bash", DS1, "-q", "-f", "-"]
    p = subprocess.run(cmd, input=sql, text=True, capture_output=True)
    if p.returncode: raise RuntimeError(p.stderr[-1500:])
    return p.stdout


def q(s):
    return "null" if s is None else "'" + str(s).replace("'", "''") + "'"


def n(v):
    return "null" if v is None else str(v)


def archive(name_prefix, files):
    """Copy each raw file, byte for byte, into legacy_files.raw_archive and check the stored hash."""
    for f in files:
        data = open(os.path.join(F.CACHE, f), "rb").read()
        sha = hashlib.sha256(data).hexdigest()
        name = f"{name_prefix}/{f}"
        psql(f"insert into legacy_files.raw_archive (name, saved_on, sha256, data) values ({q(name)}, {q(F.RUN_DATE)}, {q(sha)}, decode('{data.hex()}', 'hex')) "
             f"on conflict (name) do nothing;")
        got = psql(f"select encode(sha256(data), 'hex') = {q(sha)} from legacy_files.raw_archive where name = {q(name)};").split()
        if "t" not in got: raise RuntimeError("archive checksum mismatch " + name)


def seed_series(league, year):
    """Playoff series a season article tells in prose only (db/seed/hockey_series.csv: league, season, round, winner, loser, wins, goals, format, source)."""
    import csv
    if not os.path.exists(SERIES_SEED): return []
    out = []
    for r in csv.DictReader(open(SERIES_SEED, encoding="utf-8")):
        if r["league"] == league and int(r["season"]) == year: out.append(r)
    return out


def run(league, y, dry=False, league_text=""):
    files, text, tpl = F.fetch_season(league, y)
    if text is None:
        print(league, y, "no season article"); return
    if not dry and not NO_ARCHIVE: archive(f"wikipedia-hockey/{league}/{y}", files)
    templates = [(t, F.F.page("template", "Template:" + t)) for t in tpl]
    r = P.parse_season(text, templates, y, league, league_text)
    games, std, outside = r["games"], r["standings"], r["outside"]
    diffs = {d[0]: d for d in P.check_standings(std, games, outside)}
    reg = sum(1 for g in games if g["phase"] == "regular")
    nocount = sum(1 for g in games if g.get("counts") is False)
    series = [(rnd, w, l, ww, lw, None, None, "best-of series (bracket)") for rnd, w, l, ww, lw in r["series"]]
    seeded = seed_series(league, y)
    print(f"{league} {y}: teams={len(r['teams'])} standings={len(std)} games={len(games)} (regular {reg}, playoffs {len(games) - reg}, not counted {nocount}) "
          f"interleague/outside={len(outside)} series={len(series) + len(seeded)} unparsed={len(r['unparsed'])} standing-vs-games differences={len(diffs)} champion={r['champion']}")
    for d in list(diffs.values())[:6]: print("   differs:", d)
    for b in r["unparsed"][:6]: print("   unparsed:", b)
    if dry: return
    out = ["begin;"] + [f"delete from {S}.{t} where league = {q(league)} and season = {y};" for t in ("season", "team_season", "game", "standing", "series", "unparsed")]
    out.append(f"insert into {S}.season (league, season, page_title, teams, fetched_on, champion, champion_basis) values "
               f"({q(league)}, {y}, {q(F.season_title(league, y))}, {len(r['teams'])}, {q(F.RUN_DATE)}, {q(r['champion'])}, {q(r['champion_basis'])});")
    for nm in r["teams"]:
        link = next((x["link"] for x in std if x["team"] == nm), None)
        out.append(f"insert into {S}.team_season values ({q(league)}, {y}, {q(nm)}, {q(link)});")
    seq = {}
    for g in games:
        k = (g["phase"], g["date"], g["home"], g["away"])
        seq[k] = seq.get(k, 0) + 1
        out.append("insert into %s.game values (%s,%d,%s,%s,%s,%s,%s,%d,%d,%s,%s,%s,%s,%s,%d);" % (
            S, q(league), y, q(g["phase"]), q(g["date"]), q(g.get("round")), q(g["home"]), q(g["away"]), g["home_pts"], g["away_pts"],
            "true" if g["overtime"] else "false", "true" if g["neutral"] else "false", "false" if g.get("counts") is False else "true",
            q(g.get("note") or None), q(g["raw"][:300]), seq[k]))
    has_games = {nm for g in games if g["phase"] == "regular" for nm in (g["home"], g["away"])}
    for rank, st in enumerate(std, 1):
        d = diffs.get(st["team"])
        agrees = "null" if st["team"] not in has_games and not d else ("false" if d else "true")
        note = None
        if d: note = f"games add up to {d[2][1]}-{d[2][2]}-{d[2][3]}, {d[2][4]}-{d[2][5]} in {d[2][0]} games"
        out.append("insert into %s.standing values (%s,%d,%s,%s,%d,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s);" % (
            S, q(league), y, q(st["team"]), q(st["division"]), rank, n(st.get("gp")), n(st.get("w")), n(st.get("l")), n(st.get("t")), n(st.get("pts")),
            n(st.get("gf")), n(st.get("ga")), agrees, q(note), q(st.get("link") or "standings")))
    for rnd, w, l, ww, lw, wg, lg_, fmt in series:
        out.append(f"insert into {S}.series values ({q(league)}, {y}, {q(rnd)}, {q(w)}, {q(l)}, {n(ww)}, {n(lw)}, {n(wg)}, {n(lg_)}, {q(fmt)}, {q(F.season_title(league, y))}) on conflict do nothing;")
    for s in seeded:
        names = r["teams"]
        w, l = P.match_name(s["winner"], names), P.match_name(s["loser"], names)
        if not w or not l:
            print("   seeded series not matched:", s); continue
        out.append(f"insert into {S}.series values ({q(league)}, {y}, {q(s['round'])}, {q(w)}, {q(l)}, {n(int(s['winner_wins']))}, {n(int(s['loser_wins']))}, "
                   f"{n(int(s['winner_goals']))}, {n(int(s['loser_goals']))}, {q(s['format'])}, {q(s['source'])}) on conflict do nothing;")
    for page, txt in r["unparsed"]:
        out.append(f"insert into {S}.unparsed values ({q(league)}, {y}, {q(page)}, {q(txt)});")
    for sk in r["skipped"]:
        out.append(f"insert into {S}.unparsed values ({q(league)}, {y}, '(skipped: not a game of this league)', {q(sk)});")
    out.append("commit;")
    psql("\n".join(out) + "\n")


def extras(dry):
    for sub in ("league", "club"):
        d = os.path.join(F.CACHE, sub)
        if not os.path.isdir(d): continue
        files = [f"{sub}/{f}" for f in sorted(os.listdir(d)) if not open(os.path.join(d, f), encoding="utf-8").read(40).startswith("#MISSING")]
        print(sub, len(files), "files")
        if not dry and not NO_ARCHIVE: archive("wikipedia-hockey", files)


if __name__ == "__main__":
    a = [x for x in sys.argv[1:] if x not in ("--dry", "--no-archive")]
    dry = "--dry" in sys.argv
    if a and a[0] == "--extras": extras(dry); raise SystemExit
    if not a or a[0] not in F.LEAGUES: raise SystemExit(__doc__)
    lg = a[0]
    league_text = F.F.page("league", F.LEAGUES[lg][2]) or ""
    for y in ([int(x) for x in a[1:]] or F.years(lg)): run(lg, y, dry, league_text)

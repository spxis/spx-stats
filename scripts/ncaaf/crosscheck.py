#!/usr/bin/env python3
"""Measure the Wikipedia load against a local CollegeFootballData extract (a CSV kept outside the repository; never committed).
Only counts and agreement are reported: no CFBD value is copied into any table or file. Usage:
  crosscheck.py <cfbd csv> [--detail] YEAR [YEAR ...]
Matching: the CSV's team names are matched to the load's school names (alias list below for the few spellings that differ), games by date
(within one day: the CSV carries UTC times) and the two teams."""
import collections, csv, datetime, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import parse as P, season as S

ALIAS = {  # the CSV's spelling -> the school text on Wikipedia (flattened)
    "ulmonroe": "louisianamonroe", "louisiana": "louisianalafayette", "southernmississippi": "southernmiss", "miami": "miamifl",
    "uconn": "connecticut", "umass": "massachusetts", "appstate": "appalachianstate", "southerncalifornia": "usc",
    "usf": "southflorida", "centralflorida": "ucf", "texaselpaso": "utep", "floridainternational": "fiu", "hawaii": "hawaii",
    "northcarolinastate": "ncstate", "sanjosestate": "sanjosestate", "westernkentucky": "wku", "texasarlington": "uta", "utsa": "utsa",
    "massachusetts": "umass", "samhoustonstate": "samhouston", "samhouston": "samhoustonstate",
}


def load(path, y):
    out = []
    for r in csv.DictReader(open(path)):
        if int(r["season"]) != y: continue
        out.append(r)
    return out


def run(path, y, detail):
    b = S.build(y)
    teams = {}
    for r in b["standings"]:
        if r.get("team_name"): teams[P.flat(r["team_text"])] = r["team_name"]; teams[P.flat(r["team_name"])] = r["team_name"]
    outside = {P.flat(n): n for n in b["outside"]}
    def tm(c):
        f0 = P.flat(c)
        for f in (f0, ALIAS.get(f0)):
            if f is None: continue
            if f in teams: return teams[f], True
            if f in outside: return outside[f], False
        for f in (f0, ALIAS.get(f0)):
            if f is None: continue
            hits = {v: k in teams for k, v in list(teams.items()) + list(outside.items()) if k.startswith(f)}
            if len(hits) == 1: return next(iter(hits.items()))
        return None, False
    rows = load(path, y)
    mine = collections.defaultdict(list)
    for g in b["games"]: mine[frozenset((g["home"], g["away"]))].append(g)
    unmatched_names = collections.Counter()
    st = collections.Counter()
    notes = []
    for r in rows:
        h, hin = tm(r["home_team"]); a, ain = tm(r["away_team"])
        d = datetime.date.fromisoformat(r["start_date"][:10])
        if h is None or a is None:
            # one team's spelling is not known (a team outside the division): match on the other team, the day and the two scores
            known, kpts, opts = (a, int(r["away_points"]), int(r["home_points"])) if h is None else (h, int(r["home_points"]), int(r["away_points"]))
            hit = None
            if known is not None:
                for g in b["games"]:
                    if g.get("_hit") or abs((g["date"] - d).days) > 1: continue
                    if g["home"] == known and (g["home_pts"], g["away_pts"]) == (kpts, opts) or g["away"] == known and (g["away_pts"], g["home_pts"]) == (kpts, opts): hit = g; break
            if hit is not None:
                hit["_hit"] = True; st["matched"] += 1; st["score_agree"] += 1; st["phase_agree"] += 1 if (r["season_type"] == "postseason") == (hit["phase"] == "playoffs") else 0
                st["by_score"] += 1; continue
            unmatched_names[r["home_team"] if h is None else r["away_team"]] += 1; st["name"] += 1; continue
        cand = [g for g in mine.get(frozenset((h, a)), []) if abs((g["date"] - d).days) <= 1]
        if not cand: st["missing"] += 1; notes.append(("missing", r["start_date"][:10], r["home_team"], r["away_team"], r["home_points"], r["away_points"])); continue
        g = min(cand, key=lambda g: abs((g["date"] - d).days))
        st["matched"] += 1
        hp, ap = int(r["home_points"]), int(r["away_points"])
        mh, ma = (g["home_pts"], g["away_pts"]) if g["home"] == h else (g["away_pts"], g["home_pts"])
        if (hp, ap) == (mh, ma): st["score_agree"] += 1
        else: st["score_differ"] += 1; notes.append(("score", str(g["date"]), h, a, f"{hp}-{ap}", f"wiki {mh}-{ma}"))
        cp = "playoffs" if r["season_type"] == "postseason" else "regular"
        if cp == g["phase"]: st["phase_agree"] += 1
        else: st["phase_differ"] += 1; notes.append(("phase", str(g["date"]), h, a, cp, f"wiki {g['phase']}"))
        if r["neutral_site"] in ("t", "true", "True"):
            st["neutral_cfbd"] += 1
            if g["neutral"]: st["neutral_both"] += 1
        elif g["neutral"]: st["neutral_wiki_only"] += 1
        g["_hit"] = True
    extra = [g for g in b["games"] if not g.get("_hit")]
    print(f"{y}: cfbd={len(rows)} wiki={len(b['games'])} matched={st['matched']} (by-score {st['by_score']}) missing-in-wiki={st['missing']} not-in-cfbd={len(extra)} "
          f"score-agree={st['score_agree']}/{st['matched']} phase-agree={st['phase_agree']}/{st['matched']} neutral cfbd={st['neutral_cfbd']} both={st['neutral_both']} wiki-only={st['neutral_wiki_only']} name-unmatched={st['name']}")
    if unmatched_names: print("   names:", dict(unmatched_names))
    if detail:
        for n in notes[:60]: print("  ", *n)
        for g in extra[:40]: print("   extra", g["date"], g["away"], "at", g["home"], g["away_pts"], g["home_pts"], "vs-outside" if not g["inside"] else "", g["phase"])
    return st, len(rows), len(b["games"]), len(extra)


if __name__ == "__main__":
    a = sys.argv[1:]
    detail = "--detail" in a
    a = [x for x in a if x != "--detail"]
    path = os.path.expanduser(a[0])
    tot = collections.Counter(); nc = nw = nx = 0
    for y in [int(x) for x in a[1:]]:
        st, c, w, x = run(path, y, detail); tot.update(st); nc += c; nw += w; nx += x
    if len(a) > 2:
        print(f"TOTAL cfbd={nc} wiki={nw} matched={tot['matched']} missing-in-wiki={tot['missing']} not-in-cfbd={nx} score-agree={tot['score_agree']} phase-agree={tot['phase_agree']} name-unmatched={tot['name']}")

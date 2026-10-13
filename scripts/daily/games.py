#!/usr/bin/env python3
"""Claims -> games, with the cross-check.

Every source's statement about a game is a claim (see parsers.py). Claims about the same two clubs on dates one day
apart are one game. A source counts once per game (the two clubs' articles are two sources; nflverse is a third).

  confirmed  two or more sources give the same score
  single     one source only (the other club's article does not list it yet, or no second source exists)
  disputed   sources give different scores: the best-ranked source is kept and every other value is listed
  scheduled  no source has a result yet (also postponed / cancelled / suspended)
"""
import datetime

SOURCE_RANK = {"nflverse": 0, "balldontlie": 0}


def _scores(c):
    return None if c["score"] is None else frozenset(c["score"].items())


def pair_claims(claims):
    """-> list of clusters (lists of claims). One source never appears twice in a cluster."""
    groups = {}
    for c in claims: groups.setdefault(frozenset(c["teams"]), []).append(c)
    clusters = []
    for pair, cs in groups.items():
        cs.sort(key=lambda c: (c["date"], c["dh"] or 0, c["source"]))
        cur = []
        for c in cs:
            best = None
            for cl in cur:
                if any(x["source"] == c["source"] for x in cl): continue
                dd = min(abs((x["date"] - c["date"]).days) for x in cl)
                if dd > 1: continue
                dhm = any(x["dh"] and c["dh"] and x["dh"] != c["dh"] for x in cl)
                sm = any(_scores(x) and _scores(c) and _scores(x) != _scores(c) for x in cl)
                key = (dhm, sm, dd)
                if best is None or key < best[0]: best = (key, cl)
            if best is None: cur.append([c])
            else: best[1].append(c)
        clusters += cur
    return clusters


def _rank(c, home):
    if c.get("inconsistent"): return 9          # the row contradicts itself (colour vs score): last resort
    if c["source"] in SOURCE_RANK: return SOURCE_RANK[c["source"]]
    if c.get("league_page"): return 1
    if home and home in c["page"]: return 2
    return 3


def summarize(cl, league, season):
    """One cluster -> one game dict."""
    notes = []
    homes = {c["home"] for c in cl if c["home"]}
    if len(homes) == 1: home = next(iter(homes))
    elif len(homes) > 1:
        home = next((c["home"] for c in cl if c["home"] and (c.get("league_page") or c["source"] in SOURCE_RANK)), None)
        notes.append("home side disputed: " + " / ".join(sorted(homes)) + (" (kept " + home + ")" if home else " (treated as neutral site)"))
    else:
        home = None
    teams = list(cl[0]["teams"])
    away = None if home is None else next(t for t in teams if t != home)
    neutral = home is None and (any(c["neutral"] for c in cl) or len(homes) > 1)
    finals = [c for c in cl if c["status"] == "final"]
    status = "final" if finals else next((s for s in ("postponed", "cancelled", "suspended") if any(c["status"] == s for c in cl)), "scheduled")
    if finals and any(c["status"] in ("scheduled", "postponed") for c in cl):
        stale = [c["source"] for c in cl if c["status"] in ("scheduled", "postponed")]
        notes.append("not yet updated in: " + ", ".join(stale))
    score, alts, conf = None, [], "scheduled"
    if finals:
        distinct = {}
        for c in finals: distinct.setdefault(_scores(c), []).append(c)
        ranked = sorted(finals, key=lambda c: _rank(c, home))
        best = ranked[0]
        score = best["score"]
        if len(distinct) == 1:
            conf = "confirmed" if len({c["source"] for c in finals}) >= 2 else "single"
        else:
            conf = "disputed"
            for k, v in distinct.items():
                if k != _scores(best):
                    alts.append("%s says %s" % (" + ".join(sorted({x["source"] for x in v})), ", ".join("%s %d" % (t, s) for t, s in sorted(dict(k).items()))))
    pick = sorted(finals or cl, key=lambda c: _rank(c, home))[0]
    notes += ["%s: %s" % (c["source"], c["inconsistent"]) for c in cl if c.get("inconsistent")]
    dates = {c["date"] for c in cl}
    if len(dates) > 1: notes.append("date differs by source: " + ", ".join(sorted(d.isoformat() for d in dates)))
    ots = {bool(c["ot"]) for c in finals if c["ot"] is not None}
    if len(ots) > 1: notes.append("overtime flag differs by source")
    phases = {c["phase"] for c in cl}
    return dict(league=league, season=season, phase=pick["phase"], round=next((c["round"] for c in cl if c["round"]), None),
                date=pick["date"], home=home, away=away, teams=teams, neutral=neutral,
                status=status, score=score, ot=any(c["ot"] for c in finals) if finals else None,
                so=any(c["so"] for c in finals), ot_n=next((c["ot_n"] for c in finals if c["ot_n"]), None),
                confidence=conf, alternatives=alts, notes=notes + (["phase differs: " + "/".join(sorted(phases))] if len(phases) > 1 else []),
                sources=sorted({c["source"] for c in cl}), pages=sorted({c["page"] for c in cl}), dh=pick["dh"], claims=cl)


def build_games(claims, league, season):
    """claims of one league-season -> games sorted by date, each with a source_key."""
    claims = [c for c in claims if c["phase"] != "preseason"]
    games = [summarize(cl, league, season) for cl in pair_claims(claims)]
    games.sort(key=lambda g: (g["date"], g["dh"] or 0, g["home"] or "", g["away"] or "", "|".join(g["teams"])))
    seen = {}
    for g in games:
        h, a = (g["home"], g["away"]) if g["home"] else tuple(sorted(g["teams"]))
        k = (g["phase"], g["date"], h, a)
        n = seen.get(k, 0); seen[k] = n + 1
        g["source_key"] = "wpdaily:%s:%s:%s:%s:%s:%s:%d" % (league, season, g["phase"], g["date"].isoformat(), h, a, n)
    return games

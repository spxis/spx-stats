#!/usr/bin/env python3
"""Claims -> games, with the cross-check.

Every source's statement about a game is a claim (see parsers.py). Claims about the same two clubs on dates one day
apart are one game. A source counts once per game (the two clubs' articles are two sources; nflverse is a third).

  confirmed  two or more sources give the same score
  single     one source only (the other club's article does not list it yet, or no second source exists)
  resolved   sources differ but nflverse / balldontlie agrees with at least one club's page: that score holds (stage 2 applies it)
  disputed   sources give different scores: the best-ranked source is kept and every other value is listed (stage 2 applies nothing)
  scheduled  no source has a result yet (also postponed / cancelled / suspended)
"""
import datetime

SOURCE_RANK = {"nflverse": 0, "balldontlie": 0}


def _scores(c):
    return None if c["score"] is None else frozenset(c["score"].items())


def _clash(x, y):
    """(doubleheader numbers differ, scores differ) for two claims."""
    return (bool(x["dh"] and y["dh"] and x["dh"] != y["dh"]), bool(_scores(x) and _scores(y) and _scores(x) != _scores(y)))


def pair_claims(claims):
    """-> list of clusters (lists of claims). One source never appears twice in a cluster.

    Three passes per pair of clubs, so the order in which sources happen to be read cannot decide who is paired with whom:
      1. the same day, and only claims that do not clash (different doubleheader number or score) with the cluster they join;
      2. clusters of the same day that share no source join each other even when their scores differ (that is a disputed game);
      3. clusters a day apart that share no source and do not differ in doubleheader number (two sources dating one game a day apart;
         a score that differs still joins, as a disputed game; the pair closest in score and date goes first).
    A rain-out on the 26th and its make-up on the 27th stay two games, because a source's row for the 27th meets the other sources'
    rows for the 27th before it can meet the 26th's."""
    groups = {}
    for c in claims: groups.setdefault(frozenset(c["teams"]), []).append(c)
    clusters = []
    for pair, cs in groups.items():
        cs.sort(key=lambda c: (c["date"], c["dh"] or 9, c["source"]))      # numbered doubleheader rows first: a row with no number then picks the game left over
        cur = []
        for c in cs:
            best = None
            for cl in cur:
                if any(x["source"] == c["source"] for x in cl) or any(x["date"] != c["date"] for x in cl): continue
                if any(any(_clash(x, c)) for x in cl): continue
                best = cl; break
            if best is None: cur.append([c])
            else: best.append(c)
        for within in (0, 1):
            merged = []
            for cl in cur:
                hit = None                     # ((score differs, days apart), the cluster to join)
                for other in merged:
                    if {x["source"] for x in cl} & {x["source"] for x in other}: continue
                    dd = min(abs((x["date"] - y["date"]).days) for x in cl for y in other)
                    if dd > within: continue
                    if any(_clash(x, y)[0] for x in cl for y in other): continue
                    sm = any(_clash(x, y)[1] for x in cl for y in other)
                    if hit is None or (sm, dd) < hit[0]: hit = ((sm, dd), other)
                if hit is None: merged.append(cl)
                else: hit[1].extend(cl)
            cur = merged
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
            # a third source settles it: nflverse / balldontlie agrees with at least one club's page, so the score holds
            conf = "resolved" if best["source"] in SOURCE_RANK and any(c is not best and c["source"] not in SOURCE_RANK and _scores(c) == _scores(best) for c in finals) else "disputed"
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
    timed = [c for c in cl if c.get("start")]
    start = None
    if timed:
        start = sorted(timed, key=lambda c: (_rank(c, home), c["source"]))[0]["start"]
        if len({c["start"] for c in timed}) > 1: notes.append("start time differs by source")
    return dict(league=league, season=season, phase=pick["phase"], round=next((c["round"] for c in cl if c["round"]), None),
                date=pick["date"], home=home, away=away, teams=teams, neutral=neutral, start=start,
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

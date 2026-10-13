#!/usr/bin/env python3
"""Compare the games found on Wikipedia with DS1's core.game. READ-ONLY: one SELECT per kind, nothing is written.

A Wikipedia game and a DS1 game are the same game when they are between the same two franchises on dates at most
3 days apart (the nearest free one wins; finals are matched before scheduled games, postponements last).
"""
import collections, datetime, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import teams as T

WINDOW = 3


def load_ds1(seasons):
    """{league: {'season': row|None, 'team_seasons': {fid}, 'games': [dict]}} for the given {league: start_year}."""
    pairs = ",".join("('%s',%d)" % (lg, y) for lg, y in seasons.items())
    srows = T.ds1_csv("select league_code, start_year from core.season where (league_code, start_year) in (%s)" % pairs)
    tsrows = T.ds1_csv("select s.league_code, ts.franchise_id from core.team_season ts join core.season s using (season_id) where (s.league_code, s.start_year) in (%s)" % pairs)
    grows = T.ds1_csv(
        "select s.league_code, g.game_id, g.phase, g.game_date, g.status, hts.franchise_id hf, ats.franchise_id af, g.home_score hs, g.away_score aws, "
        "g.went_to_overtime ot, g.decided_by_shootout so, g.source_key, src.code src "
        "from core.game g join core.season s using (season_id) join core.team_season hts on hts.team_season_id = g.home_team_season_id "
        "join core.team_season ats on ats.team_season_id = g.away_team_season_id join meta.source src on src.source_id = g.source_id "
        "where (s.league_code, s.start_year) in (%s)" % pairs)
    out = {lg: dict(season=None, team_seasons=set(), games=[]) for lg in seasons}
    for r in srows: out[r["league_code"]]["season"] = int(r["start_year"])
    for r in tsrows: out[r["league_code"]]["team_seasons"].add(int(r["franchise_id"]))
    for r in grows:
        out[r["league_code"]]["games"].append(dict(
            id=int(r["game_id"]), phase=r["phase"], date=datetime.date.fromisoformat(r["game_date"]), status=r["status"], hf=int(r["hf"]), af=int(r["af"]),
            hs=int(r["hs"]) if r["hs"] != "" else None, as_=int(r["aws"]) if r["aws"] != "" else None,
            ot=r["ot"] == "t", so=r["so"] == "t", key=r["source_key"], src=r["src"], used=False))
    return out


def match(games, ds1, roster):
    """-> (pairs [(wiki game, ds1 game|None)], ds1 games left over)."""
    fid = lambda n: roster.resolve(n)["fid"]
    by_pair = collections.defaultdict(list)
    for d in ds1: by_pair[frozenset((d["hf"], d["af"]))].append(d)
    order = {"final": 0, "scheduled": 1, "suspended": 1, "postponed": 2, "cancelled": 2}
    pairs = []
    # A game DS1 holds under this very game's key (the games stage 2 wrote: the key ends in the game's number within its day)
    # is that game. Without this, the two games of a doubleheader pair by luck and their scores come out swapped.
    exact = {}
    bykey = {d["key"]: d for d in ds1}
    for g in games:
        d = bykey.get(g["source_key"])
        if d is not None and not d["used"]:
            d["used"] = True; exact[g["source_key"]] = d
    for g in sorted(games, key=lambda g: (order.get(g["status"], 1), g["date"])):
        if g["source_key"] in exact:
            pairs.append((g, exact[g["source_key"]])); continue
        k = frozenset(fid(t) for t in g["teams"])
        best = None
        for d in by_pair.get(k, []):
            if d["used"]: continue
            dd = abs((d["date"] - g["date"]).days)
            if dd > WINDOW: continue
            same_home = g["home"] is None or fid(g["home"]) == d["hf"]
            key = (dd, not same_home)
            if best is None or key < best[0]: best = (key, d)
        if best: best[1]["used"] = True
        pairs.append((g, best[1] if best else None))
    return pairs, [d for d in ds1 if not d["used"]]


def classify(g, d, roster):
    """-> (kind, detail) for a matched pair."""
    if d is None and g["status"] == "final" and g["confidence"] == "disputed": return ("new_disputed", "")   # held back on purpose
    if d is None: return ("new_final" if g["status"] == "final" else "new_scheduled" if g["status"] == "scheduled" else "new_" + g["status"], "")
    notes = []
    if g["date"] != d["date"]: notes.append("date %s vs DS1 %s" % (g["date"], d["date"]))
    if g["home"] and roster.resolve(g["home"])["fid"] != d["hf"]: notes.append("home/away swapped vs DS1")
    if g["status"] == "final":
        if d["status"] != "final": return ("scheduled_to_final", "; ".join(notes))
        hf, af = d["hf"], d["af"]
        mine = {roster.resolve(t)["fid"]: s for t, s in g["score"].items()}
        if mine.get(hf) == d["hs"] and mine.get(af) == d["as_"]:
            return ("same" if not notes else "same_with_note", "; ".join(notes))
        return ("score_diff", "wiki %s vs DS1 %s-%s%s" % (", ".join("%s %d" % (t, s) for t, s in g["score"].items()), d["hs"], d["as_"], "; " + "; ".join(notes) if notes else ""))
    if g["status"] in ("postponed", "cancelled"):
        return ("now_" + g["status"], "; ".join(notes)) if d["status"] == "scheduled" else ("already_" + d["status"], "")
    if d["status"] == "final": return ("wiki_behind", "")
    return ("rescheduled" if g["date"] != d["date"] else "unchanged", "; ".join(notes))


def report(all_games, rosters, seasons, since, verbose=False, unreadable=None):
    ds1 = load_ds1(seasons)
    for lg, games in all_games.items():
        info, roster = ds1[lg], rosters[lg]
        pairs, left = match(games, info["games"], roster)
        kinds = collections.defaultdict(list)
        for g, d in pairs:
            k, detail = classify(g, d, roster)
            kinds[k].append((g, d, detail))
        disputed = [g for g in games if g["confidence"] == "disputed"]
        gone = [d for d in left if d["status"] == "final" and d["date"] >= since]
        n = lambda k: len(kinds.get(k, []))
        missing_ts = sorted(c["name"] for c in roster.clubs if c["fid"] not in info["team_seasons"])
        print("\n%s %s" % (lg.upper(), seasons[lg]))
        if info["season"] is None:
            print("  DS1 has NO %s %s season row and %d games: every game below is new, and stage 2 must create core.season first" % (lg.upper(), seasons[lg], len(info["games"])))
        print("  DS1 has %d games (%d final); Wikipedia lists %d (%d final)" % (
            len(info["games"]), sum(1 for d in info["games"] if d["status"] == "final"), len(games), sum(1 for g in games if g["status"] == "final")))
        print("  new games (final)          %5d" % n("new_final"))
        print("  new games (held: the sources disagree) %d" % n("new_disputed"))
        print("  new games (scheduled)      %5d" % n("new_scheduled"))
        print("  scheduled -> final         %5d" % n("scheduled_to_final"))
        print("  same result already in DS1 %5d (with a date/home note: %d)" % (n("same") + n("same_with_note"), n("same_with_note")))
        print("  score differences          %5d" % n("score_diff"))
        print("  disputed between sources   %5d" % len(disputed))
        print("  postponed / cancelled now  %5d / %d (DS1 still scheduled), already so in DS1: %d, unmatched postponed: %d" % (
            n("now_postponed"), n("now_cancelled"), n("already_postponed") + n("already_cancelled"), n("new_postponed") + n("new_cancelled")))
        print("  rescheduled (date moved)   %5d" % n("rescheduled"))
        print("  DS1 final games since %s that Wikipedia lacks: %d" % (since, len(gone)))
        print("  unmatched teams: %d unreadable rows (a name that does not resolve lands there, see -v); clubs with no DS1 team_season for %s: %s" % (
            (unreadable or {}).get(lg, 0), seasons[lg], (", ".join(missing_ts) if len(missing_ts) <= 6 else "%d of %d clubs (stage 2 must create them)" % (len(missing_ts), len(roster.clubs))) or "none"))
        recent = [x for x in kinds.get("scheduled_to_final", []) + kinds.get("new_final", []) if x[0]["date"] >= since]
        print("  -> final in the last 7 days (since %s): %d games to apply" % (since, len(recent)))
        for tag in ("score_diff", "wiki_behind"):
            for g, d, detail in kinds.get(tag, [])[: (30 if verbose else 5)]:
                print("     %s %s %s: %s" % (tag, g["date"], " v ".join(g["teams"]), detail))
        for g in disputed[: (30 if verbose else 5)]:
            print("     disputed %s %s: %s" % (g["date"], " v ".join(g["teams"]), "; ".join(g["alternatives"])))
        for d in gone[:5]:
            print("     DS1 only %s fid %d v %d %s" % (d["date"], d["hf"], d["af"], d["key"]))

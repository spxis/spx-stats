#!/usr/bin/env python3
"""`run.py --self-test`: the parsers and the pairing on small saved excerpts (fixtures/). No network, no database.

Fixtures are excerpts of English Wikipedia articles (CC BY-SA 4.0; revision and authors named in the first line of each).
"""
import datetime, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import games as G, parsers as P, teams as T

D = datetime.date
FAILS = []


def check(cond, what):
    if not cond: FAILS.append(what)


def roster(league, names):
    clubs = []
    for i, (full, loc, nick, abbr) in enumerate(names):
        clubs.append(dict(fid=i + 1, name=full, location=loc, nickname=nick, abbr=abbr))
    return T.Roster(league, clubs)


NHL = roster("nhl", [("Toronto Maple Leafs", "Toronto", "Maple Leafs", "TOR"), ("Montréal Canadiens", "Montréal", "Canadiens", "MTL"),
                     ("New York Islanders", "New York", "Islanders", "NYI"), ("Ottawa Senators", "Ottawa", "Senators", "OTT"),
                     ("Nashville Predators", "Nashville", "Predators", "NSH"), ("Vegas Golden Knights", "Vegas", "Golden Knights", "VGK"),
                     ("Colorado Avalanche", "Colorado", "Avalanche", "COL"), ("Utah Mammoth", "Utah", "Mammoth", "UTA"),
                     ("Buffalo Sabres", "Buffalo", "Sabres", "BUF"), ("San Jose Sharks", "San Jose", "Sharks", "SJS"),
                     ("Columbus Blue Jackets", "Columbus", "Blue Jackets", "CBJ"), ("New York Rangers", "New York", "Rangers", "NYR"),
                     ("Carolina Hurricanes", "Carolina", "Hurricanes", "CAR"), ("Florida Panthers", "Florida", "Panthers", "FLA"),
                     ("Philadelphia Flyers", "Philadelphia", "Flyers", "PHI"), ("Washington Capitals", "Washington", "Capitals", "WSH"),
                     ("Boston Bruins", "Boston", "Bruins", "BOS"), ("Tampa Bay Lightning", "Tampa Bay", "Lightning", "TBL"),
                     ("New Jersey Devils", "New Jersey", "Devils", "NJD"), ("Pittsburgh Penguins", "Pittsburgh", "Penguins", "PIT"),
                     ("Detroit Red Wings", "Detroit", "Red Wings", "DET"), ("Seattle Kraken", "Seattle", "Kraken", "SEA")])
MLB = roster("mlb", [("New York Yankees", "New York", "Yankees", "NYY"), ("San Francisco Giants", "San Francisco", "Giants", "SF"),
                     ("Seattle Mariners", "Seattle", "Mariners", "SEA"), ("Miami Marlins", "Miami", "Marlins", "MIA"),
                     ("Baltimore Orioles", "Baltimore", "Orioles", "BAL"), ("Tampa Bay Rays", "Tampa Bay", "Rays", "TB"),
                     ("Boston Red Sox", "Boston", "Red Sox", "BOS"), ("Los Angeles Dodgers", "Los Angeles", "Dodgers", "LAD"),
                     ("Arizona Diamondbacks", "Arizona", "Diamondbacks", "ARI"), ("Cleveland Guardians", "Cleveland", "Guardians", "CLE"),
                     ("Chicago White Sox", "Chicago", "White Sox", "CWS"), ("Houston Astros", "Houston", "Astros", "HOU")])
NFL = roster("nfl", [("Buffalo Bills", "Buffalo", "Bills", "BUF"), ("Houston Texans", "Houston", "Texans", "HOU"), ("Detroit Lions", "Detroit", "Lions", "DET"),
                     ("Los Angeles Chargers", "Los Angeles Chargers", "Chargers", "LAC"), ("New England Patriots", "New England", "Patriots", "NE"),
                     ("Los Angeles Rams", "Los Angeles Rams", "Rams", "LA"), ("Carolina Panthers", "Carolina", "Panthers", "CAR"),
                     ("Cleveland Browns", "Cleveland", "Browns", "CLE"), ("Pittsburgh Steelers", "Pittsburgh", "Steelers", "PIT")])
CFL = roster("cfl", [("Toronto Argonauts", "Toronto", "Argonauts", "TOR"), ("Montreal Alouettes", "Montreal", "Alouettes", "MTL"),
                     ("Ottawa Redblacks", "Ottawa", "Redblacks", "OTT")])
NBA = roster("nba", [("Boston Celtics", "Boston", "Celtics", "BOS")])


def fx(name):
    with open(os.path.join(HERE, "fixtures", name), encoding="utf-8") as f: return f.read()


def one(cs, date, pred=lambda c: True):
    hit = [c for c in cs if c["date"] == date and pred(c)]
    check(len(hit) == 1, "expected one claim on %s, found %d" % (date, len(hit)))
    return hit[0] if hit else None


def test_parsers():
    # NHL layout A (Visitor | Score | Home): the score is visitor first
    cs, bad = P.parse_nhl(fx("nhl_layout_a.wikitext"), 2026, "Toronto Maple Leafs", NHL, "2026–27 Toronto Maple Leafs season")
    check(not bad, "nhl A unreadable rows: %r" % bad)
    c = one(cs, D(2026, 9, 29))
    if c: check(c["home"] == "Toronto Maple Leafs" and c["score"] == {"Montréal Canadiens": 3, "Toronto Maple Leafs": 2} and c["status"] == "final" and not c["ot"], "nhl A 9/29 %r" % c)
    c = one(cs, D(2026, 10, 6))
    if c: check(c["ot"] and c["ot_n"] == 1 and not c["so"] and c["score"]["Toronto Maple Leafs"] == 5, "nhl A overtime win")
    c = one(cs, D(2026, 10, 8))
    if c: check(c["so"] and c["home"] == "Vegas Golden Knights" and c["score"]["Toronto Maple Leafs"] == 3, "nhl A shootout loss")
    c = one(cs, D(2026, 10, 3))
    if c: check(c.get("inconsistent"), "nhl A: row colour says lost but the score says won must be flagged")
    c = one(cs, D(2026, 10, 13))
    if c: check(c["status"] == "scheduled" and c["score"] is None and c["home"] == "Utah Mammoth", "nhl A scheduled row")
    # NHL layout B (Opponent | Score own-first): '@' = away
    cs, bad = P.parse_nhl(fx("nhl_layout_b.wikitext"), 2026, "Carolina Hurricanes", NHL, "2026–27 Carolina Hurricanes season")
    check(not bad, "nhl B unreadable rows: %r" % bad)
    c = one(cs, D(2026, 9, 29))
    if c: check(c["home"] == "Carolina Hurricanes" and c["score"] == {"Carolina Hurricanes": 0, "Florida Panthers": 1} and c["ot"], "nhl B 9/29 %r" % c)
    c = one(cs, D(2026, 10, 3))
    if c: check(c["home"] == "Philadelphia Flyers" and c["score"] == {"Carolina Hurricanes": 3, "Philadelphia Flyers": 2} and c["ot"], "nhl B 10/3 %r" % c)
    # MLB club article: '@' away, colour or bold pitcher decides who won, '(2)' doubleheader, rain-out, postseason sections
    cs, bad = P.parse_mlb(fx("mlb_yankees.wikitext"), 2026, "New York Yankees", MLB, "2026 New York Yankees season")
    check(not bad, "mlb unreadable rows: %r" % bad)
    c = one(cs, D(2026, 3, 30))
    if c: check(c["home"] == "Seattle Mariners" and c["score"] == {"New York Yankees": 1, "Seattle Mariners": 2}, "mlb loss written 1-2 %r" % c)
    c = one(cs, D(2026, 9, 25), lambda c: c["dh"] == 1)
    if c: check(c["home"] == "New York Yankees" and c["score"]["New York Yankees"] == 2, "mlb doubleheader game 1")
    c = one(cs, D(2026, 9, 25), lambda c: c["dh"] == 2)
    if c: check(c["score"] == {"New York Yankees": 6, "Baltimore Orioles": 3}, "mlb doubleheader game 2")
    c = one(cs, D(2026, 9, 27))
    if c: check(c["status"] == "cancelled", "mlb rain-out")
    c = one(cs, D(2026, 10, 3))
    if c: check(c["phase"] == "playoffs" and c["round"] == "American League Division Series" and c["home"] == "Tampa Bay Rays" and c["score"]["New York Yankees"] == 0, "mlb postseason row %r" % c)
    # MLB club article where the result sits in the score cell: 'W 8-2'
    cs, bad = P.parse_mlb(fx("mlb_dodgers.wikitext"), 2026, "Los Angeles Dodgers", MLB, "2026 Los Angeles Dodgers season")
    c = one(cs, D(2026, 3, 26))
    if c: check(c["score"] == {"Los Angeles Dodgers": 8, "Arizona Diamondbacks": 2}, "mlb W 8-2 cell %r" % c)
    # MLB postseason page: 'Away - 0, Home - 1' final and 'Away at Home' scheduled
    cs, bad = P.parse_mlb_postseason(fx("mlb_postseason.wikitext"), 2026, MLB, "2026 Major League Baseball postseason")
    check(not bad, "mlb postseason unreadable: %r" % bad)
    c = one(cs, D(2026, 10, 3), lambda c: c["status"] == "final")
    if c: check(c["home"] == "Tampa Bay Rays" and c["score"] == {"New York Yankees": 0, "Tampa Bay Rays": 1} and c["round"] == "American League Division Series", "mlb postseason page %r" % c)
    c = one(cs, D(2026, 10, 7))
    if c: check(c["home"] == "New York Yankees" and c["score"]["Tampa Bay Rays"] == 4, "mlb postseason page game 3")
    check(any(c["status"] == "scheduled" for c in cs), "mlb postseason page: a scheduled game")
    # NFL
    cs, bad = P.parse_nfl(fx("nfl_bills.wikitext"), 2026, "Buffalo Bills", NFL, "2026 Buffalo Bills season")
    check(not bad, "nfl unreadable rows: %r" % bad)
    c = one(cs, D(2026, 9, 13))
    if c: check(c["phase"] == "regular" and c["home"] == "Houston Texans" and c["score"] == {"Buffalo Bills": 36, "Houston Texans": 31}, "nfl week 1 %r" % c)
    c = one(cs, D(2026, 10, 4))
    if c: check(c["home"] == "Buffalo Bills" and c["score"] == {"Buffalo Bills": 26, "New England Patriots": 29}, "nfl week 4 loss %r" % c)
    check(one(cs, D(2026, 8, 15)) is None or one(cs, D(2026, 8, 15))["phase"] == "preseason", "nfl preseason table")
    check(any(c["status"] == "scheduled" for c in cs), "nfl scheduled row")
    # CFL (scripts/wikipedia/parse.py) and NBA (scripts/nba/parse.py): the old readers, wrapped
    cs, bad = P.parse_cfl(fx("cfl_argonauts.wikitext"), 2026, "Toronto Argonauts", CFL, "2026 Toronto Argonauts season")
    c = one(cs, D(2026, 6, 12))
    if c: check(c["home"] == "Montreal Alouettes" and c["score"] == {"Toronto Argonauts": 30, "Montreal Alouettes": 37}, "cfl loss at Montreal %r" % c)
    c = one(cs, D(2026, 6, 20))
    if c: check(c["home"] == "Ottawa Redblacks" and c["score"]["Toronto Argonauts"] == 44, "cfl win at Ottawa")
    check(any(c["status"] == "scheduled" for c in cs), "cfl scheduled row")
    cs, bad = P.parse_nba(fx("nba_celtics.wikitext"), 2026, "Boston Celtics", NBA, "2026–27 Boston Celtics season")
    check(not [c for c in cs if c["phase"] != "preseason"], "nba: preseason games must not appear as regular season")


def mk(page, home, away, hs, as_, date, **kw):
    return P.claim(page, (home, away), {home: hs, away: as_}, home, date, "final", "regular", **kw)


def test_pairing():
    d = D(2026, 10, 10)
    a, b = mk("A page", "X", "Y", 3, 2, d), mk("B page", "X", "Y", 3, 2, d)
    g = G.build_games([a, b], "nhl", 2026)
    check(len(g) == 1 and g[0]["confidence"] == "confirmed" and g[0]["score"] == {"X": 3, "Y": 2}, "two sources agree -> confirmed")
    g = G.build_games([a], "nhl", 2026)
    check(g[0]["confidence"] == "single", "one source -> single")
    c = mk("C page", "X", "Y", 2, 3, d)                      # disagrees; the home club's own article wins the tie-break
    g = G.build_games([a, c], "nhl", 2026)
    check(g[0]["confidence"] == "disputed" and g[0]["alternatives"], "different scores -> disputed")
    bad = dict(mk("X page", "X", "Y", 2, 3, d), inconsistent="colour")   # a row that contradicts itself ranks last
    g = G.build_games([bad, mk("Y page", "X", "Y", 3, 2, d)], "nhl", 2026)
    check(g[0]["score"] == {"X": 3, "Y": 2}, "inconsistent row loses the dispute")
    dh = [mk("A page", "X", "Y", 1, 0, d, dh=1), mk("A page", "X", "Y", 5, 4, d, dh=2), mk("B page", "X", "Y", 5, 4, d, dh=2), mk("B page", "X", "Y", 1, 0, d, dh=1)]
    g = G.build_games(dh, "mlb", 2026)
    check(len(g) == 2 and all(x["confidence"] == "confirmed" for x in g), "doubleheader pairs game 1 with game 1")
    sched = P.claim("A page", ("X", "Y"), None, "X", d, "scheduled", "regular")
    g = G.build_games([sched, b], "nhl", 2026)
    check(len(g) == 1 and g[0]["status"] == "final" and g[0]["notes"], "a stale scheduled row does not undo a final")
    check(g[0]["source_key"].startswith("wpdaily:nhl:2026:regular:2026-10-10:X:Y:"), "source_key")


def run():
    test_parsers()
    test_pairing()
    if FAILS:
        print("SELF-TEST FAILED:")
        for f in FAILS: print("  -", f)
        return 1
    print("self-test ok: parsers (NHL x2 layouts, MLB club + postseason, NFL, CFL, NBA) and pairing")
    return 0


if __name__ == "__main__":
    sys.exit(run())

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
        clubs.append(dict(fid=i + 1, name=full, location=loc, nickname=nick, abbr=abbr, fkey="spx_database:%d" % (i + 1)))
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
                     ("Chicago White Sox", "Chicago", "White Sox", "CWS"), ("Houston Astros", "Houston", "Astros", "HOU"),
                     ("Kansas City Royals", "Kansas City", "Royals", "KC"), ("Milwaukee Brewers", "Milwaukee", "Brewers", "MIL")])
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
    nv = dict(mk("nflverse", "X", "Y", 3, 2, d), source="nflverse")      # a third source agrees with one page: resolved, not disputed
    g = G.build_games([a, c, nv], "nfl", 2026)
    check(g[0]["confidence"] == "resolved" and g[0]["score"] == {"X": 3, "Y": 2} and g[0]["alternatives"], "nflverse + one page outvote the other page")
    nv2 = dict(mk("nflverse", "X", "Y", 1, 0, d), source="nflverse")      # nflverse agrees with neither page: still disputed
    g = G.build_games([a, c, nv2], "nfl", 2026)
    check(g[0]["confidence"] == "disputed", "nflverse agreeing with no page leaves it disputed")
    bad = dict(mk("X page", "X", "Y", 2, 3, d), inconsistent="colour")   # a row that contradicts itself ranks last
    g = G.build_games([bad, mk("Y page", "X", "Y", 3, 2, d)], "nhl", 2026)
    check(g[0]["score"] == {"X": 3, "Y": 2}, "inconsistent row loses the dispute")
    dh = [mk("A page", "X", "Y", 1, 0, d, dh=1), mk("A page", "X", "Y", 5, 4, d, dh=2), mk("B page", "X", "Y", 5, 4, d, dh=2), mk("B page", "X", "Y", 1, 0, d, dh=1)]
    g = G.build_games(dh, "mlb", 2026)
    check(len(g) == 2 and all(x["confidence"] == "confirmed" for x in g), "doubleheader pairs game 1 with game 1")
    # a rain-out on the 26th and its make-up on the 27th are two games, whichever source is read first (a source named 'a...' sorts before 'A page')
    d26, d27 = D(2026, 9, 26), D(2026, 9, 27)
    rain = P.claim("B page", ("X", "Y"), None, "X", d26, "postponed", "regular")
    fin_b, fin_c = mk("B page", "X", "Y", 2, 6, d27), dict(mk("a source", "X", "Y", 2, 6, d27), source="a source")
    g = G.build_games([rain, fin_b, fin_c], "mlb", 2026)
    check(len(g) == 2 and [x["status"] for x in g] == ["postponed", "final"] and g[1]["confidence"] == "confirmed", "a postponed row of one source does not take another source's make-up game")
    # two games on one day with no doubleheader numbers: the score decides who pairs with whom, not the order the sources are read
    two = [dict(mk("a source", "X", "Y", 5, 4, d), source="a source"), mk("B page", "X", "Y", 1, 0, d), mk("B page", "X", "Y", 5, 4, d),
           dict(mk("a source", "X", "Y", 1, 0, d), source="a source")]
    g = G.build_games(two, "mlb", 2026)
    check(len(g) == 2 and all(x["confidence"] == "confirmed" for x in g), "two unnumbered games of one day pair by score")
    # one game dated a day apart by two sources is one game; a different score still makes it a disputed one
    g = G.build_games([mk("A page", "X", "Y", 3, 2, d), mk("B page", "X", "Y", 3, 2, D(2026, 10, 11))], "nhl", 2026)
    check(len(g) == 1 and g[0]["confidence"] == "confirmed" and any("date differs" in n for n in g[0]["notes"]), "a game dated a day apart is still one game")
    g = G.build_games([mk("A page", "X", "Y", 3, 2, d), mk("B page", "X", "Y", 2, 3, D(2026, 10, 11))], "nhl", 2026)
    check(len(g) == 1 and g[0]["confidence"] == "disputed", "a game dated a day apart with another score is a disputed game")
    sched = P.claim("A page", ("X", "Y"), None, "X", d, "scheduled", "regular")
    g = G.build_games([sched, b], "nhl", 2026)
    check(len(g) == 1 and g[0]["status"] == "final" and g[0]["notes"], "a stale scheduled row does not undo a final")
    check(g[0]["source_key"].startswith("wpdaily:nhl:2026:regular:2026-10-10:X:Y:"), "source_key")


def test_doubleheader():
    import compare as C
    cs, bad = P.parse_mlb(fx("mlb_doubleheader.wikitext"), 2026, "Kansas City Royals", MLB, "2026 Kansas City Royals season")
    d1, d2 = [c for c in cs if c["date"] == D(2026, 4, 4)]
    check(not bad and d1["dh"] == 1 and d2["dh"] == 2, "doubleheader fixture: two games on April 4, numbered 1 and 2")
    check(d1["score"] == {"Kansas City Royals": 2, "Milwaukee Brewers": 5} and d2["score"] == {"Kansas City Royals": 8, "Milwaukee Brewers": 2}, "doubleheader fixture: game 1 lost 2-5, game 2 won 8-2")
    other = [dict(c, page="2026 Milwaukee Brewers season", source="wp:2026 Milwaukee Brewers season") for c in (d1, d2)]
    gs = G.build_games(cs + other, "mlb", 2026)
    g4 = [g for g in gs if g["date"] == D(2026, 4, 4)]
    check(len(g4) == 2 and [g["source_key"][-1] for g in g4] == ["0", "1"] and all(g["confidence"] == "confirmed" for g in g4), "doubleheader: two games, keys end :0 and :1")
    names = {c["name"]: c["fid"] for c in MLB.clubs}
    kc, mil = names["Kansas City Royals"], names["Milwaukee Brewers"]
    mk_ds1 = lambda gid, key, hs, as_: dict(id=gid, phase="regular", date=D(2026, 4, 4), status="final", hf=kc, af=mil, hs=hs, as_=as_, ot=False, so=False, key=key, src="wikipedia_daily", used=False)
    # DS1 lists the second game first, as a database may
    ds1 = [mk_ds1(2, g4[1]["source_key"], 8, 2), mk_ds1(1, g4[0]["source_key"], 2, 5)]
    pairs, left = C.match(g4, ds1, MLB)
    kinds = [C.classify(g, d, MLB)[0] for g, d in pairs]
    check(kinds == ["same", "same"] and not left, "doubleheader: each game matches its own DS1 row, no swapped scores (%r)" % kinds)
    check([d["id"] for g, d in pairs] == [1, 2], "doubleheader: game 1 -> DS1 row 1, game 2 -> DS1 row 2")


def test_stage2():
    import apply as A
    check(NHL.resolve("Colombus") and NHL.resolve("Colombus")["name"] == "Columbus Blue Jackets", "known typo Colombus resolves to Columbus")
    d = D(2026, 10, 10)
    a, c = mk("A page", "X", "Y", 3, 2, d), mk("C page", "X", "Y", 2, 3, d)
    nv = dict(mk("nflverse", "X", "Y", 3, 2, d), source="nflverse")
    g = G.build_games([a, c, nv], "nfl", 2026)[0]
    r = A.staging_row(g)
    check(r["confidence"] == "resolved" and r["home_name"] == "X" and r["away_name"] == "Y" and (r["home_score"], r["away_score"]) == (3, 2), "staging row keeps home, away and the score")
    check(len(r["dissent"]) == 2 and any(x.startswith("A page + nflverse say ") for x in r["dissent"]) and any(x.startswith("C page says ") for x in r["dissent"]), "every source's statement is kept for a resolved game")
    neutral = P.claim("N page", ("X", "Y"), {"X": 1, "Y": 0}, None, d, "final", "playoffs", neutral=True)
    r = A.staging_row(G.build_games([neutral], "nfl", 2026)[0])
    check(r["home_known"] is False and r["neutral"] and r["home_score"] is not None, "no known home: sides kept, neutral")
    check(A.jlit({"a": "$j$"}).startswith("$jx$"), "a dollar-quoted literal never contains its own tag")
    check(A.strip_txn(A.BUILD).count("\nbegin;") == 0 and "commit;" not in "\n".join(l for l in A.strip_txn(A.BUILD).split("\n") if l.strip() == "commit;"), "build step runs inside the caller's transaction")


def test_observation():
    import apply as A
    xy = roster("nfl", [("X", "X", "X", "XX"), ("Y", "Y", "Y", "YY")])
    d = D(2026, 10, 10)
    a, c = mk("A page", "X", "Y", 3, 2, d), mk("C page", "X", "Y", 2, 3, d)
    a["revid"], c["revid"] = 11, 22
    nv = dict(mk("nflverse", "X", "Y", 3, 2, d), source="nflverse", page="nflverse", revid="abc")
    o = A.observation(G.build_games([a, c, nv], "nfl", 2026)[0], xy)
    check(o["home_key"] == "spx_database:1" and o["away_key"] == "spx_database:2" and o["game_no"] == 0, "observation carries franchise keys, not database ids")
    check(o["status"] == "final" and (o["home_score"], o["away_score"]) == (3, 2) and o["verdict"] == "resolved" and o["source"] == "nflverse" and o["ref"] == "nflverse@abc", "resolved final: best source, its reference")
    check(sorted(o["agree"]) == ["A page@11", "nflverse@abc"] and len(o["conflict"]) == 1 and o["conflict"][0]["ref"] == "C page@22"
          and (o["conflict"][0]["home_score"], o["conflict"][0]["away_score"]) == (2, 3) and o["dissent"], "evidence: who agrees, who conflicts, in the game's orientation")
    s = A.observation(G.build_games([P.claim("A page", ("X", "Y"), None, "X", d, "scheduled", "regular")], "nfl", 2026)[0], xy)
    check(s["status"] == "scheduled" and s["verdict"] == "none" and s["home_score"] is None and s["conflict"] == [], "a scheduled game has no verdict and no score")
    json_ok = A.jlit([o, s]).startswith("$j$")
    check(json_ok, "observations go to SQL as one dollar-quoted jsonb literal")
    dh = [mk("A page", "X", "Y", 1, 0, d, dh=1), mk("A page", "X", "Y", 5, 4, d, dh=2), mk("B page", "X", "Y", 5, 4, d, dh=2), mk("B page", "X", "Y", 1, 0, d, dh=1)]
    nums = sorted(A.observation(g, xy)["game_no"] for g in G.build_games(dh, "mlb", 2026))
    check(nums == [0, 1], "a doubleheader's second game is game_no 1")


def test_balldontlie():
    import json, tempfile, apply as A, balldontlie as B
    ids = sorted(B.TEAMS)
    check(ids == list(range(1, 31)), "balldontlie table: the 30 NBA team ids, 1 to 30")
    check(len({a for a, _ in B.TEAMS.values()}) == 30 and len({n for _, n in B.TEAMS.values()}) == 30, "balldontlie table: abbreviations and names are all different")
    full = roster("nba", [(n, n.rsplit(" ", 1)[0], n.rsplit(" ", 1)[1], a) for a, n in B.TEAMS.values()])
    check(all(full.by_name.get(T.norm(n)) for _, n in B.TEAMS.values()), "balldontlie table: every name is a club of a roster built from it")
    d = json.loads(fx("balldontlie_games.json"))
    cs, bad = B.claims_from(d["data"], full, 2026)
    check(not bad and len(cs) == 8, "balldontlie fixture: 8 NBA games read, the game against a foreign club skipped (%d, %r)" % (len(cs), bad))
    by = {c["src"]: c for c in cs}
    c = by["21717855"]
    check(c["status"] == "scheduled" and c["score"] is None and c["home"] == "Detroit Pistons" and set(c["teams"]) == {"Detroit Pistons", "Boston Celtics"} and c["date"] == D(2026, 10, 20), "balldontlie: a scheduled game")
    c = by["900001"]
    check(c["status"] == "final" and c["score"] == {"Miami Heat": 112, "Minnesota Timberwolves": 104} and c["ot"] is False, "balldontlie: a final, scores by team")
    c = by["900002"]
    check(c["ot"] is True and c["ot_n"] == 1 and c["score"]["Los Angeles Lakers"] == 121, "balldontlie: period 5 is one overtime")
    check(by["900003"]["status"] == "scheduled" and by["900003"]["score"] is None, "balldontlie: a game being played has no result yet")
    check(by["900004"]["phase"] == "playoffs" and by["900004"]["status"] == "final", "balldontlie: a postseason game is a playoff game")
    check(by["900005"]["status"] == "postponed", "balldontlie: postponed")
    check(all(c["source"] == "balldontlie" and c["page"] == "balldontlie" for c in cs), "balldontlie: claims carry the source name")
    # cross-check: balldontlie + one Wikipedia page agreeing = confirmed; alone = single; disagreeing = disputed (a page outranks nothing, balldontlie ranks first)
    fin = by["900001"]
    wp = mk("2026–27 Miami Heat season", "Miami Heat", "Minnesota Timberwolves", 112, 104, D(2026, 10, 22))
    g = G.build_games([fin, wp], "nba", 2026)
    check(len(g) == 1 and g[0]["confidence"] == "confirmed", "balldontlie + a Wikipedia page agreeing -> confirmed")
    g = G.build_games([fin], "nba", 2026)
    check(g[0]["confidence"] == "single" and g[0]["status"] == "final", "balldontlie alone -> single final")
    # an observation names balldontlie as the source and carries its reference
    bd = dict(fin, revid="abc")
    o = A.observation(G.build_games([bd], "nba", 2026)[0], full)
    check(o["source"] == "balldontlie" and o["ref"] == "balldontlie@abc" and o["verdict"] == "single", "observation: source balldontlie, reference balldontlie@<sha>")
    sch = A.observation(G.build_games([by["21717855"]], "nba", 2026)[0], full)
    check(sch["source"] == "balldontlie" and sch["status"] == "scheduled" and sch["verdict"] == "none", "observation: a scheduled game seen only by balldontlie")
    # fetching: throttled, whole season first, then the window; games merge by id; the archived bytes are stable
    pages = [dict(data=d["data"][:5], meta=dict(next_cursor=5, per_page=5)), dict(data=d["data"][5:], meta=dict(next_cursor=None, per_page=5))]
    calls, slept = [], []
    def fake_get(path, params, key):
        calls.append((path, dict(params))); return pages[1 if "cursor" in params else 0]
    with tempfile.TemporaryDirectory() as raw:
        st = {}
        n = B.fetch(2026, D(2026, 10, 15), raw, st, "k", today=D(2026, 10, 12), sleep=slept.append, get=fake_get)
        check(n == 2 and slept == [B.PAGE_GAP] and "start_date" not in calls[0][1] and calls[1][1].get("cursor") == 5, "fetch: whole season, two pages, one 13 s pause")
        check(len(B.load_cache(raw, 2026)["games"]) == len(d["data"]) and st["balldontlie"]["full_at"] == "2026-10-12", "fetch: games cached by id, whole read recorded")
        sub1 = B.subset(raw, 2026)
        calls.clear(); slept.clear()
        n = B.fetch(2026, D(2026, 10, 15), raw, st, "k", today=D(2026, 10, 14), sleep=slept.append, get=fake_get)
        check(calls[0][1].get("start_date") == "2026-10-15" and calls[0][1].get("end_date") == "2026-10-15", "fetch: two days later only the window up to tomorrow is read")
        sub2 = B.subset(raw, 2026)
        check(sub1[1] == sub2[1] and sub1[0].endswith(b"\n"), "the archived bytes are identical when no game changed")
        calls.clear()
        B.fetch(2026, D(2026, 10, 15), raw, st, "k", today=D(2026, 10, 19), sleep=slept.append, get=fake_get)
        check("start_date" not in calls[0][1], "fetch: a week after the last whole read, the whole season again")
        cs2, bad2, n2 = B.claims(2026, full, D(2026, 10, 15), True, raw, {})
        check(n2 == 0 and len(cs2) == 8 and all(c["revid"] == sub1[1] for c in cs2), "offline: claims from the cache, no request, revision = the file's sha256")
        files = [dict(source="balldontlie", league="nba", season=2026, title=B.TITLE, ext="json", data=sub1[0], sha256=sub1[1], day="2026-10-12", fetched_at="2026-10-12T14:00:00Z", claims=cs2)]
        arch, pg, cl = A.plan_load([], set(), {}, raw, None, files)
        check(len(arch) == 1 and arch[0]["name"] == "balldontlie/2026-10-12/games-2026.%s.json" % sub1[1][:12] and pg[0]["source"] == "balldontlie" and pg[0]["kind"] == "file", "plan_load: the file is archived as balldontlie/<day>/games-<season>.<sha12>.json")
        arch, pg, cl = A.plan_load([], {("balldontlie", B.TITLE, sub1[1])}, {}, raw, None, files)
        check(not arch and not pg, "plan_load: content DS1 already holds is not archived again")
    # no key: nothing is requested
    k = os.environ.pop("BALLDONTLIE_API_KEY", None)
    try:
        if sys.platform != "darwin": check(B.claims(2026, full, D(2026, 10, 15), False, "/nonexistent", {}) == (None, [], 0), "no key -> skipped, no request")
    finally:
        if k: os.environ["BALLDONTLIE_API_KEY"] = k


def test_bdlsports():
    import json, tempfile, apply as A, balldontlie as B, bdlsports as S
    # the fixed tables against the saved /teams responses
    for lg, table, name_of in (("mlb", S.MLB_TEAMS, lambda t: t["display_name"]), ("nfl", S.NFL_TEAMS, lambda t: t["full_name"])):
        teams = json.loads(fx("balldontlie_%s_teams.json" % lg))["data"]
        check(len(teams) == len(table) == (30 if lg == "mlb" else 32), "%s table: %d clubs" % (lg, len(table)))
        want = {t["id"]: (t["abbreviation"], {20: "Sacramento Athletics"}.get(t["id"], name_of(t)) if lg == "mlb" else name_of(t)) for t in teams}
        check(want == table, "%s table: every id, abbreviation and name equals the saved /teams response (the Athletics are DS1's Sacramento Athletics)" % lg)
        check(len({a for a, _ in table.values()}) == len(table) and len({n for _, n in table.values()}) == len(table), "%s table: abbreviations and names are all different" % lg)
    rosters = {lg: roster(lg, [(n, n, n, a) for a, n in S.SPORTS[lg]["teams"].values()]) for lg in ("mlb", "nfl")}
    # the clock is shared: a request waits for the gap since the last one, whatever the sport
    waits = []
    B._LAST[0] = 100.0
    B.pace(sleep=waits.append, now=lambda: 104.0)
    B._LAST[0] = None
    B.pace(sleep=waits.append, now=lambda: 104.0)
    check(waits == [B.PAGE_GAP - 4.0], "pace: 9 s still to wait 4 s after the last request, nothing before the first (%r)" % waits)
    # MLB
    d = json.loads(fx("balldontlie_mlb_games.json"))["data"]
    cs, bad = S.claims_from("mlb", d, rosters["mlb"], 2026)
    by = {c["src"]: c for c in cs}
    check(len(cs) == 10 and len(bad) == 2, "mlb fixture: 10 games read; a team outside the table and an abandoned game unreadable; spring training and another season skipped (%d, %r)" % (len(cs), bad))
    real = [c for c in cs if int(c["src"]) >= 1000000]
    check(len(real) == 3 and all(c["status"] == "final" and c["phase"] == "playoffs" for c in real), "mlb: the three real postseason finals are playoff finals")
    c = real[0]
    check(c["date"] == D(2026, 10, 10) and sum(c["score"].values()) > 0 and c["home"] in c["score"], "mlb: the club's local date is the UTC start minus 9 hours (00:00Z on the 11th is the 10th)")
    check(by["900001"]["status"] == "scheduled" and by["900001"]["score"] is None and by["900001"]["date"] == D(2026, 10, 20), "mlb: a scheduled game")
    check(by["900002"]["status"] == "postponed" and by["900002"]["score"] is None, "mlb: postponed")
    check(by["900003"]["ot"] is True and by["900003"]["ot_n"] == 2 and by["900003"]["phase"] == "playoffs", "mlb: 11 innings is two extra innings")
    check(by["900004"]["ot"] is False and by["900004"]["ot_n"] is None and by["900004"]["phase"] == "regular", "mlb: nine innings, regular season")
    check(by["900008"]["status"] == "scheduled" and by["900008"]["score"] is None, "mlb: a game being played has no result yet")
    check(by["900005"]["dh"] == 1 and by["900006"]["dh"] == 2 and by["900004"]["dh"] is None, "mlb: two games of a pair on one day are a doubleheader, the earlier start first")
    check(all(c["source"] == "balldontlie" and c["page"] == "balldontlie" for c in cs), "mlb: claims carry the source name")
    g5, g6 = by["900005"], by["900006"]
    wp = [dict(g5, page="2026 X season", source="wp:2026 X season", dh=1), dict(g6, page="2026 X season", source="wp:2026 X season", dh=2)]
    gs = G.build_games([g5, g6] + wp, "mlb", 2026)
    check(len(gs) == 2 and all(g["confidence"] == "confirmed" for g in gs), "mlb: balldontlie + a club article agreeing -> confirmed, both games of a doubleheader")
    # NFL
    d = json.loads(fx("balldontlie_nfl_games.json"))["data"]
    cs, bad = S.claims_from("nfl", d, rosters["nfl"], 2026)
    by = {c["src"]: c for c in cs}
    check(len(cs) == 7 and len(bad) == 1, "nfl fixture: 7 games read, one with a team outside the table unreadable, other seasons skipped (%d, %r)" % (len(cs), bad))
    ot = by["1392219"]
    check(ot["status"] == "final" and ot["ot"] is True and len(ot["score"]) == 2, "nfl: Final/OT is an overtime final")
    check(by["1392216"]["ot"] is False and by["1392216"]["date"] == D(2026, 9, 9) and by["1392216"]["phase"] == "regular", "nfl: regulation final; the local date of a 00:20Z start is the day before")
    check(by["1392295"]["status"] == "scheduled" and by["1392295"]["score"] is None and by["1392295"]["date"] == D(2026, 10, 15), "nfl: a scheduled game")
    check(by["900001"]["status"] == "postponed" and by["900002"]["status"] == "scheduled" and by["900002"]["score"] is None, "nfl: postponed; a game being played has no result yet")
    tbd = dict(d[4], id=900005, date="2027-01-10T05:00:00.000Z", status="TBD")
    c = S.claims_from("nfl", [tbd], rosters["nfl"], 2026)[0][0]
    check(c["status"] == "scheduled" and c["date"] == D(2027, 1, 10), "nfl: a game with no time yet (05:00Z, TBD) keeps its day")
    mix = dict(d[4], id=900006, home_team=dict(d[4]["home_team"], id=-1))
    check(S.claims_from("nfl", [mix], rosters["nfl"], 2026) == ([], []), "a game with a club that is not one (id -1: the All-Star Game, an undecided pairing) is skipped without a word")
    cs25, bad25 = S.claims_from("nfl", d, rosters["nfl"], 2025)
    check(len(cs25) == 2 and not bad25 and {c["src"]: c for c in cs25}["1286916"]["phase"] == "playoffs" and {c["src"]: c for c in cs25}["1286916"]["ot"] is True, "nfl: the 2025 playoff overtime game, read for 2025 only")
    # the cross-check, NFL: balldontlie + nflverse + a club article
    fin = by["1392216"]
    h, a = fin["home"], next(t for t in fin["teams"] if t != fin["home"])
    nv = dict(mk("nflverse", h, a, fin["score"][h], fin["score"][a], fin["date"]), source="nflverse", page="nflverse")
    wp1 = mk("2026 %s season" % h, h, a, fin["score"][h], fin["score"][a], fin["date"])
    wp2 = mk("2026 %s season" % a, h, a, fin["score"][a], fin["score"][h], fin["date"])
    check(G.build_games([fin, nv], "nfl", 2026)[0]["confidence"] == "confirmed", "nfl: balldontlie + nflverse agreeing -> confirmed")
    check(G.build_games([fin, wp1], "nfl", 2026)[0]["confidence"] == "confirmed", "nfl: balldontlie + one club article agreeing -> confirmed")
    check(G.build_games([fin, wp2], "nfl", 2026)[0]["confidence"] == "disputed", "nfl: balldontlie against one club article -> disputed, held")
    check(G.build_games([fin, nv, wp2], "nfl", 2026)[0]["confidence"] == "disputed", "nfl: balldontlie + nflverse against the only club article -> disputed, held (no club article agrees)")
    check(G.build_games([fin, nv, wp1, wp2], "nfl", 2026)[0]["confidence"] == "resolved", "nfl: balldontlie + nflverse + one club article against the other -> resolved")
    check(G.build_games([fin], "nfl", 2026)[0]["confidence"] == "single", "nfl: balldontlie alone -> single")
    # fetching: the whole season (MLB: regular season, then postseason), then the days from `since` to tomorrow in one request
    mlb = json.loads(fx("balldontlie_mlb_games.json"))["data"]
    calls = []
    def fake_get(path, params, key, base=None):
        calls.append((base, path, dict(params)))
        pages = {"regular": [mlb[:5], mlb[5:9]], "postseason": [mlb[9:]]}.get(params.get("season_type"), [mlb])
        i = 1 if "cursor" in params else 0
        return dict(data=pages[i] if i < len(pages) else [], meta=dict(per_page=100, **({"next_cursor": 5} if len(pages) > 1 and i == 0 else {})))
    with tempfile.TemporaryDirectory() as raw:
        st = {}
        n = S.fetch("mlb", 2026, D(2026, 10, 6), raw, st, "k", today=D(2026, 10, 13), get=fake_get)
        check(n == 3 and calls[0][0].endswith("/mlb/v1") and calls[0][2].get("season_type") == "regular" and calls[2][2].get("season_type") == "postseason"
              and all("dates[]" not in c[2] for c in calls), "mlb fetch: whole season = regular season (two pages) then postseason")
        check(len(S.load_cache(raw, "mlb", 2026)["games"]) == len([g for g in mlb if g.get("season_type") != "spring_training"]) and st["balldontlie_mlb"]["full_at"] == "2026-10-13", "mlb fetch: games cached by id, spring training not kept, whole read recorded")
        sub1 = S.subset(raw, "mlb", 2026)
        calls.clear()
        n = S.fetch("mlb", 2026, D(2026, 10, 10), raw, st, "k", today=D(2026, 10, 14), get=fake_get)
        check(n == 1 and calls[0][2]["dates[]"] == ["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"] and "season_type" not in calls[0][2],
              "mlb fetch: two days later one request listing the days from since to tomorrow")
        check(S.subset(raw, "mlb", 2026)[1] == sub1[1], "mlb fetch: the archived bytes are identical when no game changed")
        calls.clear()
        S.fetch("mlb", 2026, D(2026, 10, 12), raw, st, "k", today=D(2026, 10, 20), get=fake_get)
        check("dates[]" not in calls[0][2], "mlb fetch: a week after the last whole read, the whole season again")
        calls.clear()
        S.fetch("mlb", 2026, D(2026, 9, 1), raw, st, "k", today=D(2026, 10, 21), get=fake_get)
        check("dates[]" not in calls[0][2], "mlb fetch: a since more than 14 days back reads the whole season")
        cs2, bad2, n2 = S.claims("mlb", 2026, rosters["mlb"], D(2026, 10, 15), True, raw, {})
        check(n2 == 0 and len(cs2) == 10 and all(c["revid"] == sub1[1] for c in cs2), "mlb offline: claims from the cache, no request, revision = the file's sha256")
        files = [dict(source="balldontlie", league="mlb", season=2026, title=S.title("mlb"), stem=S.stem("mlb", 2026), ext="json", data=sub1[0], sha256=sub1[1], day="2026-10-13", fetched_at="2026-10-13T14:00:00Z", claims=cs2)]
        arch, pg, cl = A.plan_load([], set(), {}, raw, None, files)
        check(len(arch) == 1 and arch[0]["name"] == "balldontlie/2026-10-13/games-mlb-2026.%s.json" % sub1[1][:12] and pg[0]["title"] == "games-mlb.json" and pg[0]["league"] == "mlb",
              "plan_load: the file is archived as balldontlie/<day>/games-<league>-<season>.<sha12>.json")
        arch, pg, cl = A.plan_load([], {("balldontlie", "games-mlb.json", sub1[1])}, {}, raw, None, files)
        check(not arch and not pg, "plan_load: content DS1 already holds is not archived again")
    calls.clear()
    with tempfile.TemporaryDirectory() as raw:
        n = S.fetch("nfl", 2026, D(2026, 10, 6), raw, {}, "k", today=D(2026, 10, 13), get=fake_get)
        check(n == 1 and calls[0][0].endswith("/nfl/v1") and "season_type" not in calls[0][2] and calls[0][2]["seasons[]"] == 2026, "nfl fetch: the whole season is one parameter set (regular season and postseason are the default)")
    # no key: nothing is requested
    k = os.environ.pop("BALLDONTLIE_API_KEY", None)
    try:
        if sys.platform != "darwin": check(S.claims("mlb", 2026, rosters["mlb"], D(2026, 10, 15), False, "/nonexistent", {}) == (None, [], 0), "no key -> skipped, no request")
    finally:
        if k: os.environ["BALLDONTLIE_API_KEY"] = k


def test_release_hook():
    import contextlib, io, json, tempfile, release_hook as R
    with tempfile.TemporaryDirectory() as d:
        stub = os.path.join(d, "release.py")
        log = os.path.join(d, "argv.json")
        open(stub, "w").write("import json, os, sys\njson.dump(sys.argv[1:], open(%r, 'w'))\n"
                              "print(os.environ.get('STUB_OUT', 'release 1 (x): y'))\nsys.exit(int(os.environ.get('STUB_RC', '0')))\n" % log)
        base = dict(DAILY_PREPARE_RELEASE="1", SUPABASE_ACCESS_TOKEN="tok-secret", PGHOST="h", PGPASSWORD="pw-secret", PATH=os.environ.get("PATH", ""))

        def go(tables, rc=0, out="release 1 (x): y", **extra):
            env = dict(base, STUB_RC=str(rc), STUB_OUT=out, **extra)
            if os.path.exists(log): os.remove(log)
            with contextlib.redirect_stdout(io.StringIO()):
                r = R.prepare_release({t: dict(ins=1) for t in tables}, "2026-10-12", dict(games_changed=3), env=env, release=stub)
            return r, (json.load(open(log)) if os.path.exists(log) else None)

        auto = ["core.game", "meta.verification", "meta.data_issue"]
        r, a = go(["core.game", "meta.verification"], DAILY_RELEASE_KIND="daily_scores")
        check(r["status"] == "prepared" and r["route"] == "auto", "auto route: scores tables + a kind -> prepared on the auto route")
        check(a and a[:4] == ["--by", "daily-job", "prepare", "--kind"] and a[4] == "daily_scores", "auto route: --by daily-job before prepare, then --kind daily_scores")
        check(a and "--tables" not in a and a[a.index("--title") + 1] == "Daily scores 2026-10-12", "auto route: no --tables, plain title")
        r, a = go(auto, DAILY_RELEASE_KIND="daily_scores")
        check(r["route"] == "auto" and a and "--tables" not in a, "auto route: all three allowed tables")
        r, a = go(["core.game", "core.season", "core.team_season", "core.external_id"], DAILY_RELEASE_KIND="daily_scores")
        check(r["status"] == "prepared" and r["route"] == "review", "review route: a new season touched")
        check(a and "--kind" not in a and a[:3] == ["--by", "daily-job", "prepare"], "review route: no --kind")
        check(a and a[a.index("--tables") + 1] == "core.external_id,core.game,core.season,core.team_season", "review route: --tables lists ALL touched tables")
        check(a and a[a.index("--title") + 1] == "Daily scores 2026-10-12 (needs review)", "review route: title says needs review")
        r, a = go(["core.game"])
        check(r["route"] == "review" and a and "--kind" not in a and "--tables" in a, "no DAILY_RELEASE_KIND -> review route even for scores only")
        r, a = go(["core.game"], rc=1, out="release.py: DS1 and production already match for these tables: nothing to release", DAILY_RELEASE_KIND="daily_scores")
        check(r["status"] == "nothing", "exit 1 with 'nothing to release' -> nothing")
        r, a = go(["core.game"], rc=1, out="refused: checks failed", DAILY_RELEASE_KIND="daily_scores")
        check(r["status"] == "refused", "other exit 1 -> refused")
        r, a = go(["core.game"], rc=2, DAILY_RELEASE_KIND="daily_scores")
        check(r["status"] == "failed", "other exit -> failed")
        r, a = go(["core.game"], rc=1, out="boom tok-secret pw-secret", DAILY_RELEASE_KIND="daily_scores")
        check("tok-secret" not in r["detail"] and "pw-secret" not in r["detail"], "secrets are scrubbed from the detail")
        r, a = go(["core.game"], DAILY_PREPARE_RELEASE="0")
        check(r["status"] == "off" and a is None, "hook off -> release.py not run")
        r, a = go(["ingest.x"], DAILY_RELEASE_KIND="daily_scores")
        check(r["status"] == "nothing" and a is None, "only non-release schemas -> nothing, not run")
        r, a = go(["core.game"], SUPABASE_ACCESS_TOKEN="")
        check(r["status"] == "skipped" and a is None, "no token -> skipped")


def run():
    test_observation()
    test_balldontlie()
    test_bdlsports()
    test_parsers()
    test_pairing()
    test_doubleheader()
    test_stage2()
    test_release_hook()
    if FAILS:
        print("SELF-TEST FAILED:")
        for f in FAILS: print("  -", f)
        return 1
    print("self-test ok: parsers (NHL x2 layouts, MLB club + postseason, NFL, CFL, NBA), pairing, the stage 2 staging rows, the ingest observations, balldontlie (table, fixture, fetching, archive; NBA, MLB and NFL) and the release hook (auto and review routes)")
    return 0


if __name__ == "__main__":
    sys.exit(run())

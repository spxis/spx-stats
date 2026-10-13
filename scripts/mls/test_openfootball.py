"""python3 -I scripts/mls/test_openfootball.py [raw dir]   (no raw dir: only the inline cases)"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import openfootball as OF

SAMPLE = """= Major League Soccer 2019
▪ Matchday 1
  Sat Mar 2 2019
    13:00  Philadelphia Union      v Toronto FC               1-3 (0-1)
           FC Dallas               v New England Revolution   1-1 (1-0)
    15:00  New York City FC        v D.C. United              0-0
  Sun Mar 3
    18:00  D.C. United             v Atlanta United FC        2-0 (1-0)
▪ Playoffs, Qualifikation
  Sat Oct 19
    15:30  Seattle Sounders        v FC Dallas                4-3 a.e.t. (3-3, 2-1)
    21:30  Sporting Kansas City    v San Jose Earthquakes     4-2 pen. (0-0)
    20:30  FC Dallas               v Colorado Rapids          4-5 pen. 2-2 a.e.t. (1-1, 0-1)
    20:50  Seattle Sounders        v Houston Dynamo           5-4 pen. (1-1, 0-0)
"""
m, u, _ = OF.parse_file(SAMPLE, 2019)
assert not u, u
assert len(m) == 8
assert (m[0]["date"], m[0]["time"], m[0]["score1"], m[0]["score2"], m[0]["ht"]) == ("2019-03-02", "13:00", 1, 3, "0-1")
assert m[1]["time"] is None and m[1]["date"] == "2019-03-02"
assert m[2]["ht"] is None and m[2]["score1"] == 0
assert m[3]["date"] == "2019-03-03"
assert m[4]["aet"] and (m[4]["score1"], m[4]["score2"], m[4]["score90"], m[4]["ht"]) == (4, 3, "3-3", "2-1")
assert m[5]["pens1"] == 4 and m[5]["score1"] is None and m[5]["ht"] == "0-0"
assert (m[6]["pens1"], m[6]["pens2"], m[6]["score1"], m[6]["score2"], m[6]["aet"]) == (4, 5, 2, 2, True)
assert m[7]["pens1"] == 5 and m[7]["score90"] == "1-1"
print("inline cases ok")

if len(sys.argv) > 1:
    raw = os.path.expanduser(sys.argv[1]) + "/openfootball"
    total = 0
    for y in range(2005, 2026):
        text = open(f"{raw}/{y}_mls.txt", encoding="utf-8").read()
        want = int(re.search(r"# Matches\s+(\d+)", text).group(1))
        ms, un, canc = OF.parse_file(text, y)
        total += len(ms)
        print(y, "matches", len(ms), "cancelled", len(canc), "header says", want, "unread", len(un), un[:2])
        assert len(ms) + len(canc) == want and not un
    print("all files ok,", total, "matches")

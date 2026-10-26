#!/usr/bin/env python3
"""Checks the parser against every raw file: the matches read plus the fixtures with no score plus the cancelled ones must equal the file's own "# Matches" header
(files of the england archive have no header: their count must be clubs * (clubs - 1)), no line may be left unread, and no fixture may repeat.
Usage: test_openfootball.py <raw dir>     e.g. test_openfootball.py ~/Projects/backups/spx-stats/raw/openfootball/2026-10-25
Also runs a few lines through the parser (extra time, a shootout, an awarded result, both line shapes) and exits 1 on a failure.
A season still being played (the 2025-26 and 2026-27 files) may have fixtures twice in the header's count; those files are listed as `note`, not failures."""
import collections, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import openfootball as OF

fails = 0


def check(name, ok, detail=""):
    global fails
    if not ok:
        fails += 1
        print("FAIL", name, detail)


text = """= Test 2021/22
▪ Matchday 1
Fri Aug 6
  19:45  AFC Bournemouth          2-2 (1-1)  West Bromwich Albion FC
▪ Playoffs
Tue May 17
  19:45  Nottingham Forest FC     3-2 pen. 1-2 a.e.t. (1-2, 1-0)  Sheffield United FC
Sun May 29
    16:30  Southampton FC          v Middlesbrough FC         1-0 a.e.t. (0-0)
    16:30  Union Berlin            v VfL Bochum 1848          0-2    [awarded]
           Scunthorpe United       v Wealdstone FC            [abandoned]
           Stevenage FC            v Barnsley FC
"""
ms, un, unplayed, canc = OF.parse_file(text, 2021)
check("test lines read", not un and len(ms) == 4 and len(unplayed) == 1 and len(canc) == 1, (len(ms), un, len(unplayed), len(canc)))
check("plain", (ms[0]["team1"], ms[0]["score1"], ms[0]["score2"], ms[0]["ht1"], ms[0]["date"]) == ("AFC Bournemouth", 2, 2, 1, "2021-08-06"), ms[0])
check("shootout", (ms[1]["score1"], ms[1]["score2"], ms[1]["pens1"], ms[1]["pens2"], ms[1]["aet"], ms[1]["s90_1"], ms[1]["date"]) == (1, 2, 3, 2, True, 1, "2022-05-17"), ms[1])
check("extra time", (ms[2]["score1"], ms[2]["score2"], ms[2]["aet"], ms[2]["pens1"]) == (1, 0, True, None), ms[2])
check("awarded", (ms[3]["tag"], ms[3]["score1"], ms[3]["score2"]) == ("awarded", 0, 2), ms[3])

raw = os.path.expanduser(sys.argv[1]) if len(sys.argv) > 1 else None
files = 0
total = 0
if raw:
    for root, _, names in os.walk(raw):
        for f in sorted(names):
            rel = os.path.relpath(os.path.join(root, f), raw)
            m = re.match(r"^(?:england/archive/1990s|england|deutschland|espana|italy|europe/france)/(\d{4})-\d\d(?:/|_)", rel)
            if not m or not f.endswith(".txt"):
                continue
            files += 1
            body = open(os.path.join(root, f), encoding="utf-8").read()
            ms, un, unplayed, canc = OF.parse_file(body, int(m.group(1)))
            total += len(ms)
            check(rel + " unread lines", not un, un[:2])
            keys = collections.Counter((x["date"], x["team1"], x["team2"]) for x in ms)
            check(rel + " repeated fixture", all(c == 1 for c in keys.values()), [k for k, c in keys.items() if c > 1][:2])
            hm = re.search(r"^#\s*Matches\s+(\d+)", body, re.M)
            clubs = len({x["team1"] for x in ms} | {x["team2"] for x in ms})
            got = len(ms) + len(unplayed) + len(canc)
            if hm:
                if got != int(hm.group(1)):
                    print("note", rel, "matches read + unplayed + cancelled =", got, "but the header says", hm.group(1))
            else:
                check(rel + " count without a header", len(ms) == clubs * (clubs - 1), (len(ms), clubs))
    print(f"{files} files, {total} matches read" if files else "no files found")
print("failed" if fails else "ok", fails)
sys.exit(1 if fails else 0)

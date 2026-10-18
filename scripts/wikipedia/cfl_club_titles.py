#!/usr/bin/env python3
"""Which club-season articles exist on English Wikipedia for a range of CFL seasons: writes CACHE/team_titles.txt
(one title a line) and CACHE/multiyear_titles.txt (the pages a club-season title redirects to, which hold several
seasons: 'Saskatchewan Roughriders football, 1970-79'). It asks the MediaWiki API for 50 titles a call (a read of page
existence only, one call every 2 s), so a year of nine clubs costs less than one request.

  cfl_club_titles.py CACHE FROM TO     e.g. cfl_club_titles.py ~/Projects/backups/spx-stats/raw/wikipedia_cfl_early/2026-10-18 1958 1987

Then `season.py fetch YEAR` (with CFL_CACHE set to the same folder) saves the pages themselves, 2.5 s apart. English Wikipedia, CC BY-SA 4.0."""
import json, os, sys, time, urllib.parse, urllib.request

UA = "spx-stats/0.1 (https://github.com/spxis/spx-stats)"


def clubs(y):
    c = ["Ottawa Rough Riders", "Toronto Argonauts", "Hamilton Tiger-Cats", "Winnipeg Blue Bombers", "Saskatchewan Roughriders",
         "Edmonton Eskimos", "Calgary Stampeders", "BC Lions", "Montreal Concordes" if 1982 <= y <= 1985 else "Montreal Alouettes"]
    if y >= 1994 and y <= 1995: c += ["Sacramento Gold Miners", "Las Vegas Posse", "Baltimore Stallions", "Shreveport Pirates", "Memphis Mad Dogs", "San Antonio Texans", "Birmingham Barracudas"]
    return c


def main():
    cache, y0, y1 = os.path.expanduser(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])
    os.makedirs(cache, exist_ok=True)
    titles = [f"{y} {c} season" for y in range(y0, y1 + 1) for c in clubs(y)]
    real, multi = [], set()
    for i in range(0, len(titles), 50):
        batch = titles[i:i + 50]
        url = "https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&titles=" + urllib.parse.quote("|".join(batch))
        q = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60))["query"]
        norm = {x["from"]: x["to"] for x in q.get("normalized", [])}
        red = {x["from"]: x["to"] for x in q.get("redirects", [])}
        ok = {p["title"] for p in q["pages"].values() if "missing" not in p}
        for t in batch:
            t1 = norm.get(t, t); t2 = red.get(t1, t1)
            if t2 in ok and t2 == t1: real.append(t)
            elif t2 in ok: multi.add(t2)
        time.sleep(2)
    open(f"{cache}/team_titles.txt", "w", encoding="utf-8").write("\n".join(real) + "\n")
    open(f"{cache}/multiyear_titles.txt", "w", encoding="utf-8").write("\n".join(sorted(multi)) + "\n")
    print(len(titles), "candidate titles;", len(real), "articles;", len(multi), "multi-season pages")


if __name__ == "__main__":
    if len(sys.argv) != 4: sys.exit(__doc__)
    main()

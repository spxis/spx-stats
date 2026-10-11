#!/usr/bin/env python3
"""NHL skater and goalie season summaries from the NHL's stats API (api.nhle.com/stats/rest/en), raw first.

  nhl_fetch.py <raw dir> [first_year [last_year]]

For each season, game type (2 regular, 3 playoffs) and kind (skater, goalie) it saves the league-wide answer, then,
for every team named in a multi-club row ("NJD,WPG"), the answer for that team alone, so a traded player's rows can be
split by club. Each answer is saved as compact JSON named <season>-<gt>-<kind>-<all|teamId>.json; a file that exists
is never fetched again. A few parallel requests, backing off on 429/5xx."""
import json, os, sys, time, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
BASE = "https://api.nhle.com/stats/rest/en"
UA = "spx-stats/0.1 (https://github.com/spxis/spx-stats)"
KINDS = {"skater": "skater/summary", "goalie": "goalie/summary"}

def get(url, tries=8):
    delay = 3
    for _ in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=90) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (429,) or e.code >= 500: time.sleep(delay); delay = min(delay * 2, 60); continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(delay); delay = min(delay * 2, 60)
    raise RuntimeError("giving up on " + url)

def fetch(raw, season, gt, kind, team=None):
    name = f"{season}-{gt}-{kind}-{team or 'all'}.json"
    p = os.path.join(raw, name)
    if os.path.exists(p):
        return json.load(open(p))
    cx = f"seasonId={season} and gameTypeId={gt}" + (f" and teamId={team}" if team else "")
    d = get(f"{BASE}/{KINDS[kind]}?limit=-1&cayenneExp=" + urllib.parse.quote(cx))
    d = {"data": d.get("data", [])}
    with open(p + ".tmp", "w") as f: f.write(json.dumps(d, separators=(",", ":")))
    os.rename(p + ".tmp", p)
    return d

def main(raw, y0, y1):
    os.makedirs(raw, exist_ok=True)
    tp = os.path.join(raw, "teams.json")
    if not os.path.exists(tp):
        with open(tp, "w") as f: json.dump(get(BASE + "/team")["data"], f)
    teams = json.load(open(tp))
    by_code = {}
    for t in teams: by_code.setdefault(t["triCode"], []).append(t["id"])
    jobs = [(f"{y}{y+1}", gt, k) for y in range(y0, y1 + 1) for gt in (2, 3) for k in KINDS]
    def one(j):
        season, gt, kind = j
        d = fetch(raw, season, gt, kind)
        multi = {c for r in d["data"] for c in (r.get("teamAbbrevs") or "").split(",") if "," in (r.get("teamAbbrevs") or "")}
        for c in sorted(multi):
            for tid in by_code.get(c, []):
                fetch(raw, season, gt, kind, tid)
        return j, len(d["data"]), len(multi)
    with ThreadPoolExecutor(6) as ex:
        for j, n, m in ex.map(one, jobs):
            print(*j, n, "rows", m, "multi-club teams", flush=True)

if __name__ == "__main__":
    a = sys.argv
    main(a[1], int(a[2]) if len(a) > 2 else 1917, int(a[3]) if len(a) > 3 else 2025)

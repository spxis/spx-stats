#!/usr/bin/env python3
"""Fetch season-level team statistics into a raw folder (outside the repository), with a sha256 manifest.

  fetch.py --source nhl      api.nhle.com/stats/rest/en/team/summary and /penalties, regular season, one answer per season and endpoint
                             (power play and penalty kill percentages, penalty minutes, shots). Source: the NHL, credited "NHL".
  fetch.py --source nflverse stats_team_week_<year>.csv from the nflverse-data releases (CC BY 4.0), one file per season.

Seasons come from core.season of the database named by the PG* variables. One request per 1.5 seconds, identified User-Agent.
A file already saved is not fetched again. Raw answers are kept as served.

Usage: fetch.py --source nhl|nflverse [--raw DIR]
"""
import argparse, datetime, hashlib, json, os, subprocess, sys, time, urllib.error, urllib.request

UA = "spx-stats/0.1 (https://github.com/spxis/spx-stats; john@spxis.com)"
GAP = 1.5

def seasons(league):
    p = subprocess.run(["psql", "-X", "-At", "-c", f"select start_year from core.season where league_code = '{league}' order by 1"], capture_output=True, text=True)
    if p.returncode: sys.exit(p.stderr)
    return [int(x) for x in p.stdout.split()]

def get(url):
    delay = 10
    for _ in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=90) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            if e.code == 429 or e.code >= 500: time.sleep(delay); delay = min(delay * 2, 300); continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(delay); delay = min(delay * 2, 300)
    raise RuntimeError("giving up on " + url)

def jobs(source):
    if source == "nhl":
        for y in seasons("nhl"):
            sid = f"{y}{y + 1}"
            for ep in ("summary", "penalties"):
                yield f"{ep}_{sid}.json", f"https://api.nhle.com/stats/rest/en/team/{ep}?cayenneExp=seasonId%3D{sid}%20and%20gameTypeId%3D2"
    else:
        for y in seasons("nfl"):
            yield f"stats_team_week_{y}.csv", f"https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_{y}.csv"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True, choices=["nhl", "nflverse"])
    ap.add_argument("--raw")
    a = ap.parse_args()
    raw = a.raw or os.path.expanduser(f"~/spx-raw/team_stats_{a.source}/{datetime.date.today().isoformat()}")
    os.makedirs(raw, exist_ok=True)
    last = 0.0
    for name, url in jobs(a.source):
        path = f"{raw}/{name}"
        if os.path.exists(path): continue
        time.sleep(max(0, GAP - (time.time() - last))); last = time.time()
        body = get(url)
        if body is None: print(name, "404", flush=True); continue
        open(path, "wb").write(body)
        with open(raw + "/manifest.jsonl", "a") as m:
            m.write(json.dumps({"file": name, "url": url, "sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body),
                                "fetched": datetime.datetime.now(datetime.UTC).isoformat(timespec="seconds")}) + "\n")
        print(name, len(body), flush=True)

if __name__ == "__main__":
    main()

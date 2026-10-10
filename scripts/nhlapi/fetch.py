#!/usr/bin/env python3
"""Fetch NHL results and standings from the NHL's public web API into a raw cache.

Source: https://api-web.nhle.com/v1/ (results and standings are facts; the NHL is credited).
Per season: the standings on the last regular-season day (which also lists the season's
teams), then each team's season schedule (club-schedule-season). A team-season answer lists
games for both clubs, so loading de-duplicates by NHL game id. Every raw answer is cached
under CACHE (default raw/nhlapi) and never fetched twice, except for the
season in progress, whose files are refreshed once older than CURRENT_TTL.

Usage: fetch.py [--seasons 20012002,20112012 | --first N] [--cache DIR] [--log FILE]
Default order grows outward from SPX's best seasons: 2001-02, 2011-12, 2012-13, 2000-01,
2013-14, 1999-00, 2014-15, ... alternating back to 1917-18 and forward to now. 2004-05 has no season.
"""
import argparse, datetime, json, os, ssl, sys, time, urllib.error, urllib.request

BASE = "https://api-web.nhle.com/v1"
UA = "spx-stats/0.1 (https://github.com/spxis/spx-stats)"
GAP = 2.0                       # seconds between requests
CURRENT_TTL = 6 * 3600          # a season in progress is refetched after this
_last = [0.0]

def ctx():
    ca = os.environ.get("SSL_CERT_FILE") or os.environ.get("REQUESTS_CA_BUNDLE") or "/root/.ccr/ca-bundle.crt"
    return ssl.create_default_context(cafile=ca) if os.path.exists(ca) else ssl.create_default_context()
CTX = ctx()

def get(url):
    """One polite GET with backoff on 429/5xx. Returns (status, parsed json or None)."""
    delay = 5
    for attempt in range(8):
        wait = GAP - (time.time() - _last[0])
        if wait > 0: time.sleep(wait)
        _last[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=60, context=CTX) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 404: return 404, None
            if e.code == 429 or e.code >= 500:
                time.sleep(delay); delay = min(delay * 2, 300); continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError, json.JSONDecodeError):
            time.sleep(delay); delay = min(delay * 2, 300)
    raise RuntimeError("giving up on " + url)

def cached(path, url, ttl=None):
    if os.path.exists(path) and (ttl is None or time.time() - os.path.getmtime(path) < ttl):
        return json.load(open(path))
    status, data = get(url)
    if status == 404: data = {"_status": 404}
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(data, open(path + ".tmp", "w")); os.replace(path + ".tmp", path)
    return data

def season_order(ids):
    ids = sorted(ids); first = 20012002
    back = [s for s in ids if s < first][::-1]; fwd = [s for s in ids if s > first]
    # 2001-02, 2011-12 (complete it), 2012-13, 2000-01, 2013-14, 1999-00, ...
    out, f, b = [first], 0, 0
    if 20112012 in fwd:
        out.append(20112012); fwd.remove(20112012)
    while f < len(fwd) or b < len(back):
        if f < len(fwd): out.append(fwd[f]); f += 1
        if b < len(back): out.append(back[b]); b += 1
    return out

def log(fh, msg):
    line = f"{datetime.datetime.now():%Y-%m-%d %H:%M:%S} {msg}"
    print(line, flush=True)
    if fh: fh.write(line + "\n"); fh.flush()

def fetch_season(sea, info, cache, fh):
    current = info["standingsEnd"] >= str(datetime.date.today() - datetime.timedelta(days=1)) or sea == CURRENT
    ttl = CURRENT_TTL if current else None
    end = min(info["standingsEnd"], str(datetime.date.today()))
    st = cached(f"{cache}/standings/{sea}_{end}.json", f"{BASE}/standings/{end}", ttl)
    teams = [r["teamAbbrev"]["default"] for r in st.get("standings", [])]
    done, games, n_req = set(), {}, 0
    queue = list(dict.fromkeys(teams))
    while queue:
        t = queue.pop(0)
        if t in done: continue
        done.add(t)
        d = cached(f"{cache}/club/{sea}/{t}.json", f"{BASE}/club-schedule-season/{t}/{sea}", ttl)
        for g in d.get("games", []):
            if g.get("gameType") not in (2, 3): continue
            games[g["id"]] = 1
            for side in ("awayTeam", "homeTeam"):                  # a club missing from the standings
                ab = g[side].get("abbrev")
                if ab and ab not in done and ab not in queue: queue.append(ab)
    log(fh, f"fetched {sea} teams={len(done)} games={len(games)} standings_rows={len(teams)} as_of={end}")

CURRENT = None
def main():
    global CURRENT
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons"); ap.add_argument("--first", type=int)
    ap.add_argument("--cache", default="raw/nhlapi")
    ap.add_argument("--log", default="raw/nhlapi/progress.log")
    a = ap.parse_args()
    fh = open(a.log, "a")
    ss = cached(f"{a.cache}/standings-season.json", f"{BASE}/standings-season", 3600 * 6)
    info = {s["id"]: s for s in ss["seasons"]}
    CURRENT = max(info)
    order = [int(x) for x in a.seasons.split(",")] if a.seasons else season_order(info)
    order = [s for s in order if s in info and s != 20042005]
    if a.first: order = order[:a.first]
    for sea in order:
        try: fetch_season(sea, info[sea], a.cache, fh)
        except Exception as e: log(fh, f"FAILED {sea}: {e}")

if __name__ == "__main__":
    main()

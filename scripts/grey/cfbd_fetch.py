#!/usr/bin/env python3
"""CollegeFootballData.com fetcher with a monthly request budget (the free key allows 1,000 requests a calendar month).

    python3 -I scripts/grey/cfbd_fetch.py get <endpoint> [name=value ...]      one request, the raw answer saved first
    python3 -I scripts/grey/cfbd_fetch.py run <plan> [--limit N]               every request of a plan that is not saved yet, one at a time
    python3 -I scripts/grey/cfbd_fetch.py plans                                the plans with their request counts
    python3 -I scripts/grey/cfbd_fetch.py budget                               requests used this month, from the request log

Every request goes through scripts/grey/common.py (registry guard, shared limiter, no retry after 401, 403 or 404) and is written to the request log
(<raw root>/request-log.tsv: time, endpoint, params, status, bytes, rate-limit headers). The fetcher stops at MONTH_STOP requests in the log for the
calendar month (plus BEFORE_LOG, requests made before the log existed), waits at least GAP seconds between requests, stops for the day on a 429 and on any
401, 403 or 404. A file that is already saved is never fetched again and never overwritten. The key comes from CFBD_API_KEY or the macOS keychain item
"spx-stats CFBD_API_KEY" and is never printed, logged or saved. Raw files: <raw root>/<day>/<endpoint>/<name=value&...>.json, byte for byte.
"""
import json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import common as C

SOURCE = "cfbd"
API = "https://api.collegefootballdata.com"
RAW_ROOT = os.path.expanduser(os.environ.get("CFBD_RAW_ROOT", "~/Projects/backups/spx-stats/raw/cfbd"))
DAY = os.environ.get("CFBD_RAW_DAY", "2026-10-28")
LOG = os.path.join(RAW_ROOT, "request-log.tsv")
GAP = 1.5
SPARE = 50  # the server says how many calls are left (x-calllimit-remaining); never go below this
MONTH_STOP = int(os.environ.get("CFBD_MONTH_STOP", "950"))
BEFORE_LOG = int(os.environ.get("CFBD_BEFORE_LOG", "1"))  # the coordinator's test request of 2026-10-28
FIRST_YEAR, LAST_YEAR = 1869, 2025


class Stop(RuntimeError):
    """Stop the run: the month's budget is used, or the site answered 429."""


def api_key():
    k = os.environ.get("CFBD_API_KEY")
    if k:
        return k
    p = subprocess.run(["security", "find-generic-password", "-s", "spx-stats CFBD_API_KEY", "-w"], capture_output=True, text=True)
    if p.returncode or not p.stdout.strip():
        raise SystemExit("NEED: CFBD_API_KEY in the environment or the keychain item 'spx-stats CFBD_API_KEY'")
    return p.stdout.strip()


# ---------------------------------------------------------------------- the request log

def month_of(stamp):
    return stamp[:7]


def used_this_month(now=None):
    """Keyed requests in the log for the current UTC month, plus BEFORE_LOG when the month is the one the log began in."""
    month = month_of(now or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    n = 0
    try:
        with open(LOG, encoding="utf-8") as f:
            for line in f:
                if line.startswith("#") or line.startswith("time\t"):
                    continue
                cols = line.rstrip("\n").split("\t")
                if len(cols) >= 4 and month_of(cols[0]) == month:
                    n += 1
    except OSError:
        pass
    return n + (BEFORE_LOG if month == "2026-10" else 0)


def log_request(endpoint, params, status, nbytes, hdr):
    new = not os.path.exists(LOG)
    os.makedirs(RAW_ROOT, exist_ok=True)
    with open(LOG, "a", encoding="utf-8") as f:
        if new:
            f.write("time\tendpoint\tparams\tstatus\tbytes\theaders\n")
        keep = {k.lower(): v for k, v in (hdr or {}).items() if "limit" in k.lower() or "remain" in k.lower() or "retry" in k.lower()}
        f.write("\t".join([time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), endpoint, params, str(status), str(nbytes), json.dumps(keep, sort_keys=True)]) + "\n")


# ---------------------------------------------------------------------- one request

class Client:
    def __init__(self, limiter=None, sleep=time.sleep, network=None):
        self.key = None
        self.left = None
        self.last = 0.0
        self.sleep = sleep
        self.network = network or C._urlopen  # replaceable for tests
        self.fetcher = C.Fetcher(SOURCE, "manual", limiter=limiter, opener=self._open)
        self.current = ("", "")

    def _open(self, req):
        """The one place a request leaves the machine: budget check, spacing, the call, the log line, the 429 stop."""
        if self.left is not None and self.left <= SPARE:
            raise Stop("the API reports %d calls left this month: the %d kept spare are not touched" % (self.left, SPARE))
        if used_this_month() >= MONTH_STOP:
            raise Stop("%d requests used this month: the budget is spent" % used_this_month())
        wait = self.last + GAP - time.time()
        if wait > 0:
            self.sleep(wait)
        status, hdr, body = self.network(req)
        self.last = time.time()
        log_request(self.current[0], self.current[1], status, len(body), hdr)
        if status == 429:
            raise Stop("429 from the API: stopped for the day")
        left = {k.lower(): v for k, v in hdr.items()}.get("x-calllimit-remaining", "")
        if left.isdigit():
            self.left = int(left)  # the answer of this request is kept; the next request checks it
        return status, hdr, body

    def get(self, endpoint, params):
        """-> the saved path, or None when the file was already there (no request). Raw bytes, create-only."""
        qs = "&".join("%s=%s" % (k, v) for k, v in sorted(params.items()))
        path = os.path.join(RAW_ROOT, DAY, endpoint.strip("/").replace("/", "_"), (qs or "all") + ".json")
        if os.path.exists(path):
            return None
        if self.key is None:
            self.key = api_key()
        self.current = ("/" + endpoint.strip("/"), qs)
        url = "%s/%s%s" % (API, endpoint.strip("/"), "?" + qs if qs else "")
        status, body = self.fetcher.get(url, {"Authorization": "Bearer " + self.key, "Accept": "application/json"})
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "xb") as f:
            f.write(body)
        meta = os.path.join(RAW_ROOT, DAY, "fetched.json")
        try:
            with open(meta, encoding="utf-8") as f:
                index = json.load(f)
        except (OSError, ValueError):
            index = {}
        import hashlib
        index[os.path.relpath(path, os.path.join(RAW_ROOT, DAY))] = {"url": url, "sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body),
                                                                    "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
        with open(meta, "w", encoding="utf-8") as f:
            json.dump(index, f, indent=1, sort_keys=True)
        return path


# ---------------------------------------------------------------------- the plans

def years(a=FIRST_YEAR, b=LAST_YEAR):
    return range(a, b + 1)


def _y(endpoint, a, b, **extra):
    return [(endpoint, dict(year=y, **extra)) for y in years(a, b)]


def boxscore_requests():
    """Team box scores (/games/teams): every regular-season week of each season 2004-2025 (the weeks the games file lists) and the postseason's week 1; newest season first."""
    out = []
    for y in range(LAST_YEAR, 2003, -1):
        f = os.path.join(RAW_ROOT, DAY, "games", "seasonType=both&year=%d.json" % y)
        weeks = sorted({g["week"] for g in json.load(open(f, encoding="utf-8")) if g.get("seasonType") == "regular" and g.get("week")}) if os.path.exists(f) else []
        out += [("games/teams", {"year": y, "week": w}) for w in weeks]
        out.append(("games/teams", {"year": y, "week": 1, "seasonType": "postseason"}))
    return out


def boxscore_post_requests():
    """The postseason weeks after the first that the games file lists (the lower divisions' playoffs, 2020 and 2023 and 2025)."""
    out = []
    for y in range(LAST_YEAR, 2003, -1):
        f = os.path.join(RAW_ROOT, DAY, "games", "seasonType=both&year=%d.json" % y)
        weeks = sorted({g["week"] for g in json.load(open(f, encoding="utf-8")) if g.get("seasonType") == "postseason" and g.get("week") not in (None, 1)}) if os.path.exists(f) else []
        out += [("games/teams", {"year": y, "week": w, "seasonType": "postseason"}) for w in weeks]
    return out


PLANS = {
    "lines": lambda: [("lines", {"year": y}) for y in range(LAST_YEAR, 2011, -1)],
    "talent": lambda: [("talent", {"year": y}) for y in range(LAST_YEAR, 2014, -1)],
    "srs": lambda: [("ratings/srs", {"year": y}) for y in range(LAST_YEAR, FIRST_YEAR - 1, -1)],
    "boxscores": boxscore_requests,
    "boxscores_post": boxscore_post_requests,
    "teamstats_fcs": lambda: _y("stats/season", 2004, LAST_YEAR, classification="fcs"),
    "reference": lambda: [("conferences", {}), ("teams", {}), ("venues", {}),
                          ("conferences/affiliations", {"minYear": FIRST_YEAR, "maxYear": 2026}),
                          ("coaches", {"minYear": FIRST_YEAR, "maxYear": 2026}), ("draft/picks", {})],
    "games": lambda: _y("games", FIRST_YEAR, LAST_YEAR + 1, seasonType="both"),
    "records": lambda: _y("records", FIRST_YEAR, LAST_YEAR),
    "rankings": lambda: _y("rankings", 1936, LAST_YEAR),
    "teamstats": lambda: _y("stats/season", 2004, LAST_YEAR),
    "rosters": lambda: _y("roster", 2004, LAST_YEAR + 1),
    "playerstats": lambda: _y("stats/player/season", 2004, LAST_YEAR),
}


def pending(plan):
    out = []
    for endpoint, params in PLANS[plan]():
        qs = "&".join("%s=%s" % (k, v) for k, v in sorted(params.items()))
        if not os.path.exists(os.path.join(RAW_ROOT, DAY, endpoint.strip("/").replace("/", "_"), (qs or "all") + ".json")):
            out.append((endpoint, params))
    return out


def run(plan, limit=None, client=None):
    cl = client or Client()
    done = 0
    for endpoint, params in pending(plan):
        if limit is not None and done >= limit:
            break
        try:
            path = cl.get(endpoint, params)
        except Stop as e:
            print("STOP:", e)
            return 3
        except C.Blocked as e:
            print("BLOCKED:", e)
            return 4
        done += 1
        print("saved", os.path.relpath(path, RAW_ROOT), "(%d this month)" % used_this_month())
    print("%s: %d fetched, %d still pending" % (plan, done, len(pending(plan))))
    return 0


def main(argv):
    if not argv:
        print(__doc__)
        return 2
    cmd = argv[0]
    if cmd == "plans":
        for n in PLANS:
            print("%-12s %4d requests" % (n, len(PLANS[n]())))
        return 0
    if cmd == "budget":
        print("%d requests this month (stop at %d)" % (used_this_month(), MONTH_STOP))
        return 0
    if cmd == "get":
        params = dict(a.split("=", 1) for a in argv[2:])
        try:
            path = Client().get(argv[1], params)
        except (Stop, C.Blocked) as e:
            print("STOP:", e)
            return 3
        print("saved" if path else "already saved", path or "")
        return 0
    if cmd == "run":
        limit = int(argv[argv.index("--limit") + 1]) if "--limit" in argv else None
        return run(argv[1], limit)
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

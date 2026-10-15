#!/usr/bin/env python3
"""Download nflverse's player statistics (CC BY 4.0, release "stats_player" of the nflverse-data repository on GitHub), one file per season and kind.

  nflverse_stats_fetch.py <raw dir> [first season [last season]]     default 1999 to 2025 (2026 is still being played)

Saves <raw dir>/stats_player_week_<season>.csv (one row per player and game week, with the team of that week), stats_player_reg_<season>.csv and
stats_player_post_<season>.csv (the season totals of the regular season and the playoffs, one row per player with only the LAST team, "recent_team") and
prints each file's sha256 and size. A file that exists is not fetched again. One request a second, with the project's User-Agent; a file the release does
not hold (404) is skipped. The weekly files are what give a traded player one line per club; the season files are kept to check the sums.
Rows are kept exactly as published except for the headshot_url column (NFL.com image links), which is dropped as the file is saved, like
scripts/rosters/nflverse_fetch.py does for the rosters. nflverse's player id (gsis_id, "00-0033873") is the key; no other site's id is in these files."""
import csv, hashlib, io, os, ssl, sys, time, urllib.error, urllib.request

UA = "spx-stats/0.1 (https://github.com/spxis/spx-stats)"
BASE = "https://" + "git" + "hub.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_%s_%d.csv"
ca = os.environ.get("SSL_CERT_FILE") or "/root/.ccr/ca-bundle.crt"
CTX = ssl.create_default_context(cafile=ca) if os.path.exists(ca) else ssl.create_default_context()
DROP = {"headshot_url"}
KINDS = ("week", "reg", "post")

def strip(b):
    rows = list(csv.reader(io.StringIO(b.decode("utf-8"), newline="")))
    keep = [i for i, h in enumerate(rows[0]) if h not in DROP]
    out = io.StringIO(newline="")
    w = csv.writer(out, lineterminator="\n")
    for r in rows: w.writerow([r[i] for i in keep])
    return out.getvalue().encode("utf-8")

def get(url, tries=6):
    delay = 10
    for _ in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=180, context=CTX) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            if e.code == 429 or e.code >= 500: time.sleep(delay); delay = min(delay * 2, 120); continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(delay); delay = min(delay * 2, 120)
    raise RuntimeError("giving up on " + url)

def main(raw, first, last):
    os.makedirs(raw, exist_ok=True)
    for y in range(first, last + 1):
        for k in KINDS:
            p = f"{raw}/stats_player_{k}_{y}.csv"
            if not os.path.exists(p):
                time.sleep(1)
                b = get(BASE % (k, y))
                if b is None:
                    print(y, k, "not in the release", flush=True); continue
                with open(p + ".part", "wb") as f: f.write(strip(b))
                os.replace(p + ".part", p)
            b = open(p, "rb").read()
            print(y, k, len(b), hashlib.sha256(b).hexdigest(), flush=True)

if __name__ == "__main__":
    a = sys.argv[1:]
    if not a: sys.exit(__doc__)
    main(a[0].rstrip("/"), int(a[1]) if len(a) > 1 else 1999, int(a[2]) if len(a) > 2 else 2025)

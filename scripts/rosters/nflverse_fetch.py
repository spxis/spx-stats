#!/usr/bin/env python3
"""Download nflverse's season rosters (CC BY 4.0, github.com/nflverse/nflverse-data, release "rosters"), one file per season.

  nflverse_fetch.py <raw dir> [first season [last season]]     default 1920 to the newest season the release holds

Saves <raw dir>/roster_<season>.csv and prints its sha256 and size. A file that exists is not fetched again. One request a second,
with the project's User-Agent; a season the release does not hold (404) is skipped.
The published files carry other sites' player ids (ESPN, Pro Football Reference, PFF, Yahoo, Sleeper and more) and NFL.com headshot links.
John's rule: Pro Football Reference and ESPN ids are not stored anywhere. So the columns in DROP are removed from every file as it is saved,
before it is written; every other column and every row is kept exactly as published (the nflverse/gsis id stays)."""
import csv, hashlib, io, os, ssl, sys, time, urllib.error, urllib.request

UA = "spx-stats/0.1 (https://github.com/spxis/spx-stats)"
BASE = "https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_%d.csv"
ca = os.environ.get("SSL_CERT_FILE") or "/root/.ccr/ca-bundle.crt"
CTX = ssl.create_default_context(cafile=ca) if os.path.exists(ca) else ssl.create_default_context()

DROP = {"espn_id", "sportradar_id", "yahoo_id", "rotowire_id", "pff_id", "pfr_id", "fantasy_data_id", "sleeper_id", "headshot_url", "esb_id", "gsis_it_id", "smart_id"}

def strip(b):
    """The file without the columns in DROP; all other cells untouched (read and written as text, quoting as the csv module needs)."""
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
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=120, context=CTX) as r:
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
        p = f"{raw}/roster_{y}.csv"
        if not os.path.exists(p):
            time.sleep(1)
            b = get(BASE % y)
            if b is None:
                print(y, "not in the release"); continue
            with open(p, "wb") as f: f.write(strip(b))
        b = open(p, "rb").read()
        print(y, len(b), hashlib.sha256(b).hexdigest(), flush=True)

if __name__ == "__main__":
    a = sys.argv[1:]
    if not a: sys.exit(__doc__)
    main(a[0], int(a[1]) if len(a) > 1 else 1920, int(a[2]) if len(a) > 2 else 2030)

#!/usr/bin/env python3
"""Fetch the English Wikipedia articles that name the major-league champions before the modern World Series (1871-1902), raw and unedited.

  fetch.py RAW_DIR        RAW_DIR must be new or hold only files this script wrote; files already there are not fetched again

Saves, as served by action=raw (CC BY-SA 4.0), one request every 2.5 s with an identified User-Agent:
  list.wikitext            "List of pre-World Series baseball champions" (1871-75 National Association, the 1884-1900 series and their scores)
  s<year>.wikitext         "<year> Major League Baseball season", 1876-1902 and 1914-15 (the infobox names each league's pennant winner and the postseason series;
                           1914-15 only for the Federal League's pennant winner)
Then parse.py reads them. Nothing is stored in a database here: the coordinating session archives RAW_DIR (scripts/archive_raw.py) before any load.
Never used: Baseball-Reference. English Wikipedia only.
"""
import os, sys, time, urllib.error, urllib.parse, urllib.request

UA = "spx-stats/0.1 (https://github.com/spxis/spx-stats)"
GAP = 2.5
TITLES = [("list.wikitext", "List of pre-World Series baseball champions")] + [(f"s{y}.wikitext", f"{y} Major League Baseball season") for y in list(range(1876, 1903)) + [1914, 1915]]


def get(title):
    url = "https://en.wikipedia.org/w/index.php?title=" + urllib.parse.quote(title.replace(" ", "_")) + "&action=raw"
    delay = 20
    for _ in range(8):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as r:
                return r.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            if e.code in (429,) or e.code >= 500: time.sleep(delay); delay = min(delay * 2, 300); continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(delay); delay = min(delay * 2, 300)
    raise RuntimeError("giving up on " + title)


def main(raw):
    os.makedirs(raw, exist_ok=True)
    last = 0.0
    for name, title in TITLES:
        path = os.path.join(raw, name)
        if os.path.exists(path): continue
        w = GAP - (time.time() - last)
        if w > 0: time.sleep(w)
        last = time.time()
        t = get(title)
        if t is None: print("MISSING", title); continue
        if t.lstrip().lower().startswith("#redirect"): print("REDIRECT", title, t[:80].replace("\n", " "))
        open(path, "w", encoding="utf-8").write(t)
        print(name, len(t), flush=True)


if __name__ == "__main__":
    if len(sys.argv) != 2: sys.exit(__doc__)
    main(os.path.expanduser(sys.argv[1]))

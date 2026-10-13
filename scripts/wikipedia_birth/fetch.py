#!/usr/bin/env python3
"""Fetch the wikitext of English Wikipedia biographies (CC BY-SA 4.0), raw first, to read the infobox birth place.

  fetch.py <titles file, one article title a line> <raw dir>

50 titles a call (action=query, prop=revisions, redirects followed), one request at a time, at least 2 seconds apart, with the
project's User-Agent. Every answer is saved as compact JSON named batch-NNN.json in <raw dir>; a file that exists is never fetched
again, so the run can be stopped and resumed. Three failed requests in a row (429, 5xx or no answer) stop the run.
Usage then: load.py <raw dir> (parse the infobox, load legacy_wikipedia_birth.infobox, archive the files)."""
import json, os, ssl, sys, time, urllib.error, urllib.parse, urllib.request
UA = "spx-stats/0.1 (https://github.com/spxis/spx-stats)"
API = "https://en.wikipedia.org/w/api.php"
GAP = 2.0
_last = [0.0]

def get(params):
    fails = 0
    delay = 10
    while True:
        w = GAP - (time.time() - _last[0])
        if w > 0: time.sleep(w)
        _last[0] = time.time()
        try:
            req = urllib.request.Request(API + "?" + urllib.parse.urlencode(params), headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=90, context=ssl.create_default_context()) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if not (e.code == 429 or e.code >= 500): raise
            ra = e.headers.get("Retry-After")
            wait = int(ra) + 3 if ra and ra.isdigit() else delay
        except (urllib.error.URLError, TimeoutError, ConnectionError, json.JSONDecodeError):
            wait = delay
        fails += 1
        if fails >= 3: raise SystemExit("stopping: three failed requests in a row")
        time.sleep(wait); delay = min(delay * 2, 120)

def main(titles_file, raw):
    titles = [t.strip() for t in open(titles_file, encoding="utf-8") if t.strip()]
    os.makedirs(raw, exist_ok=True)
    n = 0
    for i in range(0, len(titles), 50):
        b = titles[i:i + 50]
        p = f"{raw}/batch-{i // 50 + 1:03d}.json"
        if os.path.exists(p): continue
        d = get({"action": "query", "format": "json", "formatversion": "2", "redirects": "1", "prop": "revisions",
                 "rvprop": "ids|content", "rvslots": "main", "titles": "|".join(b)})
        if "error" in d: raise SystemExit(json.dumps(d["error"])[:300])
        with open(p + ".tmp", "w", encoding="utf-8") as f:
            f.write(json.dumps({"requested": b, "query": d.get("query", {})}, ensure_ascii=False, separators=(",", ":")))
        os.replace(p + ".tmp", p); n += 1
        print(p, len(b), flush=True)
    print("requests made:", n)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

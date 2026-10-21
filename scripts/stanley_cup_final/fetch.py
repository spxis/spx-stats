#!/usr/bin/env python3
"""Fetch the "YEAR Stanley Cup Final" articles (1915 to the latest final) from English Wikipedia (CC BY-SA 4.0).
One request at a time, at least 2.5 s apart, an identified User-Agent, the MediaWiki API (wikitext and revision id in the same answer).
Files already in the folder are never fetched again. No NHL API request is made.
Usage: fetch.py <raw dir> [FIRST_YEAR [LAST_YEAR]]   e.g. ~/Projects/backups/spx-stats/raw/wikipedia_stanley_cup_final/2026-10-20
Writes <title with underscores>.wikitext and fetched.json (title -> url, revision id, timestamp, day fetched)."""
import datetime, json, os, ssl, sys, time, urllib.error, urllib.parse, urllib.request

UA = "spx-stats/0.1 (https://github.com/spxis/spx-stats; john@johnmorris.ca)"
CTX = ssl.create_default_context()
_last = [0.0]


def get(url):
    delay = 10
    for _ in range(6):
        wait = 2.5 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60, context=CTX) as r:
                return r.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code == 429 or e.code >= 500:
                time.sleep(delay)
                delay = min(delay * 2, 300)
                continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(delay)
            delay = min(delay * 2, 300)
    raise RuntimeError("giving up on " + url)


def page(title):
    q = urllib.parse.urlencode({"action": "query", "prop": "revisions", "rvprop": "ids|timestamp|content", "rvslots": "main", "format": "json",
                                "formatversion": "2", "titles": title})
    body = get("https://en.wikipedia.org/w/api.php?" + q)
    if body is None:
        return None
    p = json.loads(body)["query"]["pages"][0]
    if p.get("missing") or not p.get("revisions"):
        return None
    rv = p["revisions"][0]
    return rv["slots"]["main"]["content"], {"revid": rv["revid"], "timestamp": rv["timestamp"]}


def main():
    out = os.path.expanduser(sys.argv[1])
    first = int(sys.argv[2]) if len(sys.argv) > 2 else 1915
    last = int(sys.argv[3]) if len(sys.argv) > 3 else datetime.date.today().year
    os.makedirs(out, exist_ok=True)
    log_path = os.path.join(out, "fetched.json")
    log = json.load(open(log_path)) if os.path.exists(log_path) else {}
    titles = [f"{y} Stanley Cup Final" for y in range(first, last + 1)]
    for title in titles:
        name = title.replace(" ", "_")
        path = os.path.join(out, name + ".wikitext")
        if os.path.exists(path):
            continue
        got = page(title)
        if got is None:
            print("404", title, flush=True)
            continue
        text, rev = got
        open(path, "w", encoding="utf-8").write(text)
        log[title] = {"url": "https://en.wikipedia.org/wiki/" + name, "fetched": datetime.date.today().isoformat(), **rev}
        json.dump(log, open(log_path, "w"), indent=1)
        print("ok", title, len(text), flush=True)


if __name__ == "__main__":
    main()

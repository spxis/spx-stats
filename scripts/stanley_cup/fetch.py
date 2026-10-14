#!/usr/bin/env python3
"""Fetch the Stanley Cup champions list (and the three inter-league finals of 1915-1917) from English Wikipedia (CC BY-SA 4.0).
One request at a time, at least 2.5 s apart, an identified User-Agent, action=raw. Files already in the folder are never fetched again.
Usage: fetch.py <raw dir>     e.g. ~/Projects/backups/spx-stats/raw/wikipedia_stanley_cup/2026-10-14
Writes <title with underscores>.wikitext and a fetched.json (title, url, revision id, day). No NHL API request is made."""
import json, os, re, ssl, sys, time, urllib.error, urllib.parse, urllib.request, datetime

UA = "spx-stats/0.1 (https://github.com/spxis/spx-stats; john@spxis.com)"
TITLES = ["List of Stanley Cup champions", "1915 Stanley Cup Final", "1916 Stanley Cup Final", "1917 Stanley Cup Final"]
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


def main():
    out = os.path.expanduser(sys.argv[1])
    os.makedirs(out, exist_ok=True)
    log_path = os.path.join(out, "fetched.json")
    log = json.load(open(log_path)) if os.path.exists(log_path) else {}
    for title in TITLES:
        name = title.replace(" ", "_")
        path = os.path.join(out, name + ".wikitext")
        if os.path.exists(path):
            continue
        text = get("https://en.wikipedia.org/w/index.php?title=" + urllib.parse.quote(name) + "&action=raw")
        if text is None:
            print("404", title)
            continue
        info = get("https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=ids|timestamp&format=json&titles=" + urllib.parse.quote(name))
        rev = None
        if info:
            pages = json.loads(info)["query"]["pages"]
            rv = next(iter(pages.values())).get("revisions", [{}])[0]
            rev = {"revid": rv.get("revid"), "timestamp": rv.get("timestamp")}
        open(path, "w", encoding="utf-8").write(text)
        log[title] = {"url": "https://en.wikipedia.org/wiki/" + name, "fetched": datetime.date.today().isoformat(), **(rev or {})}
        print(title, len(text), rev)
    json.dump(log, open(log_path, "w"), indent=1)


if __name__ == "__main__":
    main()

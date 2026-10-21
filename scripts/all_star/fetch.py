#!/usr/bin/env python3
"""Fetch the All-Star Game articles of English Wikipedia (CC BY-SA 4.0): the league's list article, then the article of every game the list links.
One request at a time, at least 2.5 s apart, an identified User-Agent, the MediaWiki API (wikitext and revision id in one answer). Files already in the
folder are never fetched again. No red source (NHL, MLB or NBA API, stats.nba.com) is read.
Usage: fetch.py <raw dir> [league ...]     e.g. ~/Projects/backups/spx-stats/raw/wikipedia_all_star/2026-10-20 nhl nba
Writes <title with underscores>.wikitext and fetched.json (title -> kind, league, url, revision id, timestamp, day fetched). The raw folder is never in the repository."""
import datetime, json, os, re, ssl, sys, time, urllib.error, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lists  # noqa: E402

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
                                "formatversion": "2", "redirects": "1", "titles": title})
    body = get("https://en.wikipedia.org/w/api.php?" + q)
    if body is None:
        return None
    p = json.loads(body)["query"]["pages"][0]
    if p.get("missing") or not p.get("revisions"):
        return None
    rv = p["revisions"][0]
    return rv["slots"]["main"]["content"], {"revid": rv["revid"], "timestamp": rv["timestamp"], "resolved": p["title"]}


def save(out, log, title, kind, league):
    name = re.sub(r"[/\\]", "_", title.replace(" ", "_"))
    path = os.path.join(out, name + ".wikitext")
    if os.path.exists(path):
        return open(path, encoding="utf-8").read()
    got = page(title)
    if got is None:
        print("404", title, flush=True)
        return None
    text, rev = got
    open(path, "w", encoding="utf-8").write(text)
    log[title] = {"kind": kind, "league": league, "url": "https://en.wikipedia.org/wiki/" + name, "fetched": datetime.date.today().isoformat(), **rev}
    json.dump(log, open(os.path.join(out, "fetched.json"), "w"), indent=1)
    print("ok", title, len(text), flush=True)
    return text


def main():
    out = os.path.expanduser(sys.argv[1])
    leagues = sys.argv[2:] or list(lists.SOURCES)
    os.makedirs(out, exist_ok=True)
    log_path = os.path.join(out, "fetched.json")
    log = json.load(open(log_path)) if os.path.exists(log_path) else {}
    for lg in leagues:
        for title in lists.SOURCES[lg]:
            text = save(out, log, title, "list", lg)
            if text is None:
                continue
            events, _ = lists.read_list(lg, text)
            for ev in events:
                if ev["article"]:
                    save(out, log, ev["article"], "game", lg)


if __name__ == "__main__":
    main()

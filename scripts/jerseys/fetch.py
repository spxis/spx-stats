#!/usr/bin/env python3
"""Fetch English Wikipedia retired-number lists (CC BY-SA 4.0) into a cache dir.

One request per 2.5 s, identified User-Agent, action=raw. Existing files are never
refetched. Redirects are followed. A 404 is recorded as an empty file so extract
knows the article is missing (CFL may not have a single list).

Usage: fetch.py [--cache DIR] [code ...]
"""
import argparse, json, os, re, ssl, sys, time, urllib.error, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from titles import TITLES

UA = "spx-stats/0.1 (https://github.com/spxis/spx-stats; jersey numbers)"
ca = os.environ.get("SSL_CERT_FILE") or "/root/.ccr/ca-bundle.crt"
CTX = ssl.create_default_context(cafile=ca) if os.path.exists(ca) else ssl.create_default_context()
_last = [0.0]


def wait():
    w = 2.5 - (time.time() - _last[0])
    if w > 0:
        time.sleep(w)
    _last[0] = time.time()


def get_raw(title):
    url = "https://en.wikipedia.org/w/index.php?title=" + urllib.parse.quote(title.replace(" ", "_")) + "&action=raw"
    delay = 10
    for _ in range(8):
        wait()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60, context=CTX) as r:
                return r.read().decode("utf-8"), r.geturl()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None, url
            if e.code in (429,) or e.code >= 500:
                time.sleep(delay)
                delay = min(delay * 2, 300)
                continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(delay)
            delay = min(delay * 2, 300)
    raise RuntimeError("giving up on " + title)


def get_revid(title):
    qs = urllib.parse.urlencode({
        "action": "query", "format": "json", "prop": "revisions", "rvprop": "ids",
        "rvslots": "main", "titles": title, "redirects": "1",
    })
    url = "https://en.wikipedia.org/w/api.php?" + qs
    delay = 10
    for _ in range(6):
        wait()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60, context=CTX) as r:
                data = json.loads(r.read().decode("utf-8"))
            pages = data.get("query", {}).get("pages", {})
            for p in pages.values():
                if "missing" in p:
                    return None
                revs = p.get("revisions") or []
                if revs:
                    return revs[0].get("revid")
            return None
        except urllib.error.HTTPError as e:
            if e.code in (429,) or e.code >= 500:
                time.sleep(delay)
                delay = min(delay * 2, 300)
                continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(delay)
            delay = min(delay * 2, 300)
    return None


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default="raw/wikipedia_jersey/cache")
    ap.add_argument("codes", nargs="*")
    a = ap.parse_args()
    os.makedirs(a.cache, exist_ok=True)
    for code in a.codes or TITLES:
        league, title = TITLES[code]
        dest = os.path.join(a.cache, code + ".wikitext")
        meta_path = os.path.join(a.cache, code + ".meta.json")
        if os.path.exists(dest):
            print("have", code)
            continue
        text, url = get_raw(title)
        if text is None:
            print("404", code, title)
            open(dest, "w", encoding="utf-8").write("")
            json.dump({"article_code": code, "league": league, "title": title, "url": url, "revision_id": None, "missing": True},
                      open(meta_path, "w", encoding="utf-8"), indent=2)
            continue
        m = re.match(r"#REDIRECT\s*\[\[([^\]#|]+)", text, re.I)
        while m:
            title = m.group(1).strip()
            text, url = get_raw(title)
            if text is None:
                break
            m = re.match(r"#REDIRECT\s*\[\[([^\]#|]+)", text, re.I)
        revid = get_revid(title)
        print(code, len(text or ""), "rev", revid)
        open(dest, "w", encoding="utf-8").write(text or "")
        json.dump({
            "article_code": code, "league": league, "title": title,
            "url": "https://en.wikipedia.org/wiki/" + title.replace(" ", "_"),
            "revision_id": revid, "missing": not text,
        }, open(meta_path, "w", encoding="utf-8"), indent=2)

#!/usr/bin/env python3
"""Fetch the wikitext of each award article from English Wikipedia (CC BY-SA 4.0) into a cache dir.
One request per 2.5 s, identified User-Agent, action=raw (the API endpoint rate-limits this host).
Usage: fetch.py [--cache DIR] [code ...]   Existing files are never refetched; redirects are followed."""
import argparse, os, re, ssl, sys, time, urllib.error, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from titles import TITLES
UA = "spx-stats/0.1 (https://github.com/spxis/spx-stats)"
ca = os.environ.get("SSL_CERT_FILE") or "/root/.ccr/ca-bundle.crt"
CTX = ssl.create_default_context(cafile=ca) if os.path.exists(ca) else ssl.create_default_context()
_last = [0.0]
def get(title):
    url = "https://en.wikipedia.org/w/index.php?title=" + urllib.parse.quote(title.replace(" ", "_")) + "&action=raw"
    delay = 10
    for _ in range(8):
        w = 2.5 - (time.time() - _last[0])
        if w > 0: time.sleep(w)
        _last[0] = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60, context=CTX) as r:
                return r.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            if e.code in (429,) or e.code >= 500: time.sleep(delay); delay = min(delay * 2, 300); continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(delay); delay = min(delay * 2, 300)
    raise RuntimeError("giving up on " + title)
if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--cache", default="raw/wikipedia_awards/cache"); ap.add_argument("codes", nargs="*")
    a = ap.parse_args(); os.makedirs(a.cache, exist_ok=True)
    for code in a.codes or TITLES:
        p = f"{a.cache}/{code}.wikitext"
        if os.path.exists(p): continue
        t = get(TITLES[code])
        if t is None: print("404", code, TITLES[code]); continue
        m = re.match(r"#REDIRECT\s*\[\[([^\]#|]+)", t, re.I)
        while m:
            t = get(m.group(1).strip()); m = re.match(r"#REDIRECT\s*\[\[([^\]#|]+)", t, re.I)
        print(code, len(t), t[:40].replace("\n", " "))
        open(p, "w", encoding="utf-8").write(t)

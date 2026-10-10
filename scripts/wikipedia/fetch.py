#!/usr/bin/env python3
"""Fetch CFL season, team-season, standings-template and Grey Cup wikitext from English Wikipedia
(CC BY-SA 4.0) into a dated raw cache. Raw wikitext is saved as served and never edited.
One request per 2.5 s, identified User-Agent, action=raw only (the API/REST endpoints rate-limit this host).

Usage: fetch.py [--cache DIR] [--stage seasons|templates|teams|greycups] [--from 1946 --to 2025]
Each stage reads what the earlier one saved. Existing files are never refetched.
"""
import argparse, os, re, ssl, sys, time, urllib.error, urllib.parse, urllib.request

UA = "spx-stats/0.1 (https://github.com/spxis/spx-stats)"
GAP = 2.5
_last = [0.0]
ca = os.environ.get("SSL_CERT_FILE") or "/root/.ccr/ca-bundle.crt"
CTX = ssl.create_default_context(cafile=ca) if os.path.exists(ca) else ssl.create_default_context()

def fname(title): return re.sub(r"[^A-Za-z0-9._-]+", "_", title) + ".wikitext"

def get(title):
    url = "https://en.wikipedia.org/w/index.php?title=" + urllib.parse.quote(title.replace(" ", "_")) + "&action=raw"
    delay = 10
    for _ in range(8):
        w = GAP - (time.time() - _last[0])
        if w > 0: time.sleep(w)
        _last[0] = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60, context=CTX) as r:
                return r.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            if e.code == 429 or e.code >= 500: time.sleep(delay); delay = min(delay * 2, 300); continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(delay); delay = min(delay * 2, 300)
    raise RuntimeError("giving up on " + title)

def save(cache, sub, title):
    p = f"{cache}/{sub}/{fname(title)}"
    if os.path.exists(p): return open(p, encoding="utf-8").read()
    t = get(title)
    open(p, "w", encoding="utf-8").write(t if t is not None else "#MISSING 404\n")
    print(sub, title, "MISSING" if t is None else len(t), flush=True)
    return t

def read(cache, sub, title):
    p = f"{cache}/{sub}/{fname(title)}"
    return open(p, encoding="utf-8").read() if os.path.exists(p) else ""

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default="raw/wikipedia/2026-10-10")
    ap.add_argument("--stage", required=True)
    ap.add_argument("--from", dest="y0", type=int, default=1946)
    ap.add_argument("--to", dest="y1", type=int, default=2025)
    a = ap.parse_args()
    for sub in ("season", "team", "template", "greycup"): os.makedirs(f"{a.cache}/{sub}", exist_ok=True)
    years = range(a.y0, a.y1 + 1)
    if a.stage == "seasons":
        for y in years: save(a.cache, "season", f"{y} CFL season")
    elif a.stage == "templates":
        for y in years:
            for t in sorted(set(re.findall(r"\{\{\s*(\d{4} CFL [^{}|]*?[Ss]tandings)\s*\}\}", read(a.cache, "season", f"{y} CFL season")))):
                save(a.cache, "template", "Template:" + t)
    elif a.stage == "teams":
        titles = set()
        for y in years:
            txt = read(a.cache, "season", f"{y} CFL season") + "".join(
                read(a.cache, "template", "Template:" + t) for t in set(re.findall(r"\{\{\s*(\d{4} CFL [^{}|]*?[Ss]tandings)\s*\}\}", read(a.cache, "season", f"{y} CFL season"))))
            titles |= {m.strip() for m in re.findall(r"\[\[(\d{4} [^\]|]+? season)", txt) if m.startswith(str(y) + " ") and "CFL season" not in m}
        for t in sorted(titles): save(a.cache, "team", t)
    elif a.stage == "greycups":
        titles = set()
        for y in years:
            titles |= set(re.findall(r"\[\[(\d+(?:st|nd|rd|th) Grey Cup)", read(a.cache, "season", f"{y} CFL season")))
        for t in sorted(titles, key=lambda s: int(re.match(r"\d+", s).group())): save(a.cache, "greycup", t)
if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Fetch league alignment from English Wikipedia (CC BY-SA 4.0): each season article is read only to name
the standings templates it transcludes; each template's wikitext (the division's teams) is kept exactly as served.
Output: raw/2026-10-10/<league>.jsonl, one line per season: {league, year, article, templates:[{title, wikitext}]}.
One request per 2.5 s, identified User-Agent, backoff on 429/5xx. Pages already in the cache are not fetched again."""
import json, os, re, ssl, sys, time, urllib.error, urllib.parse, urllib.request
UA = "spx-stats/0.1 (https://github.com/spxis/spx-stats)"
GAP = 2.5
ROOT = os.environ.get("ALIGNMENT_WORK", "/home/user/spxwork/alignment")
CACHE = ROOT + "/cache"
OUT = ROOT + "/raw/2026-10-10"
ca = os.environ.get("SSL_CERT_FILE") or "/root/.ccr/ca-bundle.crt"
CTX = ssl.create_default_context(cafile=ca) if os.path.exists(ca) else ssl.create_default_context()
_last = [0.0]
D = "–"

def get(title):
    url = "https://en.wikipedia.org/w/index.php?title=" + urllib.parse.quote(title.replace(" ", "_")) + "&action=raw"
    delay = 20
    for _ in range(10):
        w = GAP - (time.time() - _last[0])
        if w > 0: time.sleep(w)
        _last[0] = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60, context=CTX) as r:
                return r.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            if e.code == 429 or e.code >= 500:
                time.sleep(delay); delay = min(delay * 2, 600); continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(delay); delay = min(delay * 2, 600)
    raise RuntimeError("giving up on " + title)

def cached(title):
    os.makedirs(CACHE, exist_ok=True)
    p = CACHE + "/" + re.sub(r"[^A-Za-z0-9._-]+", "_", title) + ".wt"
    if os.path.exists(p):
        t = open(p, encoding="utf-8").read()
        return None if t.startswith("#MISSING 404") else t
    t = get(title)
    open(p, "w", encoding="utf-8").write(t if t is not None else "#MISSING 404\n")
    print(title, "MISSING" if t is None else len(t), flush=True)
    return t

def plan(league):
    if league == "mlb":
        for y in list(range(1969, 2002)) + [2003, 2007] + list(range(2011, 2026)):
            yield y, f"{y} Major League Baseball season", r"(\d{4} (?:AL|NL) (?:East|West|Central)[^{}|]*?)"
    elif league == "nfl":
        for y in list(range(1999, 2002)) + [2003, 2007] + list(range(2011, 2027)):
            yield y, f"{y} NFL season", r"(\d{4} (?:AFC|NFC) (?:East|West|North|South|Central)[^{}|]*?)"
    elif league == "nba":
        for y in [2001, 2007, 2010, 2011, 2012] + list(range(2013, 2026)):
            yield y, f"{y}{D}{str(y + 1)[-2:]} NBA season", r"(\d{4}" + D + r"\d{2} NBA [^{}|]*?[Ss]tandings)"

def run(league):
    os.makedirs(OUT, exist_ok=True)
    path = f"{OUT}/{league}.jsonl"
    done = set()
    if os.path.exists(path):
        done = {json.loads(l)["year"] for l in open(path, encoding="utf-8")}
    with open(path, "a", encoding="utf-8") as f:
        for y, article, rx in plan(league):
            if y in done: continue
            text = cached(article)
            if text is None:
                rec = {"league": league, "year": y, "article": article, "missing": True, "templates": []}
            else:
                titles = sorted(set(m.strip() for m in re.findall(r"\{\{\s*" + rx + r"\s*(?:\|[^{}]*)?\}\}", text)))
                tpls = []
                for t in titles:
                    w = cached("Template:" + t)
                    tpls.append({"title": t, "wikitext": w})
                rec = {"league": league, "year": y, "article": article, "templates": tpls}
            f.write(json.dumps(rec, ensure_ascii=False, separators=(",", ":")) + "\n"); f.flush()

if __name__ == "__main__":
    for lg in sys.argv[1:]: run(lg)

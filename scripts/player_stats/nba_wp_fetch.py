#!/usr/bin/env python3
"""Fetch the "Player statistics" section of each NBA club-season article from English Wikipedia (CC BY-SA 4.0), raw first.

  nba_wp_fetch.py <roster raw dir> <out dir> [limit]

<roster raw dir> is the folder scripts/rosters/wp_fetch.py filled (articles-NNN.json: season, club, article title, revision id). Each article is read
at exactly that revision (action=parse&oldid=...), so the statistics are the revision the roster was read from, and a row cites the article title and
revision id. Two requests an article: the section list (to find the "Player statistics" heading), then that section rendered as HTML, with its
sub-sections (Season / Regular season, Playoffs). Rendered HTML, not wikitext: the tables are drawn from many templates (sortname, Abbr, the
"NBA roster statistics start" header) and the rendered page is the one regular form of them all.

Saves <out dir>/statpages-NNN.json, 25 articles each: season, club, title, revid, the heading found (or none) and the section's HTML as served.
Nothing already fetched is fetched again, so a stopped run resumes. About one request a second (1.1 s), maxlag=5, the project's User-Agent;
429 and 5xx back off and retry. Prints the sha256 of every file written."""
import hashlib, json, os, re, ssl, sys, time, urllib.error, urllib.parse, urllib.request

UA = "spx-stats/0.1 (https://github.com/spxis/spx-stats)"
API = "https://en.wikipedia.org/w/api.php"
ca = os.environ.get("SSL_CERT_FILE") or "/root/.ccr/ca-bundle.crt"
CTX = ssl.create_default_context(cafile=ca) if os.path.exists(ca) else ssl.create_default_context()
GAP = 1.1
_last = [0.0]
HEADING = re.compile(r"player statistics|player stats|statistics|stats", re.I)

def api(**p):
    q = urllib.parse.urlencode({"format": "json", "formatversion": "2", "maxlag": "5", **p})
    delay = 10
    for _ in range(12):
        w = GAP - (time.time() - _last[0])
        if w > 0: time.sleep(w)
        _last[0] = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(API + "?" + q, headers={"User-Agent": UA}), timeout=120, context=CTX) as r:
                d = json.loads(r.read().decode("utf-8"))
            if "error" in d and d["error"].get("code") == "maxlag":
                time.sleep(delay); continue
            return d
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                ra = e.headers.get("Retry-After")
                time.sleep(int(ra) + 3 if ra and ra.isdigit() else delay); delay = min(delay * 2, 240); continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(delay); delay = min(delay * 2, 240)
    raise RuntimeError("giving up on " + q[:120])

def stat_section(sections):
    """The first section whose title is about statistics, preferring a level-2 heading named 'Player statistics'."""
    exact = [s for s in sections if re.fullmatch(r"player statistics|player stats", s["line"].strip(), re.I)]
    if exact: return exact[0]
    other = [s for s in sections if HEADING.fullmatch(re.sub(r"<[^>]+>", "", s["line"]).strip())]
    return other[0] if other else None

def fetch_one(a):
    rec = {"season": a["season"], "club": a["club"], "title": a["title"], "revid": a["revid"]}
    d = api(action="parse", oldid=str(a["revid"]), prop="sections")
    if "error" in d:
        rec["error"] = d["error"].get("code"); return rec
    s = stat_section(d["parse"].get("sections", []))
    if not s:
        rec["heading"] = None; return rec
    rec.update(heading=re.sub(r"<[^>]+>", "", s["line"]).strip(), section=s["index"], level=int(s["level"]))
    h = api(action="parse", oldid=str(a["revid"]), section=str(s["index"]), prop="text")
    if "error" in h:
        rec["error"] = h["error"].get("code"); return rec
    rec["html"] = h["parse"]["text"]
    return rec

def main(roster_raw, out, limit):
    os.makedirs(out, exist_ok=True)
    arts = []
    for f in sorted(os.listdir(roster_raw)):
        if f.startswith("articles-"):
            arts += [a for a in json.load(open(f"{roster_raw}/{f}", encoding="utf-8"))["articles"] if not a.get("missing") and a.get("revid")]
    arts.sort(key=lambda a: (a["season"], a["club"]))
    done = set()
    n = 0
    for f in sorted(os.listdir(out)):
        if f.startswith("statpages-"):
            n = max(n, int(f[10:13]))
            done |= {(r["season"], r["club"]) for r in json.load(open(f"{out}/{f}", encoding="utf-8"))["articles"]}
    todo = [a for a in arts if (a["season"], a["club"]) not in done]
    if limit: todo = todo[:limit]
    print(len(arts), "articles,", len(todo), "to fetch", flush=True)
    for i in range(0, len(todo), 25):
        n += 1
        batch = todo[i:i + 25]
        recs = [fetch_one(a) for a in batch]
        b = json.dumps({"articles": recs}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        p = f"{out}/statpages-{n:03d}.json"
        with open(p + ".part", "wb") as fh: fh.write(b)
        os.replace(p + ".part", p)
        print(p, len(b), hashlib.sha256(b).hexdigest(), sum(1 for r in recs if "html" in r), "with a statistics section of", len(recs), flush=True)

if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) < 2: sys.exit(__doc__)
    main(a[0].rstrip("/"), a[1].rstrip("/"), int(a[2]) if len(a) > 2 else 0)

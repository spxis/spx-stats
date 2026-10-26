#!/usr/bin/env python3
"""Fetch the English Wikipedia (CC BY-SA 4.0) season articles of the European top divisions, rendered (the API's parse text), and the Wikidata item (CC0)
of every club the league tables link to. Never FBref / Sports Reference, ESPN or a league's own site (AGENTS.md section 3).
Usage: fetch.py [out dir] [--league premier_league|la_liga|bundesliga|serie_a|ligue_1] [--from 1992] [--to 2026] [--stage seasons|pageprops]
Default out: ~/Projects/backups/spx-stats/raw/wikipedia_europe/<today> ($SPX_RAW_DIR replaces the root; outside the repo).
Layout: <out>/season/<league>/<year>.json.gz (title, pageid, revid, requested, text), <out>/wikidata/pageprops-NNN.json, <out>/manifest.jsonl, <out>/missing.txt.
Resumable: a file that exists is kept. One request at a time, at least GAP seconds apart, identified User-Agent, backs off on 429/503."""
import argparse, gzip, hashlib, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import date, datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import standings as S

UA = {"User-Agent": "spx-stats/1.0 (https://spxn.com; john@spxis.com)"}
GAP = 1.3
API = "https://en.wikipedia.org/w/api.php"
def span(y):
    """The season as Wikipedia writes it in a title: 1992–93, but 1999–2000."""
    return f"{y}–{y + 1}" if y == 1999 else f"{y}–{str(y + 1)[2:]}"


# league -> (first season's start year, titles of the season article for start year y; the first that exists is kept)
LEAGUES = {
    "premier_league": (1992, lambda y: [f"{span(y)} {'FA Premier League' if y < 2007 else 'Premier League'}", f"{span(y)} Premier League", f"{span(y)} FA Premier League"]),
    "la_liga": (1929, lambda y: [f"{span(y)} La Liga", f"{span(y)} Primera División"]),
    "bundesliga": (1963, lambda y: [f"{span(y)} Bundesliga"]),
    "serie_a": (1929, lambda y: [f"{span(y)} Serie A", f"{span(y)} Divisione Nazionale"]),
    "ligue_1": (1932, lambda y: [f"{span(y)} {'French Division 1' if y < 2002 else 'Ligue 1'}", f"{span(y)} Ligue 1", f"{span(y)} French Division 1"]),
}

ap = argparse.ArgumentParser()
ap.add_argument("out", nargs="?")
ap.add_argument("--league")
ap.add_argument("--from", dest="y0", type=int)
ap.add_argument("--to", dest="y1", type=int, default=2026)
ap.add_argument("--stage", default="all")
a = ap.parse_args()
root = os.environ.get("SPX_RAW_DIR", "~/Projects/backups/spx-stats/raw")
out = os.path.expanduser(a.out or f"{root}/wikipedia_europe/{date.today().isoformat()}")
os.makedirs(out, exist_ok=True)
manifest = open(os.path.join(out, "manifest.jsonl"), "a")
missing = open(os.path.join(out, "missing.txt"), "a")
_last = [0.0]
requests = [0]


def http(url):
    for n in range(12):
        w = GAP - (time.time() - _last[0])
        if w > 0:
            time.sleep(w)
        _last[0] = time.time()
        try:
            requests[0] += 1
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            print("HTTP", e.code, url[:100], file=sys.stderr, flush=True)
            if e.code not in (429, 503, 504):
                raise
            time.sleep(int(e.headers.get("Retry-After") or 20) + 10 + (n % 5) * 10)
        except urllib.error.URLError as e:
            print("ERR", e, file=sys.stderr, flush=True)
            time.sleep(20)
    raise SystemExit("gave up: " + url[:100])


def note(name, url, body, **extra):
    manifest.write(json.dumps({"file": name, "url": url, "sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body),
                               "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), **extra}) + "\n")
    manifest.flush()


def parse(title):
    q = urllib.parse.urlencode({"action": "parse", "format": "json", "page": title, "prop": "text|revid", "redirects": 1, "disablelimitreport": 1,
                                "disableeditsection": 1, "disabletoc": 1})
    body = http(API + "?" + q)
    d = json.loads(body) if body else {}
    if "error" in d:
        if d["error"].get("code") in ("missingtitle", "invalidtitle"):
            return None
        raise SystemExit(f"{title}: {d['error']}")
    p = d["parse"]
    return {"title": p["title"], "pageid": p["pageid"], "revid": p["revid"], "requested": title, "text": p["text"]["*"]}


stages = {"seasons", "pageprops"} if a.stage == "all" else {a.stage}
if "seasons" in stages:
    for league, (first, titles) in LEAGUES.items():
        if a.league and a.league != league:
            continue
        for y in range(max(first, a.y0 or first), a.y1 + 1):
            name = f"season/{league}/{y}.json.gz"
            path = os.path.join(out, name)
            if os.path.exists(path):
                continue
            os.makedirs(os.path.dirname(path), exist_ok=True)
            got = None
            for t in titles(y):
                d = parse(t)
                # a redirect to a different season's or league's article is no article for this one
                if d and re.match(rf"^{y}[–-]\d\d(?:\d\d)? ", d["title"]):
                    got = d
                    break
            if not got:
                missing.write(f"{name}\t{' | '.join(titles(y))}\n"); missing.flush()
                print("MISSING", league, y, flush=True)
                continue
            raw = gzip.compress(json.dumps(got, ensure_ascii=False).encode("utf-8"), 9, mtime=0)
            open(path, "wb").write(raw)
            note(name, "https://en.wikipedia.org/wiki/" + urllib.parse.quote(got["title"].replace(" ", "_")), raw, title=got["title"], revid=got["revid"])
            print(league, y, got["title"], got["revid"], flush=True)

if "pageprops" in stages:
    titles = set()
    for league in LEAGUES:
        d0 = os.path.join(out, "season", league)
        for f in sorted(os.listdir(d0)) if os.path.isdir(d0) else []:
            season = json.load(gzip.open(os.path.join(d0, f), "rt", encoding="utf-8"))
            for tbl in S.standings(season):
                titles.update(r["team_link"] for r in tbl["rows"] if r["team_link"])
    titles = sorted(titles)
    print(len(titles), "club titles")
    for i in range(0, len(titles), 50):
        q = urllib.parse.urlencode({"action": "query", "format": "json", "prop": "pageprops", "ppprop": "wikibase_item", "redirects": 1,
                                    "titles": "|".join(titles[i:i + 50])})
        name = f"wikidata/pageprops-{i // 50:03d}.json"
        path = os.path.join(out, name)
        if not os.path.exists(path):
            body = http(API + "?" + q)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            open(path, "wb").write(body)
            note(name, API + "?" + q[:200], body)
print("done", out, "requests:", requests[0])

#!/usr/bin/env python3
"""Fetch the Major League Soccer raw files: openfootball/world (CC0, 2005-2025 results) and English Wikipedia (CC BY-SA 4.0): each season
article (wikitext and rendered HTML), each club-season article (wikitext: the match boxes), and the Wikidata item (CC0) of the club and
stadium pages. Never mlssoccer.com (its terms forbid automated collection, see scripts/mls/README.md), FBref / Sports Reference, ESPN,
Transfermarkt or the FIFA game ratings (AGENTS.md section 3).
Usage: fetch.py [out dir] [--from 1996] [--to 2026] [--stage openfootball|seasons|clubs|pageprops]
Default out: ~/Projects/backups/spx-stats/raw/mls/<today> ($SPX_RAW_DIR replaces the root; outside the repo).
Layout: <out>/openfootball/<year>_mls.txt, <out>/wikipedia/season/<year>.json.gz, <out>/wikipedia/club/<year>__<slug>.json.gz,
<out>/wikidata/pageprops-NNN.json, <out>/manifest.jsonl (file, url, sha256, bytes, fetched_at, title, revid), <out>/missing.txt.
Resumable: a file that exists is kept. One Wikipedia request at a time, at least GAP seconds apart, identified User-Agent, backs off on 429/503."""
import argparse, gzip, hashlib, json, os, re, subprocess, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import date, datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wikihtml as W
import season as S

UA = {"User-Agent": "spx-stats/1.0 (https://spxn.com; john@spxis.com)"}
GAP = 1.3
HOST = "raw." + "git" + "hubusercontent.com"
OF = f"https://{HOST}/openfootball/world/master/north-america/major-league-soccer/"
OF_YEARS = range(2005, 2026)
API = "https://en.wikipedia.org/w/api.php"

ap = argparse.ArgumentParser()
ap.add_argument("out", nargs="?")
ap.add_argument("--from", dest="y0", type=int, default=1996)
ap.add_argument("--to", dest="y1", type=int, default=2026)
ap.add_argument("--stage", default="all")
a = ap.parse_args()
root = os.environ.get("SPX_RAW_DIR", "~/Projects/backups/spx-stats/raw")
out = os.path.expanduser(a.out or f"{root}/mls/{date.today().isoformat()}")
os.makedirs(out, exist_ok=True)
manifest = open(os.path.join(out, "manifest.jsonl"), "a")
missing = open(os.path.join(out, "missing.txt"), "a")
_last = [0.0]
requests = [0]


def http(url, wiki=False):
    for n in range(12):
        if wiki:
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


def save_plain(name, url):
    path = os.path.join(out, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not os.path.exists(path):
        body = http(url)
        if body is None:
            missing.write(f"{name}\t{url}\n"); missing.flush()
            return None
        open(path, "wb").write(body)
        note(name, url, body)
    return path


def parse(title, props):
    """The API's parse of one page (redirects followed): dict with title, pageid, revid, wikitext, text; None when the page does not exist."""
    q = urllib.parse.urlencode({"action": "parse", "format": "json", "page": title, "prop": props, "redirects": 1, "disablelimitreport": 1,
                                "disableeditsection": 1, "disabletoc": 1})
    body = http(API + "?" + q, wiki=True)
    d = json.loads(body) if body else {}
    if "error" in d:
        if d["error"].get("code") in ("missingtitle", "invalidtitle"):
            return None
        raise SystemExit(f"{title}: {d['error']}")
    p = d["parse"]
    return {"title": p["title"], "pageid": p["pageid"], "revid": p["revid"], "requested": title,
            "wikitext": p.get("wikitext", {}).get("*"), "text": p.get("text", {}).get("*")}


def save_page(name, titles, props):
    """Try each title in turn; save the first page that exists as name (gzip JSON). Returns the saved dict or None."""
    path = os.path.join(out, name)
    if os.path.exists(path):
        return json.load(gzip.open(path, "rt", encoding="utf-8"))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for t in titles:
        d = parse(t, props)
        if d and not re.match(r"^\d{4}(?:[-–]\d{2,4})? .+ season$", d["title"]):
            d = None          # a redirect to the club's own article means there is no season article under that name
        if d:
            raw = gzip.compress(json.dumps(d, ensure_ascii=False).encode("utf-8"), 9, mtime=0)
            open(path, "wb").write(raw)
            note(name, "https://en.wikipedia.org/wiki/" + urllib.parse.quote(d["title"].replace(" ", "_")), raw, title=d["title"], revid=d["revid"])
            print(name, d["title"], d["revid"], flush=True)
            return d
    missing.write(f"{name}\t{' | '.join(titles)}\n"); missing.flush()
    print("MISSING", name, titles, flush=True)
    return None


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


stages = {"all"} if a.stage == "all" else {a.stage}
# 1. openfootball
if stages & {"all", "openfootball"}:
    for y in OF_YEARS:
        if a.y0 <= y <= a.y1:
            save_plain(f"openfootball/{y}_mls.txt", OF + f"{y}_mls.txt")
    save_plain("openfootball/LICENSE.md", f"https://{HOST}/openfootball/world/master/LICENSE.md")
    save_plain("openfootball/NOTES.md", OF + "NOTES.md")
    p = subprocess.run(["gh", "api", "repos/openfootball/world/commits/master", "-q", '.sha + " " + .commit.committer.date'], capture_output=True, text=True)
    if p.returncode == 0:
        open(os.path.join(out, "openfootball", "COMMIT.txt"), "w").write(p.stdout)

# 2. the season articles
if stages & {"all", "seasons"}:
    for y in range(a.y0, a.y1 + 1):
        save_page(f"wikipedia/season/{y}.json.gz", [f"{y} Major League Soccer season"], "wikitext|text|revid")

def resolved_titles():
    """from -> to of every title the pageprops stage has resolved so far (a second pass of the clubs stage uses it: a table that links
    'Los Angeles Galaxy' leads to the article 'LA Galaxy', whose season articles are named after the target)."""
    r = {}
    d0 = os.path.join(out, "wikidata")
    for f in sorted(os.listdir(d0)) if os.path.isdir(d0) else []:
        q = json.load(open(os.path.join(d0, f), encoding="utf-8")).get("query", {})
        r.update({x["from"]: x["to"] for x in q.get("redirects", [])})
    return r


# 3. the club-season articles of every team in each season's stadium table
if stages & {"all", "clubs"}:
    redir = resolved_titles()
    for y in range(a.y0, a.y1 + 1):
        sp = os.path.join(out, f"wikipedia/season/{y}.json.gz")
        if not os.path.exists(sp):
            continue
        season = json.load(gzip.open(sp, "rt", encoding="utf-8"))
        seen = set()
        for team, shown, _, _ in S.club_rows(season):
            if team in seen:
                continue
            seen.add(team)
            plain = re.sub(r"\s*\([^)]*\)$", "", team)
            target = re.sub(r"\s*\([^)]*\)$", "", redir.get(team, team))
            titles = list(dict.fromkeys([f"{y} {shown} season", f"{y} {plain} season", f"{y} {target} season", f"{y} {team} season"]))
            d = save_page(f"wikipedia/club/{y}__{slug(plain)}.json.gz", titles, "wikitext|revid")
            if d is None and not os.environ.get("MLS_NO_SEARCH") and not os.path.exists(os.path.join(out, f"wikipedia/club/{y}__{slug(plain)}.json.gz")):
                # last resort: the site search for the season article
                q = urllib.parse.urlencode({"action": "query", "format": "json", "list": "search", "srlimit": 5, "srnamespace": 0,
                                            "srsearch": f'intitle:"{y}" intitle:"season" "{plain}"'})
                r = json.loads(http(API + "?" + q, wiki=True) or "{}")
                toks = {w for w in re.findall(r"[a-z]{4,}", f"{plain} {shown}".lower()) if w not in ("united", "city", "football", "soccer")}
                hits = [h["title"] for h in r.get("query", {}).get("search", [])
                        if re.match(rf"^{y} .+ season$", h["title"]) and "Major League Soccer" not in h["title"] and toks & set(re.findall(r"[a-z]{4,}", h["title"].lower()))]
                if hits:
                    save_page(f"wikipedia/club/{y}__{slug(plain)}.json.gz", hits[:1], "wikitext|revid")

# 4. the Wikidata item (pageprops wikibase_item) and the redirect of every club, stadium and player page the season articles and match boxes link to
if stages & {"all", "pageprops"}:
    titles = set()
    for y in range(a.y0, a.y1 + 1):
        sp = os.path.join(out, f"wikipedia/season/{y}.json.gz")
        if not os.path.exists(sp):
            continue
        season = json.load(gzip.open(sp, "rt", encoding="utf-8"))
        for team, _, st, _ in S.club_rows(season):
            titles.add(team)
            if st:
                titles.add(st)
        for tbl in S.standings(season):
            titles.update(r["team_link"] for r in tbl["rows"])
        for l in S.leaders(season):
            titles.update(x for x in (l[3], l[4]) if x)
        for aw in S.awards(season):
            titles.update(x for x in (aw[2], aw[3]) if x)
    cdir = os.path.join(out, "wikipedia/club")
    for f in sorted(os.listdir(cdir)) if os.path.isdir(cdir) else []:
        wt = json.load(gzip.open(os.path.join(cdir, f), "rt", encoding="utf-8"))["wikitext"] or ""
        for m in re.finditer(r"\|\s*(?:stadium|team1|team2)\s*=\s*([^\n]*)", wt):
            for t in re.findall(r"\[\[([^\]|#]+)", m.group(1)):
                titles.add(t)
    titles = sorted(t.strip() for t in titles if t.strip())
    print(len(titles), "titles")
    for i in range(0, len(titles), 50):
        q = urllib.parse.urlencode({"action": "query", "format": "json", "prop": "pageprops", "ppprop": "wikibase_item", "redirects": 1,
                                    "titles": "|".join(titles[i:i + 50])})
        name = f"wikidata/pageprops-{i // 50:03d}.json"
        path = os.path.join(out, name)
        if not os.path.exists(path):
            body = http(API + "?" + q, wiki=True)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            open(path, "wb").write(body)
            note(name, API + "?" + q[:200], body)
print("done", out, "requests:", requests[0])

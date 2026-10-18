#!/usr/bin/env python3
"""Fetch the rosters of club-season articles from English Wikipedia (CC BY-SA 4.0) through the MediaWiki API, raw first.

  wp_fetch.py <nba|cfl|nha|pcha|wchl|wha> <titles.tsv> <raw dir> [articles|titles|persons|all]
  (nha|pcha|wchl|wha: only `titles` and `persons`; the articles are written by scripts/hockey/roster_articles.py export; titles.tsv is unused, pass -)

titles.tsv: one club season per line, tab separated: the season's first year, the club's name that season, and (optional) the article title.
  Without a title it is "<season>-<yy> <club> season" for the NBA ("2009–10 Houston Rockets season"; 1999 is "1999–2000") and "<season> <club> season" for the CFL.
  The coordinator writes the file from DS1 (see scripts/rosters/README.md): one row per core.team_season of the league.

Stages (nothing already fetched is fetched again, so a stopped run resumes and a longer titles.tsv adds only the new club seasons, each batch in
the next numbered file):
  articles  articles-NNN.json  10 articles a call: title, revision id, timestamp, and the Roster and Player statistics sections as served
            (the rest of the article is not kept). Cite a row as the article title at that revision id.
  titles    titles-NNN.json    the Wikidata item each linked player article belongs to (prop=pageprops, 50 titles a call; redirects followed,
            disambiguation pages marked).
  persons   personswp-NNN.json the Wikidata items of those articles that wd_fetch.py did not already fetch (same pruning), then their
            places and countries (items-*, countries-*).
One API request every 2 seconds, maxlag=5, with the project's User-Agent; 429 and 5xx back off and retry.
Privacy: the same allow-list as scripts/people/fetch.py."""
import importlib.util, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, path))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
pf = load("people_fetch", "../people/fetch.py")
wd = load("wd_fetch", "wd_fetch.py")
wp = load("wp_parse", "wp_parse.py")

API = "https://en.wikipedia.org/w/api.php"

def api(**p):
    q = urllib.parse.urlencode({"format": "json", "formatversion": "2", "maxlag": "5", **p})
    delay = 10
    for _ in range(12):
        w = 2.1 - (time.time() - pf._last[0])
        if w > 0: time.sleep(w)
        pf._last[0] = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(API + "?" + q, headers={"User-Agent": pf.UA}), timeout=120, context=pf.CTX) as r:
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

def season_title(league, season, club):
    if league == "nba":
        label = f"{season}–2000" if season == 1999 else f"{season}–{str(season + 1)[-2:]}"
        return f"{label} {club} season"
    return f"{season} {club} season"

def read_titles(league, path):
    rows = []
    for ln in open(path, encoding="utf-8"):
        f = ln.rstrip("\n").split("\t")
        if len(f) < 2 or not f[0].strip().isdigit(): continue
        rows.append((int(f[0]), f[1].strip(), (f[2].strip() if len(f) > 2 and f[2].strip() else season_title(league, int(f[0]), f[1].strip()))))
    return sorted(set(rows))

def stage_articles(league, tsv, raw):
    done = {(a["season"], a["club"]) for a in read_articles(raw)}
    rows = [r for r in read_titles(league, tsv) if (r[0], r[1]) not in done]   # only club seasons not fetched yet; new ones go in new files
    n = len([f for f in os.listdir(raw) if f.startswith("articles-")])
    print(len(rows), "club-season articles to fetch", flush=True)
    for i in range(0, len(rows), 10):
        n += 1
        p = f"{raw}/articles-{n:03d}.json"
        batch = rows[i:i + 10]
        d = api(action="query", prop="revisions", rvprop="ids|timestamp|content", rvslots="main", redirects="1", titles="|".join(t for _, _, t in batch))
        q = d.get("query", {})
        norm = {n["from"]: n["to"] for n in q.get("normalized", [])}
        redir = {n["from"]: n["to"] for n in q.get("redirects", [])}
        pages = {pg["title"]: pg for pg in q.get("pages", [])}
        out = []
        for season, club, title in batch:
            t = norm.get(title, title); t = redir.get(t, t)
            pg = pages.get(t)
            rec = {"season": season, "club": club, "requested": title, "title": t}
            if not pg or pg.get("missing") or not pg.get("revisions"):
                rec["missing"] = True
            else:
                rev = pg["revisions"][0]
                rec.update(revid=rev["revid"], timestamp=rev["timestamp"], sections=wp.sections(rev["slots"]["main"]["content"]))
            out.append(rec)
        pf.save(p, {"league": league, "articles": out})
        print(p, sum(1 for r in out if r.get("missing")), "missing of", len(out), flush=True)

def read_articles(raw):
    out = []
    for f in sorted(os.listdir(raw)):
        if f.startswith("articles-"): out += json.load(open(f"{raw}/{f}", encoding="utf-8"))["articles"]
    return out

def link_titles(league, raw):
    ts = set()
    for a in read_articles(raw):
        for e in wp.entries(league, a.get("sections") or {}, a["club"]):
            if e["title"]: ts.add(e["title"])
    return sorted(ts)

def stage_titles(league, raw):
    done = set()
    for f in os.listdir(raw):
        if f.startswith("titles-"): done |= set(json.load(open(f"{raw}/{f}", encoding="utf-8"))["requested"])
    ts = [t for t in link_titles(league, raw) if t not in done]
    n = len([f for f in os.listdir(raw) if f.startswith("titles-")])
    print(len(ts), "linked player articles not looked up yet", flush=True)
    for i in range(0, len(ts), 50):
        n += 1
        p = f"{raw}/titles-{n:03d}.json"
        batch = ts[i:i + 50]
        d = api(action="query", prop="pageprops", ppprop="wikibase_item|disambiguation", redirects="1", titles="|".join(batch))
        q = d.get("query", {})
        pf.save(p, {"requested": batch, "normalized": q.get("normalized", []), "redirects": q.get("redirects", []),
                    "pages": [{"title": pg["title"], "missing": bool(pg.get("missing")), "qid": (pg.get("pageprops") or {}).get("wikibase_item"),
                               "disambiguation": "disambiguation" in (pg.get("pageprops") or {})} for pg in q.get("pages", [])]})
        print(p, flush=True)

def stage_persons(raw):
    have = set(pf.qids_from(raw, *wd.PERSONS))
    want = set()
    for f in sorted(os.listdir(raw)):
        if f.startswith("titles-"):
            for pg in json.load(open(f"{raw}/{f}", encoding="utf-8"))["pages"]:
                if pg.get("qid") and not pg["disambiguation"]: want.add(pg["qid"])
    want = sorted(want - have, key=lambda x: int(x[1:]))
    print(len(want), "player items not fetched yet", flush=True)
    wd.entities_new(want, "personswp", raw)
    wd.fetch_items(raw)

if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) < 3 or a[0] not in ("nba", "cfl", "nha", "pcha", "wchl", "wha"): sys.exit(__doc__)
    league, tsv, raw = a[0], a[1], a[2]
    stage = a[3] if len(a) > 3 else "all"
    if league in ("nha", "pcha", "wchl", "wha") and stage in ("articles", "all"):
        sys.exit("hockey: the articles come from scripts/hockey/roster_articles.py export (no request); run the titles and persons stages here")
    os.makedirs(raw, exist_ok=True)
    if stage in ("articles", "all"): stage_articles(league, tsv, raw)
    if stage in ("titles", "all"): stage_titles(league, raw)
    if stage in ("persons", "all"): stage_persons(raw)

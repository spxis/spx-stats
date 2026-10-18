#!/usr/bin/env python3
"""Rosters of the NFL (1920-1972), the AFL (1960-69) and the AAFC (1946-49) from the club-season articles on English Wikipedia (CC BY-SA 4.0), raw first.

  nflwp_fetch.py extract <cache dir>... <raw dir> [first [last]]   read the club-season wikitext scripts/nfl/fetch.py cached (no request) -> <raw dir>/rosters.json
  nflwp_fetch.py titles  <raw dir>                                 the Wikidata item each linked player article is (pageprops, 50 titles a call) -> titles-NNN.json
  nflwp_fetch.py persons <raw dir>                                 those items' facts (wbgetentities, 50 a call, allow-listed claims) -> personswp-NNN.json, items-*, countries-*

`extract` makes no request: every club-season article was fetched and archived by scripts/nfl/season.py already (its wikitext is in
legacy_files.raw_archive under wikipedia-nfl|afl|aafc/<year>/...). Give it the cache directories, newest last (a file in a later one wins).
rosters.json holds, per club season, the article title, the cached file and the players read; a club season with no Roster section is listed with
`"roster": false`. `titles` and `persons` make one API request every 2 seconds (the helpers of scripts/rosters/wp_fetch.py), resumable: a file that
exists is never fetched again and a longer rosters.json adds only the new titles. Privacy: scripts/people/fetch.py's allow-list drops everything but
the properties it names (nothing on ethnicity, religion, health, sex or gender, family or politics)."""
import importlib.util, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, path))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
P = load("nflwp_parse", "nflwp_parse.py")

LEAGUES = [("nfl", 1920, 1972), ("afl", 1960, 1969), ("aafc", 1946, 1949)]

def fname(title): return re.sub(r"[^A-Za-z0-9._-]+", "_", title) + ".wikitext"

def finder(caches):
    def raw(sub, title):
        for c in reversed(caches):
            p = f"{c}/{sub}/{fname(title)}"
            if os.path.exists(p):
                t = open(p, encoding="utf-8").read()
                return (None if t.startswith("#MISSING 404") else t), p
        return None, None
    def find(sub, title):
        for _ in range(4):
            t, p = raw(sub, title)
            if t is None: return None
            m = re.match(r"\s*#REDIRECT\s*\[\[([^\]|#]+)", t, re.I)
            if not m: return t
            title = m.group(1).strip()
        return t
    def where(sub, title):
        for _ in range(4):
            t, p = raw(sub, title)
            if t is None: return None
            m = re.match(r"\s*#REDIRECT\s*\[\[([^\]|#]+)", t, re.I)
            if not m: return p
            title = m.group(1).strip()
        return p
    return find, where

def extract(caches, raw, first=None, last=None):
    os.makedirs(raw, exist_ok=True)
    find, where = finder(caches)
    out = []
    for league, y0, y1 in LEAGUES:
        for y in range(max(y0, first or y0), min(y1, last or y1) + 1):
            clubs = P.club_titles(league, y, find)
            for club, title in sorted(clubs.items()):
                text = find("team", title)
                rec = {"league": league, "season": y, "club": club, "title": title, "file": where("team", title)}
                if text is None:
                    rec.update(missing=True, roster=False, players=[])
                else:
                    sec = P.roster_section(text)
                    rec.update(missing=False, roster=sec is not None, players=P.entries(sec) if sec is not None else [])
                out.append(rec)
    with open(f"{raw}/rosters.json", "w", encoding="utf-8") as f:
        f.write(json.dumps({"extracted": 1, "articles": out}, ensure_ascii=False, separators=(",", ":")))
    by = {}
    for r in out:
        k = (r["league"], r["season"] // 10 * 10)
        a = by.setdefault(k, [0, 0, 0, 0, 0]); a[0] += 1; a[1] += 1 if r["roster"] else 0; a[2] += len(r["players"])
        a[3] += sum(1 for p in r["players"] if p["title"]); a[4] += 1 if r["missing"] else 0
    print("league decade  articles  with-roster  players  linked  missing")
    for k in sorted(by): print(k[0], k[1], *by[k])
    print(len(out), "club seasons;", sum(len(r["players"]) for r in out), "players;", sum(1 for r in out for p in r["players"] if p["title"]), "linked")

def read(raw): return json.load(open(f"{raw}/rosters.json", encoding="utf-8"))["articles"]

def stage_titles(raw):
    wp = load("wp_fetch", "wp_fetch.py"); pf = wp.pf
    done = set()
    for f in os.listdir(raw):
        if f.startswith("titles-"): done |= set(json.load(open(f"{raw}/{f}", encoding="utf-8"))["requested"])
    want = sorted({p["title"] for a in read(raw) for p in a["players"] if p["title"]})
    ts = [t for t in want if t not in done]
    n = len([f for f in os.listdir(raw) if f.startswith("titles-")])
    print(len(want), "linked player articles,", len(ts), "not looked up yet", flush=True)
    for i in range(0, len(ts), 50):
        n += 1
        p = f"{raw}/titles-{n:03d}.json"
        batch = ts[i:i + 50]
        d = wp.api(action="query", prop="pageprops", ppprop="wikibase_item|disambiguation", redirects="1", titles="|".join(batch))
        q = d.get("query", {})
        pf.save(p, {"requested": batch, "normalized": q.get("normalized", []), "redirects": q.get("redirects", []),
                    "pages": [{"title": pg["title"], "missing": bool(pg.get("missing")), "qid": (pg.get("pageprops") or {}).get("wikibase_item"),
                               "disambiguation": "disambiguation" in (pg.get("pageprops") or {})} for pg in q.get("pages", [])]})
        if n % 20 == 0: print(p, flush=True)

def stage_persons(raw):
    load("wp_fetch", "wp_fetch.py").stage_persons(raw)

if __name__ == "__main__":
    a = sys.argv[1:]
    if not a: sys.exit(__doc__)
    if a[0] == "extract":
        rest = a[1:]
        nums = []
        while rest and rest[-1].isdigit(): nums.insert(0, int(rest.pop()))
        if len(rest) < 2: sys.exit(__doc__)
        extract([os.path.expanduser(c) for c in rest[:-1]], os.path.expanduser(rest[-1]), *(nums + [None, None])[:2])
    elif a[0] == "titles" and len(a) == 2: stage_titles(os.path.expanduser(a[1]))
    elif a[0] == "persons" and len(a) == 2: stage_persons(os.path.expanduser(a[1]))
    else: sys.exit(__doc__)

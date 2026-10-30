#!/usr/bin/env python3
"""Fetch the CFL club-season articles that carry club leaders, and the Wikidata item of each player article they link, raw first.
English Wikipedia text is CC BY-SA 4.0. One request every 2.1 s (scripts/rosters/wp_fetch.py's client: maxlag=5, the project's User-Agent, 429 and 5xx back off).

  fetch.py scan <cache dir> [<cache dir> ...]      names the club-season articles in the wikitext caches season.py keeps (scripts/wikipedia/cfl_cache_from_archive.py
                                                   rebuilds them from DS1's archive) whose Passing, Rushing, Receiving or Offensive leaders table names a player: one title a line,
                                                   on stdout (no request)
  fetch.py articles <titles.txt> <raw dir>         the wikitext of each title, as the current revision: <raw dir>/<title>.wikitext and fetched.json
                                                   (title, revision id, timestamp, file). A title already in fetched.json is not fetched again.
  fetch.py titles <raw dir>                        the Wikidata item (pageprops wikibase_item, redirects followed) of every article a leader line links to:
                                                   titles-NNN.json, 50 titles a call; titles already looked up are skipped

Raw folder: ~/Projects/backups/spx-stats/raw/wikipedia_cfl_leaders/<YYYY-MM-DD>/ (never in the repository). The revision id is the source key of every line.
"""
import datetime, importlib.util, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, path))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


P = load("cfl_leaders_parse", "parse.py")
WF = load("wp_fetch", "../rosters/wp_fetch.py")
pf = WF.pf


def fname(title):
    return re.sub(r"[^A-Za-z0-9._()'-]", "_", title.replace(" ", "_")) + ".wikitext"


def scan(dirs):
    seen = {}
    for d in dirs:
        for f in sorted(os.listdir(d)):
            if not f.endswith(".wikitext"): continue
            title = f[:-len(".wikitext")].replace("_", " ")
            if P.club_season(title)[0] is None: continue
            ls, _, _ = P.leaders(open(os.path.join(d, f), encoding="utf-8").read())
            if ls: seen[title] = len(ls)
    for t in sorted(seen): print(t)
    print(len(seen), "articles", sum(seen.values()), "lines", file=sys.stderr)


def articles(titles_file, raw):
    os.makedirs(raw, exist_ok=True)
    meta_path = os.path.join(raw, "fetched.json")
    meta = json.load(open(meta_path, encoding="utf-8")) if os.path.exists(meta_path) else {"fetched_on": datetime.date.today().isoformat(), "articles": []}
    have = {a["title"] for a in meta["articles"]} | {a.get("requested") for a in meta["articles"]}
    want = [t.strip() for t in open(titles_file, encoding="utf-8") if t.strip() and t.strip() not in have]
    print(len(want), "articles to fetch", flush=True)
    for i in range(0, len(want), 10):
        batch = want[i:i + 10]
        d = WF.api(action="query", prop="revisions", rvprop="ids|timestamp|content", rvslots="main", titles="|".join(batch))
        q = d.get("query", {})
        norm = {n["from"]: n["to"] for n in q.get("normalized", [])}
        pages = {pg["title"]: pg for pg in q.get("pages", [])}
        for req in batch:
            t = norm.get(req, req)
            pg = pages.get(t)
            rec = {"requested": req, "title": t}
            if not pg or pg.get("missing") or not pg.get("revisions"):
                rec["missing"] = True
            else:
                rev = pg["revisions"][0]
                text = rev["slots"]["main"]["content"]
                rec.update(revid=rev["revid"], timestamp=rev["timestamp"], file=fname(t))
                open(os.path.join(raw, rec["file"]), "w", encoding="utf-8", newline="").write(text)
            meta["articles"].append(rec)
        pf.save(meta_path, meta)
        print(i + len(batch), "of", len(want), flush=True)


def titles(raw):
    meta = P.read_raw(raw)
    want = set()
    for a in meta["articles"]:
        if a.get("missing"): continue
        ls, _, _ = P.leaders(a["text"])
        want |= {l["title"] for l in ls if l["title"]}
    done = set()
    for f in os.listdir(raw):
        if f.startswith("titles-"): done |= set(json.load(open(os.path.join(raw, f), encoding="utf-8"))["requested"])
    ts = sorted(want - done)
    n = len([f for f in os.listdir(raw) if f.startswith("titles-")])
    print(len(ts), "linked player articles not looked up yet", flush=True)
    for i in range(0, len(ts), 50):
        n += 1
        batch = ts[i:i + 50]
        d = WF.api(action="query", prop="pageprops", ppprop="wikibase_item|disambiguation", redirects="1", titles="|".join(batch))
        q = d.get("query", {})
        pf.save(os.path.join(raw, f"titles-{n:03d}.json"), {
            "requested": batch, "normalized": q.get("normalized", []), "redirects": q.get("redirects", []),
            "pages": [{"title": pg["title"], "missing": bool(pg.get("missing")), "qid": (pg.get("pageprops") or {}).get("wikibase_item"),
                       "disambiguation": "disambiguation" in (pg.get("pageprops") or {})} for pg in q.get("pages", [])]})
        print(n, flush=True)


if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) >= 2 and a[0] == "scan": scan([os.path.expanduser(x) for x in a[1:]])
    elif len(a) == 3 and a[0] == "articles": articles(os.path.expanduser(a[1]), os.path.expanduser(a[2]))
    elif len(a) == 2 and a[0] == "titles": titles(os.path.expanduser(a[1]))
    else: sys.exit(__doc__)

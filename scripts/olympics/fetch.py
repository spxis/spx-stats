#!/usr/bin/env python3
"""Fetch the Olympic event articles of English Wikipedia (CC BY-SA 4.0) and the Wikidata item of every athlete they link, raw first.

  fetch.py articles <raw dir> [<event key> ...]   the wikitext, revision id and Wikidata item of each event article, 10 titles a call
  fetch.py titles <raw dir>                       the Wikidata item (pageprops wikibase_item, redirects followed) of every article the result
                                                  tables link, 50 titles a call; titles already looked up are skipped
  fetch.py list                                   the events and titles this script knows (no request)

Events are keys such as 100m-m and 100m-w (events.py holds the title patterns and the Games each was held at). Raw folder:
~/Projects/backups/spx-stats/raw/wikipedia_olympics/<YYYY-MM-DD>/ (never in the repository); fetched.json holds the title, revision id, timestamp,
file and Wikidata item of every article. A title already in fetched.json is not fetched again.
Every request goes through the shared limiter of scripts/daily (one at a time, spaced, maxlag=5, an identified User-Agent, backoff on 429 and 5xx);
set SPX_LIMITER=file for a run from a Mac that must not write DS1. Olympedia, World Athletics, World Aquatics and Omega are not fetched."""
import datetime, importlib.util, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "daily"))


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, path))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


EV = load("olympics_events", "events.py")
import wikiapi


def fname(title):
    return re.sub(r"[^A-Za-z0-9._()'-]", "_", title.replace(" ", "_")) + ".wikitext"


def save(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f: json.dump(obj, f, indent=1, ensure_ascii=False)
    os.replace(tmp, path)


def articles(raw, keys):
    os.makedirs(raw, exist_ok=True)
    meta_path = os.path.join(raw, "fetched.json")
    meta = json.load(open(meta_path, encoding="utf-8")) if os.path.exists(meta_path) else {"fetched_on": datetime.date.today().isoformat(), "articles": []}
    have = {a["requested"] for a in meta["articles"]}
    want = [t for t in EV.titles(keys) if t[2] not in have]
    print(len(want), "articles to fetch", flush=True)
    cl = wikiapi.Client()
    for i in range(0, len(want), 10):
        batch = want[i:i + 10]
        d = cl._get({"action": "query", "prop": "revisions|pageprops", "rvprop": "ids|timestamp|content", "rvslots": "main", "ppprop": "wikibase_item",
                     "redirects": "1", "titles": "|".join(t[2] for t in batch)}, "olympic event articles", len(batch))
        q = d.get("query", {})
        hop = {x["from"]: x["to"] for x in q.get("normalized", [])}
        hop.update({x["from"]: x["to"] for x in q.get("redirects", [])})
        pages = {pg["title"]: pg for pg in q.get("pages", [])}
        for key, year, req in batch:
            t = req
            for _ in range(5):
                if t in hop: t = hop[t]
            pg = pages.get(t)
            rec = {"event": key, "year": year, "requested": req, "title": t}
            if not pg or pg.get("missing") or not pg.get("revisions"):
                rec["missing"] = True
            else:
                rev = pg["revisions"][0]
                rec.update(revid=rev["revid"], timestamp=rev["timestamp"], file=fname(t), qid=(pg.get("pageprops") or {}).get("wikibase_item"))
                with open(os.path.join(raw, rec["file"]), "w", encoding="utf-8", newline="") as f: f.write(rev["slots"]["main"]["content"])
            meta["articles"].append(rec)
        save(meta_path, meta)
        print(i + len(batch), "of", len(want), "requests so far", cl.requests, flush=True)


def titles(raw):
    PARSE = load("olympics_parse", "parse.py")
    meta = json.load(open(os.path.join(raw, "fetched.json"), encoding="utf-8"))
    want = set()
    for a in meta["articles"]:
        if a.get("missing"): continue
        text = open(os.path.join(raw, a["file"]), encoding="utf-8").read()
        want |= {x for x in PARSE.linked_titles(text)}
    done = set()
    for f in os.listdir(raw):
        if f.startswith("titles-"): done |= set(json.load(open(os.path.join(raw, f), encoding="utf-8"))["requested"])
    ts = sorted(want - done)
    n = len([f for f in os.listdir(raw) if f.startswith("titles-")])
    print(len(ts), "linked articles not looked up yet", flush=True)
    cl = wikiapi.Client()
    for i in range(0, len(ts), 50):
        n += 1
        batch = ts[i:i + 50]
        d = cl._get({"action": "query", "prop": "pageprops", "ppprop": "wikibase_item|disambiguation", "redirects": "1", "titles": "|".join(batch)},
                    "olympic linked articles", len(batch))
        q = d.get("query", {})
        save(os.path.join(raw, f"titles-{n:03d}.json"), {
            "requested": batch, "normalized": q.get("normalized", []), "redirects": q.get("redirects", []),
            "pages": [{"title": pg["title"], "missing": bool(pg.get("missing")), "qid": (pg.get("pageprops") or {}).get("wikibase_item"),
                       "disambiguation": "disambiguation" in (pg.get("pageprops") or {})} for pg in q.get("pages", [])]})
        print(n, "requests so far", cl.requests, flush=True)


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["list"]:
        for k, y, t in EV.titles(None): print(k, y, t)
    elif len(a) >= 2 and a[0] == "articles": articles(os.path.expanduser(a[1]), a[2:] or None)
    elif len(a) == 2 and a[0] == "titles": titles(os.path.expanduser(a[1]))
    else: sys.exit(__doc__)

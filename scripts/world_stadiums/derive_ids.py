#!/usr/bin/env python3
"""The Wikidata item of every stadium a core.soccer_match names, read from the raw files the World Cup and MLS loads used (no network, no database).
Usage: derive_ids.py <worldcup raw dir> <mls raw dir> <kyogijo grounds.data.json> > db/seed/soccer_venue_ids.csv
Same rules as the loads: World Cup 1930-2022 (men, women) = jfjelstul stadiums.csv, the Wikipedia link of each stadium resolved to its Wikidata item through the
page properties scripts/worldcup/fetch.py saved; 2026 = the wikidata column of openfootball's 2026__stadiums.csv; MLS = the stadium link of each league match
box of the club-season and season articles (scripts/mls/wikibox.py) and the 'Team | Stadium' table of each season article, resolved the same way.
Also kyogijo's famous grounds (grounds.data.json). Output: CSV qid,origin,label (origin: wc, wc2026, mls, kyogijo, fix); stderr lists the links that led to no item.
These are the venues scripts/game_venue/ids.py adds to the fetch (see scripts/world_stadiums/README.md)."""
import csv, glob, gzip, json, os, re, sys, urllib.parse
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(here, "..", "mls"))
import wikibox as B
import season as S

wc, mls, kyo = (os.path.expanduser(a) for a in sys.argv[1:4])
found = {}          # qid -> set of origins
names = {}
nolink = []


def add(qid, origin, label=None):
    found.setdefault(qid, set()).add(origin)
    if label and qid not in names:
        names[qid] = label


def pageprops(raw):
    norm, redir, pages = {}, {}, {}
    for path in sorted(glob.glob(raw + "/wikidata/pageprops-*.json")):
        d = json.load(open(path, encoding="utf-8"))["query"]
        norm.update({x["from"]: x["to"] for x in d.get("normalized", [])})
        redir.update({x["from"]: x["to"] for x in d.get("redirects", [])})
        pages.update({p["title"]: p for p in d["pages"].values()})

    def resolve(title):
        t = norm.get(title, title)
        for _ in range(5):
            if t in redir:
                t = redir[t]
        pg = pages.get(t)
        return pg.get("pageprops", {}).get("wikibase_item") if pg else None
    return resolve


# World Cup 1930-2022: jfjelstul stadiums.csv
res = pageprops(wc)
for r in csv.DictReader(open(f"{wc}/jfjelstul/stadiums.csv", encoding="utf-8", newline="")):
    link = r["stadium_wikipedia_link"]
    t = urllib.parse.unquote(link[len("https://en.wikipedia.org/wiki/"):]).split("#")[0].replace("_", " ") if link.startswith("https://en.wikipedia.org/wiki/") else None
    qid = res(t) if t else None
    if qid:
        add(qid, "wc", r["stadium_name"])
    else:
        nolink.append(("wc", r["stadium_name"], r["city_name"]))

# World Cup 2026: openfootball
header = None
for line in open(f"{wc}/openfootball/2026__stadiums.csv", encoding="utf-8"):
    s = line.strip()
    if not s or s.startswith("#"):
        continue
    cells = [c.strip() for c in next(csv.reader([s], skipinitialspace=True))]
    if header is None:
        header = [c.lower() for c in cells]
        continue
    r = dict(zip(header, cells))
    if r.get("wikidata", "").startswith("Q"):
        add(r["wikidata"], "wc2026", r.get("name"))
    else:
        nolink.append(("wc2026", r.get("name"), r.get("city")))

# MLS
res = pageprops(mls)
EXCLUDE = re.compile(r"open cup|friendl|pre-?season|non-competitive|mid-?season|concacaf|champions|leagues cup|campeones|canadian championship|invitational|"
                     r"international|tour\b|exhibition|all-star|super liga|superliga|us open|u\.s\. open|copa|supporters' shield \(|reserve|academy|summer", re.I)
gz = lambda p: json.load(gzip.open(p, "rt", encoding="utf-8"))
seen = set()
for path in sorted(glob.glob(mls + "/wikipedia/club/*.json.gz")) + sorted(glob.glob(mls + "/wikipedia/season/*.json.gz")):
    d = gz(path)
    year = int(os.path.basename(path)[:4])
    if (year, d["title"]) in seen:
        continue
    seen.add((year, d["title"]))
    for b in B.boxes(d["wikitext"] or "", year):
        if EXCLUDE.search(" ".join(b["path"])):
            continue
        st = b["stadium"]
        if not st["link"]:
            if st["text"]:
                nolink.append(("mls box", st["text"], b["location"]))
            continue
        qid = res(st["link"])
        if qid:
            add(qid, "mls", st["text"])
        else:
            nolink.append(("mls box", st["text"], st["link"]))
    if "/season/" in path:
        for team, shown, st, st_shown in S.season_teams(d):
            qid = res(st) if st else None
            if qid:
                add(qid, "mls", st_shown)

# db/seed/soccer_venue_fix.csv: the right item where a link led to a disambiguation page, a club or a competition (run from the repo root)
for r in csv.DictReader(open("db/seed/soccer_venue_fix.csv", newline="", encoding="utf-8")):
    add(r["venue_wikidata_id"], "fix", None)

# kyogijo
for g in json.load(open(kyo, encoding="utf-8")):
    add(g["wikidata"], "kyogijo", g["name"])

w = csv.writer(sys.stdout, lineterminator="\n")
w.writerow(["qid", "origin", "label"])
for qid in sorted(found, key=lambda q: int(q[1:])):
    w.writerow([qid, ",".join(sorted(found[qid])), names.get(qid, "")])
by = {}
for q_, o in found.items():
    for x in o:
        by[x] = by.get(x, 0) + 1
print("items:", len(found), by, file=sys.stderr)
for x in sorted(set(nolink)):
    print("no item:", x, file=sys.stderr)

#!/usr/bin/env python3
"""Turn the raw Wikidata files of fetch.py into db/seed/city_place.csv (slug, wikidata_id, latitude, longitude), one row per city.
Usage: make_seed.py <raw dir> [slug ...]      (run from the repo root)
Slugs given: only those cities are looked up and their rows replace or join the rows already in the file; none: every city, the file is rewritten.
A city with one Wikidata item in its state or province takes that item; with several, the one with five times the population of the next
(a small town of the same name is never the city); anything else is listed and left out, because no item is guessed.
A city with no item is listed too. The coordinates must fall inside Canada or the United States."""
import csv, json, os, re, sys

raw = os.path.expanduser(sys.argv[1])
with open("db/seed/city.csv", newline="", encoding="utf-8") as f:
    cities = list(csv.DictReader(f))
only = sys.argv[2:]
if only:
    cities = [c for c in cities if c["slug"] in only]


def inside(lat, lon):
    # the lower 48, Alaska and Hawaii, and Canada's south: a box wide enough for any of our cities, tight enough to catch a swapped sign
    return 24 <= lat <= 72 and -170 <= lon <= -52


# Two cities have a second item for a census-designated place or a neighbouring township of the same name; the item of the town or city
# (the English Wikipedia article without "(CDP)" or the county in its title) is the one meant.
PICK = {"foxborough": "Q830669", "miami-gardens": "Q721455"}

rows, problems = [], []
for c in cities:
    path = os.path.join(raw, c["slug"] + ".json")
    if not os.path.exists(path):
        problems.append((c["slug"], "no raw file"))
        continue
    items = {}
    for b in json.load(open(path))["results"]["bindings"]:
        qid = b["c"]["value"].rsplit("/", 1)[1]
        it = items.setdefault(qid, {"coords": set(), "pop": 0})
        m = re.match(r"Point\((-?[\d.]+) (-?[\d.]+)\)", b["coord"]["value"])
        if m:
            it["coords"].add((float(m.group(2)), float(m.group(1))))
        if "pop" in b:
            it["pop"] = max(it["pop"], float(b["pop"]["value"]))
    if not items:
        problems.append((c["slug"], "no Wikidata item in " + c["region"]))
        continue
    ranked = sorted(items.items(), key=lambda kv: -kv[1]["pop"])
    if c["slug"] in PICK and PICK[c["slug"]] in items:
        ranked = [(PICK[c["slug"]], items[PICK[c["slug"]]])]
    if len(ranked) > 1 and not ranked[0][1]["pop"] >= 5 * ranked[1][1]["pop"]:
        problems.append((c["slug"], "several items: " + ", ".join(f"{q} (pop {int(i['pop'])})" for q, i in ranked)))
        continue
    qid, it = ranked[0]
    lat, lon = sorted(it["coords"])[0]
    if len(it["coords"]) > 1:
        problems.append((c["slug"], f"{qid} has {len(it['coords'])} coordinates; took the first"))
    if not inside(lat, lon):
        problems.append((c["slug"], f"{qid} coordinates {lat},{lon} are outside North America"))
        continue
    rows.append((c["slug"], qid, f"{lat:.5f}", f"{lon:.5f}"))

found = len(rows)
if only:
    with open("db/seed/city_place.csv", newline="", encoding="utf-8") as f:
        old = {r[0]: tuple(r) for r in list(csv.reader(f))[1:]}
    old.update({r[0]: r for r in rows})
    with open("db/seed/city.csv", newline="", encoding="utf-8") as f:
        order = [c["slug"] for c in csv.DictReader(f)]
    rows = [old[s] for s in order if s in old]
with open("db/seed/city_place.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f, lineterminator="\n")
    w.writerow(["slug", "wikidata_id", "latitude", "longitude"])
    w.writerows(rows)
print(found, "of", len(cities), "cities found;", len(rows), "written to db/seed/city_place.csv")
for slug, why in problems:
    print("CHECK", slug, why)

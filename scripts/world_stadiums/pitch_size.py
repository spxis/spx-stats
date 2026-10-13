#!/usr/bin/env python3
"""Pitch length x width of the stadiums in db/seed/soccer_venue_ids.csv, as English Wikipedia's infobox publishes it (CC BY-SA 4.0, revision cited).
Usage: pitch_size.py <raw dir> <kyogijo grounds.data.json> > db/seed/venue_pitch.csv        (no network: reads the files fetch_wikipedia.py saved)
Rows: the 42 grounds kyogijo read by hand (its figure and revision, reused as they are), then every other article whose infobox `dimensions` (or `pitch_size`)
holds exactly one "length x width" pair in metres, feet or yards that a football pitch can have (length 90-120 m, width 50-90 m: Law 1 allows 45-90 but 48.77 is an American football field). Anything else
(a range, a baseball outfield, an oval, an American football field of 109.75 x 48.75 m) is left out and listed on stderr. Nothing is guessed or converted
from other units except yards and feet to metres. `international` says whether the size is within what Law 1 allows for international matches (100-110 x 64-75 m)."""
import csv, glob, gzip, json, os, re, sys
raw, kyo_path = (os.path.expanduser(a) for a in sys.argv[1:3])
YD, FT = 0.9144, 0.3048
ids = [r["qid"] for r in csv.DictReader(open("db/seed/soccer_venue_ids.csv", newline="", encoding="utf-8"))]
rows = {}
for g in json.load(open(kyo_path, encoding="utf-8")):
    if g.get("pitchSize") == "published" and g["wikidata"] in ids:
        p = g["pitch"]
        f = {"m": 1, "yd": YD, "ft": FT}[p["unit"]]
        rows[g["wikidata"]] = dict(wikidata_id=g["wikidata"], length=p["length"], width=p["width"], unit=p["unit"], length_m=round(p["length"] * f, 2),
                                   width_m=round(p["width"] * f, 2), wikipedia_title=g["en"]["title"], revision_id=g["en"]["revision"], source="kyogijo", raw="")

NUM = r"(\d{2,3}(?:[.,]\d{1,2})?)"
SEP = r"\s*(?:x|×|by|&times;|X)\s*"
UNIT = r"(m|metres|meters|yd|yds|yards|ft|feet)"
CONV = r"\{\{\s*(?:convert|cvt)\s*\|\s*" + NUM + r"\s*\|\s*" + UNIT + r"\b[^{}]*\}\}"
PAIRS = [re.compile(r"\{\{\s*(?:convert|cvt)\s*\|\s*" + NUM + r"\s*(?:\||" + SEP + r")\s*(?:(?:x|×|by)\s*\|\s*)?" + NUM + r"\s*\|\s*" + UNIT + r"\b", re.I),
         re.compile(NUM + SEP + NUM + r"\s*" + UNIT + r"\b", re.I),
         re.compile(NUM + r"\s*" + UNIT + SEP + NUM + r"\s*" + UNIT + r"\b", re.I),
         re.compile(CONV + SEP + CONV, re.I)]
unit_of = lambda u: {"metres": "m", "meters": "m", "m": "m", "yd": "yd", "yds": "yd", "yards": "yd", "ft": "ft", "feet": "ft"}[u.lower()]
num = lambda s: float(s.replace(",", "."))
skipped = []
TO_M = {"m": 1, "yd": YD, "ft": FT}


def pairs(val):
    found = []
    for i, rx in enumerate(PAIRS):
        for mm in rx.finditer(val):
            g = mm.groups()
            if i in (2, 3):
                if unit_of(g[1]) != unit_of(g[3]):
                    continue
                found.append((num(g[0]), num(g[2]), unit_of(g[1])))
            else:
                found.append((num(g[0]), num(g[1]), unit_of(g[2])))
        if found:
            break
    return found
titles = {}
for p in sorted(glob.glob(f"{raw}/wikipedia/pages-*.json.gz")):
    d = json.load(gzip.open(p, "rt", encoding="utf-8"))
    redirect = {x["to"]: x["from"] for x in d["query"].get("redirects", [])}
    byfrom = d["spx_qids"]
    for pg in d["query"]["pages"]:
        if "revisions" not in pg:
            continue
        asked = redirect.get(pg["title"], pg["title"])
        qid = byfrom.get(asked)
        if qid is None or qid in rows:
            continue
        text = pg["revisions"][0]["slots"]["main"]["content"]
        m = re.search(r"^\s*\|\s*(?:dimensions|pitch_size|pitch)\s*=\s*(.*?)(?=^\s*\|\s*[a-z_ ]+=|^\}\})", text, re.M | re.S | re.I)
        if not m:
            continue
        val = re.sub(r"<ref[^>]*?/>|<ref[^>]*>.*?</ref>|<!--.*?-->", "", m.group(1), flags=re.S).strip()
        val = re.sub(r"&nbsp;|\xa0", " ", val)
        val = re.sub(r"\[\[(?:metre|metres|yard|yards|foot|feet)\|?([a-z]*)\]\]", r" \1", val, flags=re.I)
        val = re.sub(r"\s+(?:long|wide)\b", "", val, flags=re.I)
        found = pairs(val)
        if len(set(found)) > 1:
            # the same size twice (yards, then metres): take the first; a size labelled "soccer" beats other sports'; otherwise it is ambiguous
            ms = [(max(a, b) * TO_M[u], min(a, b) * TO_M[u]) for a, b, u in found]
            if all(abs(x[0] - ms[0][0]) < 1.5 and abs(x[1] - ms[0][1]) < 1.5 for x in ms):
                found = found[:1]
            elif re.search(r"soccer", val, re.I):
                found = pairs(val[re.search(r"soccer", val, re.I).start():])[:1]
        if len(set(found)) != 1:
            if re.search(r"\d", val):
                skipped.append((qid, pg["title"], "no single pair" if not found else "several pairs", val[:90].replace("\n", " ")))
            continue
        a, b, u = found[0]
        f = {"m": 1, "yd": YD, "ft": FT}[u]
        L, W = round(max(a, b) * f, 2), round(min(a, b) * f, 2)
        if not (90 <= L <= 120 and 50 <= W <= 90):
            skipped.append((qid, pg["title"], "not a football pitch size", val[:90].replace("\n", " ")))
            continue
        rows[qid] = dict(wikidata_id=qid, length=max(a, b), width=min(a, b), unit=u, length_m=L, width_m=W, wikipedia_title=pg["title"],
                         revision_id=pg["revisions"][0]["revid"], source="wikipedia", raw=re.sub(r"\s+", " ", val)[:120])
w = csv.writer(sys.stdout, lineterminator="\n")
w.writerow(["wikidata_id", "length", "width", "unit", "length_m", "width_m", "international", "wikipedia_title", "revision_id", "source", "infobox_text"])
for qid in sorted(rows, key=lambda q: int(q[1:])):
    r = rows[qid]
    inter = 100 <= r["length_m"] <= 110 and 64 <= r["width_m"] <= 75
    w.writerow([qid, f"{r['length']:g}", f"{r['width']:g}", r["unit"], f"{r['length_m']:g}", f"{r['width_m']:g}", "true" if inter else "false",
                r["wikipedia_title"], r["revision_id"], r["source"], r["raw"]])
print(len(rows), "pitch sizes (", sum(1 for r in rows.values() if r["source"] == "kyogijo"), "from kyogijo );", len(skipped), "infobox values left out", file=sys.stderr)
for s in skipped:
    print("left out:", *s, file=sys.stderr)

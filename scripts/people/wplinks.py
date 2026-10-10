#!/usr/bin/env python3
"""Which Wikipedia article does each award winner's name link to? Reads the cached award articles
(scripts/wikipedia_awards/fetch.py) and the winners already read into legacy_wikipedia_awards.winner.
A name that links to exactly one article in its award's page gets that title; one that links to two (two
players of the same name) or none is left for a later step. Writes <out> (JSON: titles, and rows
[award_code, winner_name, title]). Usage: wplinks.py <cache dir> <out.json>"""
import json, os, re, subprocess, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "wikipedia_awards"))
from wikitable import clean
CONN = ["psql", "-h", "/tmp", "-p", "55432", "-U", "postgres", "-d", "spx_stats", "-At", "-F", "\t"]

def norm(s): return re.sub(r"\s+", " ", clean(s)).strip()

def links(text):
    """display name -> set of article titles, for plain links and {{sortname}}."""
    out = {}
    def add(disp, tgt):
        tgt = tgt.split("#")[0].replace("_", " ").strip()
        if disp and tgt and not re.match(r"^(File|Image|Category|Template|Wikipedia):", tgt):
            out.setdefault(norm(disp), set()).add(tgt)
    for m in re.finditer(r"\[\[([^\]|\[]+)(?:\|([^\]\[]*))?\]\]", text):
        add(m.group(2) or m.group(1), m.group(1))
    for m in re.finditer(r"\{\{\s*sortname\s*\|([^{}]*)\}\}", text, re.I):
        a = [x.strip() for x in m.group(1).split("|")]
        pos = [x for x in a if "=" not in x]
        kw = {x.split("=", 1)[0].strip(): x.split("=", 1)[1].strip() for x in a if "=" in x}
        if kw.get("nolink"): continue
        if len(pos) < 2: continue
        name = f"{pos[0]} {pos[1]}".strip()
        dab = kw.get("dab") or (pos[2] if len(pos) > 2 else "")
        add(name, dab if dab.startswith(name) else f"{name} ({dab})" if dab else name)
    return out

cache, out = sys.argv[1], sys.argv[2]
rows = subprocess.run(CONN + ["-c", "select distinct w.award_code, w.winner_name from legacy_wikipedia_awards.winner w join legacy_wikipedia_awards.article a using (award_code) where not a.winners_are_teams"],
                      capture_output=True, text=True, check=True).stdout.strip().split("\n")
by = {}
for r in rows:
    c, n = r.split("\t"); by.setdefault(c, []).append(n)
res, miss, amb = [], 0, 0
for code, names in sorted(by.items()):
    p = f"{cache}/{code}.wikitext"
    if not os.path.exists(p): continue
    lk = links(open(p, encoding="utf-8").read())
    for n in names:
        t = lk.get(n, set())
        if len(t) == 1: res.append([code, n, next(iter(t))])
        elif t: amb += 1
        else: miss += 1
titles = sorted({r[2] for r in res})
json.dump({"titles": titles, "rows": res}, open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(len(res), "names linked,", amb, "ambiguous,", miss, "without a link;", len(titles), "titles")

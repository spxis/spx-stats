#!/usr/bin/env python3
"""Rebuild scripts/wikidata_dump/occupations.tsv, the fixed list of sport occupations that filter.py matches (P106).

  python3 -I scripts/wikidata_dump/occupations.py            writes occupations.tsv next to this file (one SPARQL request)

The list is every item that is a subclass (P279, any depth) of one of ROOTS on Wikidata (CC0). The file is COMMITTED: filter.py never
asks Wikidata, so a run on the NAS is the same on every day. Rerun this only when the list should grow, and read the diff.

Columns: qid, en label, roots (comma list), use (1 or 0), why. `use` is 0 for an occupation that must not match and must not be kept
in a person's P106: it says the sex or gender of the person ("female athlete"), an ethnicity ("Mexican American athletes"), a
role that is not sport (a hunter, a dragonslayer, a club president), or a metaclass. Nothing about sex or gender, ethnicity, religion,
health, family or politics is collected (AGENTS.md, section 3).
"""
from __future__ import annotations

import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "occupations.tsv"
UA = "spx-stats/wikidata-dump (https://spxn.com; john@spxis.com)"
ROOTS = {
    "Q2066131": "athlete",
    "Q41583": "coach",
    "Q202648": "referee",
    "Q15986539": "sports official",
}
QUERY = """SELECT ?c ?l ?root WHERE {
  VALUES ?root { %s }
  ?c wdt:P279* ?root .
  OPTIONAL { ?c rdfs:label ?l FILTER(lang(?l) = "en") }
}""" % " ".join(f"wd:{q}" for q in ROOTS)

# sex or gender, sexuality, ethnicity, religion: never collected
SENSITIVE_RE = re.compile(
    r"(?<!-)\b(male|female|men|women|man|woman|boy|boys|girl|girls|transgender|gay|lesbian|jewish|muslim|christian|hispanic|latino|latina|ethnic)\b"
    r"|sportsm[ae]n|sportswom[ae]n"
    r"|\b(african|mexican|asian|chinese|japanese|korean|irish|italian|native|puerto rican) americans?\b",
    re.I,
)
# not a sport occupation (the strict rule also needs P641, so these almost never matter; they are left out so nothing odd is kept)
NOISE_RE = re.compile(r"^president of |^(the )?(hunter|huntsman|trapper|mermaid|dragonslayer|fictional dragonslayer|vampire hunter|devil hunter)s?$", re.I)
NOISE_EXACT = {
    "bow hunter", "fox hunter", "professional hunter", "chasseur de Prinkères", "Dungeon Master", "turning gamemaster", "Cleaners",
    "bicycle courier", "Spanish paratrooper", "pararescueman", "songbird sporter", "STONED", "Griffin", "Taimanin ninja",
    "Neutral banner", "Icefall Doctors", "flight controller", "wing trimmer", "parachuting animals", "underwater photographer",
    "climbing YouTuber", "skiing reporter", "summiter", "Tomás Porra", "Masoud karim vand", "Dieudonne Munezero", "WikiTrainer",
    "winner of a music competition", "Japanese divers in Russia", "cheese roller", "Sardar", "Mestre", "lukkari",
}
META_RE = re.compile(r" (who play|players who|that|coach\(es\) coaching|who coaches|who competes|in this )|foreign players in sports leagues|this (club|competition|team)", re.I)


def classify(label: str) -> tuple[int, str]:
    if SENSITIVE_RE.search(label):
        return 0, "sensitive"
    if label in NOISE_EXACT or NOISE_RE.search(label):
        return 0, "not sport"
    if META_RE.search(label):
        return 0, "metaclass"
    return 1, ""


def fetch() -> list[tuple[str, str, str]]:
    req = urllib.request.Request(
        "https://query.wikidata.org/sparql",
        data=urllib.parse.urlencode({"query": QUERY}).encode(),
        headers={"User-Agent": UA, "Accept": "application/sparql-results+json"},
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        data = json.loads(r.read().decode("utf-8"))
    rows = []
    for b in data["results"]["bindings"]:
        qid = b["c"]["value"].rsplit("/", 1)[-1]
        root = b["root"]["value"].rsplit("/", 1)[-1]
        label = b.get("l", {}).get("value", "")
        if re.fullmatch(r"Q[0-9]+", qid):
            rows.append((qid, label, root))
    return rows


def main() -> int:
    rows = fetch()
    by: dict[str, dict] = {}
    for qid, label, root in rows:
        e = by.setdefault(qid, {"label": label, "roots": set()})
        e["roots"].add(root)
        if label and not e["label"]:
            e["label"] = label
    lines = [
        "# Sport occupations for scripts/wikidata_dump/filter.py (P106). Built by occupations.py from Wikidata (CC0): subclasses (P279*) of "
        + ", ".join(f"{q} {n}" for q, n in ROOTS.items()) + ".",
        "# use = 0: kept out of matching and out of the output (sex or gender, ethnicity, not a sport, metaclass). Rebuild with occupations.py.",
        "qid\tlabel\troots\tuse\twhy",
    ]
    n_use = 0
    for qid in sorted(by, key=lambda q: int(q[1:])):
        e = by[qid]
        use, why = classify(e["label"])
        n_use += use
        lines.append(f"{qid}\t{e['label'].replace(chr(9), ' ')}\t{','.join(sorted(e['roots']))}\t{use}\t{why}")
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {OUT.name}: {len(by)} occupations, {n_use} used, {len(by) - n_use} excluded")
    return 0


if __name__ == "__main__":
    sys.exit(main())

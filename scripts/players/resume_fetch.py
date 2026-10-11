#!/usr/bin/env python3
"""The sports resume of the people we hold, from Wikidata (CC0), raw first.

  resume_fetch.py persons <raw dir>   P54 teams, P69 educated at, P647 drafted by (with their dates and draft qualifiers)
  resume_fetch.py items <raw dir>     the clubs, schools and draft teams those statements name: label, instance of (P31),
                                      league (P118), sport (P641), country (P17), subclass of (P279)

Same rules as scripts/people/fetch.py, whose request loop it uses: one request every two seconds with the project's
User-Agent, a file that exists is never fetched again, and only the properties and qualifiers listed here are kept
(nothing about ethnicity, religion, health, sex or gender, family or politics is asked for or written)."""
import importlib.util, json, os, subprocess, sys, urllib.parse
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("pf", os.path.join(HERE, "..", "people", "fetch.py"))
pf = importlib.util.module_from_spec(spec); spec.loader.exec_module(pf)
PERSON_PROPS = {"P54": {"P580", "P582", "P1350", "P1351", "P2321"}, "P69": {"P580", "P582", "P512", "P812"},
                "P647": {"P585", "P1352", "P1545", "P1350", "P2321"}}
ITEM_PROPS = {"P31": set(), "P118": set(), "P641": set(), "P17": set(), "P279": set()}

def prune_with(props):
    def prune(e):
        out = {"id": e.get("id"), "type": e.get("type")}
        if "missing" in e: out["missing"] = True; return out
        lab = (e.get("labels") or {}).get("en")
        if lab: out["labels"] = {"en": {"value": lab["value"]}}
        cl = {}
        for p, lst in (e.get("claims") or {}).items():
            if p not in props: continue
            keep = []
            for c in lst:
                d = {"mainsnak": {"snaktype": c["mainsnak"]["snaktype"], "datavalue": c["mainsnak"].get("datavalue")}, "rank": c.get("rank")}
                if d["mainsnak"]["datavalue"] is None: del d["mainsnak"]["datavalue"]
                q = {k: v for k, v in (c.get("qualifiers") or {}).items() if k in props[p]}
                if q: d["qualifiers"] = {k: [{"snaktype": s["snaktype"], **({"datavalue": s["datavalue"]} if "datavalue" in s else {})} for s in v] for k, v in q.items()}
                keep.append(d)
            if keep: cl[p] = keep
        if cl: out["claims"] = cl
        return out
    return prune

def run(ids, prefix, raw, props):
    pf.prune = prune_with(props)
    pf.entities(ids, prefix, raw)

if __name__ == "__main__":
    c, raw = sys.argv[1], sys.argv[2]
    os.makedirs(raw, exist_ok=True)
    if c == "persons":
        ids = subprocess.run(pf.CONN + ["-c", "select external_key from core.external_id where entity_kind='person' and source_id=(select source_id from meta.source where code='wikidata') order by 1"],
                             capture_output=True, text=True, check=True).stdout.split()
        print(len(ids), "persons"); run(ids, "rpersons", raw, PERSON_PROPS)
    elif c == "items":
        ents = pf.qids_from(raw, "rpersons")
        want = sorted(pf.refs(ents, list(PERSON_PROPS)) - set(ents), key=lambda x: int(x[1:]))
        print(len(want), "items"); run(want, "ritems", raw, ITEM_PROPS)
        items = pf.qids_from(raw, "ritems")
        more = sorted(pf.refs(items, ["P118", "P31", "P279", "P17", "P641"]) - set(items) - set(ents), key=lambda x: int(x[1:]))
        print(len(more), "leagues, kinds, countries"); run(more, "rmore", raw, {"P31": set(), "P279": set(), "P17": set()})

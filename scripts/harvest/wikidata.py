"""Wikidata (CC0): the team-membership query, and pruning and reading of items.

Only the properties listed here are ever kept, archived or written to a table. Nothing about ethnicity, religion, health, sex or gender, family or
politics is requested into a table: wbgetentities returns every statement of an item, so the answer is pruned to KEEP before it is archived.
"""
import json
import re

PERSON_PROPS = {"P569", "P570", "P19", "P27", "P413", "P2048", "P2067"}   # birth, death, birth place, citizenship, position, height, mass
LABEL_PROPS = {"P297", "P298", "P17", "P31"}                              # ISO 3166 alpha-2 and alpha-3, country, instance of

TEAM_QUERY = """SELECT ?person ?name ?start ?startPrec ?end ?endPrec ?rank WHERE {
  ?person p:P54 ?st . ?st ps:P54 wd:%s . ?st wikibase:rank ?rank .
  OPTIONAL { ?st pqv:P580 [ wikibase:timeValue ?start ; wikibase:timePrecision ?startPrec ] }
  OPTIONAL { ?st pqv:P582 [ wikibase:timeValue ?end ; wikibase:timePrecision ?endPrec ] }
  OPTIONAL { ?person rdfs:label ?name FILTER(lang(?name) = "en") }
} ORDER BY ?person ?start ?end ?rank LIMIT 20000"""

_QID = re.compile(r"^Q[1-9]\d*$")


def is_qid(s):
    return bool(_QID.match(s or ""))


def parse_time(v):
    """'+1956-12-07T00:00:00Z' -> ('1956-12-07', precision-agnostic date). A month or year precision date gets day/month 01 (the precision says which part is real)."""
    m = re.match(r"^([+-]?)(\d{1,4})-(\d{2})-(\d{2})T", v or "")
    if not m or m.group(1) == "-":
        return None
    y, mo, d = int(m.group(2)), int(m.group(3)) or 1, int(m.group(4)) or 1
    if y < 1 or not (1 <= mo <= 12) or not (1 <= d <= 31):
        return None
    return "%04d-%02d-%02d" % (y, mo, d)


def members(body, team_qid):
    """The SPARQL JSON answer -> rows of legacy_wikidata_harvest.team_member (without archive columns), in the order Wikidata sent them."""
    rows = []
    for b in json.loads(body)["results"]["bindings"]:
        q = b["person"]["value"].rsplit("/", 1)[-1]
        if not is_qid(q):
            continue
        g = lambda k: b[k]["value"] if k in b else None
        rows.append({"person_qid": q, "person_label": g("name"), "rank": (g("rank") or "").rsplit("#", 1)[-1].replace("Rank", "").lower() or None,
                     "start_on": parse_time(g("start")), "start_prec": int(g("startPrec")) if g("startPrec") else None,
                     "end_on": parse_time(g("end")), "end_prec": int(g("endPrec")) if g("endPrec") else None})
    return rows


def prune_entity(e, keep):
    """One wbgetentities item -> the small object that is archived and read."""
    out = {"id": e.get("id")}
    if "lastrevid" in e:
        out["lastrevid"] = e["lastrevid"]
    if "missing" in e:
        out["missing"] = True
        return out
    if e.get("redirects"):
        out["redirects"] = e["redirects"]
    lab = (e.get("labels") or {}).get("en")
    if lab:
        out["label"] = lab.get("value")
    sl = (e.get("sitelinks") or {}).get("enwiki")
    if sl:
        out["enwiki"] = sl.get("title")
    cl = {}
    for p, lst in (e.get("claims") or {}).items():
        if p not in keep:
            continue
        kept = []
        for c in lst:
            ms = c.get("mainsnak", {})
            d = {"rank": c.get("rank"), "snaktype": ms.get("snaktype")}
            if "datavalue" in ms:
                d["value"] = ms["datavalue"].get("value")
                d["type"] = ms["datavalue"].get("type")
            kept.append(d)
        if kept:
            cl[p] = kept
    if cl:
        out["claims"] = cl
    return out


def prune_response(body, keep_by_id, default_keep=PERSON_PROPS):
    """The raw wbgetentities JSON -> {"entities": {qid: pruned}} (keeps the requested ids that came back as redirects too).
    keep_by_id maps a Q-number to the property set to keep for it."""
    d = json.loads(body)
    out = {}
    for qid, e in (d.get("entities") or {}).items():
        out[qid] = prune_entity(e, keep_by_id.get(qid, default_keep))
    return {"entities": out}


def claim_rows(qid, claims):
    """Pruned claims -> rows of legacy_wikidata_harvest.claim."""
    rows = []
    for prop, lst in (claims or {}).items():
        for n, c in enumerate(lst):
            if c.get("snaktype") != "value":
                continue
            v, t = c.get("value"), c.get("type")
            r = {"qid": qid, "prop": prop, "n": n, "rank": c.get("rank"), "value_qid": None, "value_on": None, "value_prec": None, "value_num": None,
                 "unit_qid": None, "value_text": None}
            if t == "wikibase-entityid" and isinstance(v, dict):
                r["value_qid"] = v.get("id")
            elif t == "time" and isinstance(v, dict):
                r["value_on"], r["value_prec"] = parse_time(v.get("time")), v.get("precision")
            elif t == "quantity" and isinstance(v, dict):
                try:
                    r["value_num"] = float(v.get("amount"))
                except (TypeError, ValueError):
                    continue
                u = v.get("unit", "")
                r["unit_qid"] = u.rsplit("/", 1)[-1] if u.startswith("http") else None
            elif t == "string":
                r["value_text"] = v
            else:
                continue
            rows.append(r)
    return rows

"""Wikidata (CC0): the team-membership query, and pruning and reading of items.

Only the properties listed here are ever kept, archived or written to a table. Nothing about ethnicity, religion, health, sex or gender, family or
politics is requested into a table: wbgetentities returns every statement of an item, so the answer is pruned to KEEP before it is archived.
"""
import json
import re
from datetime import date

PERSON_PROPS = {"P569", "P570", "P19", "P27", "P413", "P2048", "P2067"}   # birth, death, birth place, citizenship, position, height, mass
LABEL_PROPS = {"P297", "P298", "P17", "P31"}                              # ISO 3166 alpha-2 and alpha-3, country, instance of
GREGORIAN = "http://www.wikidata.org/entity/Q1985727"
HUMAN = "Q5"

TEAM_QUERY = """SELECT ?person ?name ?start ?startPrec ?startCal ?end ?endPrec ?endCal ?rank WHERE {
  ?person p:P54 ?st . ?st ps:P54 wd:%s . ?st wikibase:rank ?rank .
  OPTIONAL { ?st pqv:P580 [ wikibase:timeValue ?start ; wikibase:timePrecision ?startPrec ; wikibase:timeCalendarModel ?startCal ] }
  OPTIONAL { ?st pqv:P582 [ wikibase:timeValue ?end ; wikibase:timePrecision ?endPrec ; wikibase:timeCalendarModel ?endCal ] }
  OPTIONAL { ?person rdfs:label ?name FILTER(lang(?name) = "en") }
} ORDER BY ?person ?start ?end ?rank LIMIT 20000"""

_QID = re.compile(r"^Q[1-9]\d*$")


def is_qid(s):
    return bool(_QID.match(s or ""))


def _title_key(title):
    """MediaWiki title normalization for spaces/underscores and first-letter case only."""
    value = " ".join((title or "").replace("_", " ").split())
    return (value[:1].upper() + value[1:])


def resolve_title_pages(body, requested_titles):
    """Resolve exact linked page titles (including MediaWiki normalization/redirects) to pageprops QIDs."""
    query = json.loads(body).get("query", {})
    aliases = {}
    for row in query.get("normalized", []) + query.get("redirects", []):
        aliases[row.get("from")] = row.get("to")
    pages = {page.get("title"): page for page in query.get("pages", [])}
    out = {}
    for requested in requested_titles:
        resolved = requested
        for _ in range(8):
            next_title = aliases.get(resolved)
            if not next_title or next_title == resolved:
                break
            resolved = next_title
        page = pages.get(resolved)
        if page is None:
            matches = [p for title, p in pages.items() if _title_key(title) == _title_key(resolved)]
            page = matches[0] if len(matches) == 1 else None
        qid = ((page or {}).get("pageprops") or {}).get("wikibase_item")
        if page and not page.get("missing") and is_qid(qid):
            out[requested] = {"qid": qid, "title": page.get("title"), "pageid": page.get("pageid")}
    return out


def title_people(body, candidates):
    """Keep pageprop candidates only when their canonical sitelink and non-deprecated P31 confirm a human item."""
    entities = json.loads(body).get("entities", {})
    out = {}
    for requested, candidate in candidates.items():
        qid = candidate["qid"]
        entity = entities.get(qid) or {}
        sitelink = (entity.get("sitelinks") or {}).get("enwiki", {}).get("title")
        human = any(
            statement.get("rank") != "deprecated"
            and ((statement.get("mainsnak") or {}).get("datavalue") or {}).get("value", {}).get("id") == HUMAN
            for statement in (entity.get("claims") or {}).get("P31", [])
        )
        if not entity.get("missing") and is_qid(qid) and _title_key(sitelink) == _title_key(candidate["title"]) and human:
            out[requested] = {"qid": qid, "title": sitelink, "lastrevid": entity.get("lastrevid")}
    return out


def prune_title_lookup(wikipedia_body, wikidata_body, requested_titles, candidates, people):
    """Keep only canonical title, pageprop QID and P31 evidence needed to archive this lookup."""
    query = json.loads(wikipedia_body).get("query", {})
    aliases = {}
    for row in query.get("normalized", []) + query.get("redirects", []):
        aliases[row.get("from")] = row.get("to")
    pages = {page.get("title"): page for page in query.get("pages", [])}
    raw_entities = json.loads(wikidata_body).get("entities", {})
    archived = {"wikipedia_pageprops_raw": wikipedia_body.decode("utf-8"), "pages": [], "entities": {}}
    for requested in sorted(requested_titles):
        resolved = requested
        for _ in range(8):
            next_title = aliases.get(resolved)
            if not next_title or next_title == resolved:
                break
            resolved = next_title
        page = pages.get(resolved)
        if page is None:
            matches = [p for title, p in pages.items() if _title_key(title) == _title_key(resolved)]
            page = matches[0] if len(matches) == 1 else None
        candidate = candidates.get(requested)
        archived["pages"].append({"requested_title": requested, "canonical_title": (candidate or {}).get("title") or (page or {}).get("title"),
                                  "qid": (candidate or {}).get("qid") or (((page or {}).get("pageprops") or {}).get("wikibase_item")),
                                  "pageid": (candidate or {}).get("pageid") or (page or {}).get("pageid"),
                                  "missing": bool(not page or page.get("missing"))})
    for requested, match in people.items():
        raw = raw_entities.get(match["qid"], {})
        entity = archived["entities"].setdefault(match["qid"], {
            "id": match["qid"], "lastrevid": match.get("lastrevid"), "enwiki": match["title"], "requested_titles": [],
            "claims": {"P31": [
                {"rank": c.get("rank"), "id": (((c.get("mainsnak") or {}).get("datavalue") or {}).get("value") or {}).get("id")}
                for c in (raw.get("claims") or {}).get("P31", [])
            ]},
        })
        entity["requested_titles"].append(requested)
    for entity in archived["entities"].values():
        entity["requested_titles"].sort()
    return archived


def parse_time(v, calendar_model=GREGORIAN):
    """'+1956-12-07T00:00:00Z' -> ('1956-12-07', precision-agnostic date). A month or year precision date gets day/month 01 (the precision says which part is real)."""
    m = re.match(r"^([+-]?)(\d{1,4})-(\d{2})-(\d{2})T", v or "")
    if not m or m.group(1) == "-" or calendar_model != GREGORIAN:
        return None
    y, mo, d = int(m.group(2)), int(m.group(3)) or 1, int(m.group(4)) or 1
    try:
        # Wikidata's year/month placeholders (00) become a stored lower-bound
        # date, with value_prec retaining what is actually known. Validate any
        # supplied month/day as a real Gregorian calendar date before casting
        # to Postgres DATE; an impossible exact day is stored as unknown.
        parsed = date(y, mo, d)
    except ValueError:
        return None
    return parsed.isoformat()


def invalid_time_claims(entities):
    """Describe invalid P569/P570 Wikidata times that will be stored as NULL.

    The exact (privacy-filtered) source value remains in the archived answer;
    this short request note makes the conversion issue visible without a schema
    change or a guessed replacement date.
    """
    issues = []
    for qid, entity in sorted(entities.items()):
        for prop in ("P569", "P570"):
            for claim in entity.get("claims", {}).get(prop, []):
                if claim.get("snaktype") != "value" or claim.get("type") != "time":
                    continue
                value = claim.get("value") or {}
                if parse_time(value.get("time"), value.get("calendarmodel")) is None:
                    issues.append("%s/%s value=%s precision=%s calendar=%s" % (
                        qid, prop, value.get("time", "unknown"), value.get("precision", "unknown"),
                        (value.get("calendarmodel") or "unknown").rsplit("/", 1)[-1]))
    return issues


def members(body, team_qid):
    """The SPARQL JSON answer -> rows of legacy_wikidata_harvest.team_member (without archive columns), in the order Wikidata sent them."""
    rows = []
    for b in json.loads(body)["results"]["bindings"]:
        q = b["person"]["value"].rsplit("/", 1)[-1]
        if not is_qid(q):
            continue
        g = lambda k: b[k]["value"] if k in b else None
        rows.append({"person_qid": q, "person_label": g("name"), "rank": (g("rank") or "").rsplit("#", 1)[-1].replace("Rank", "").lower() or None,
                     "start_on": parse_time(g("start"), g("startCal")), "start_prec": int(g("startPrec")) if g("startPrec") else None,
                     "end_on": parse_time(g("end"), g("endCal")), "end_prec": int(g("endPrec")) if g("endPrec") else None})
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
                r["value_on"], r["value_prec"] = parse_time(v.get("time"), v.get("calendarmodel")), v.get("precision")
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

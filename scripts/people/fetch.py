#!/usr/bin/env python3
"""Fetch the people behind the award winners from Wikidata (CC0) and Wikipedia (page ids only), raw first.

  fetch.py titles <wplinks.json> <raw dir>   the person items named by Wikipedia article titles (wbgetentities, 50 titles a call)
  fetch.py persons <raw dir>                 the other person items, by Wikidata id (50 ids a call)
  fetch.py items <raw dir>                   the places, countries, teams, positions and honours those items name
  fetch.py labels <raw dir> <qids file>      names for items whose answer carried no English label (one id a line, 50 a call)
  fetch.py labelseed <raw dir> <csv>         the labels-*.json files of <raw dir> as db/seed/wikidata_label.csv (qid,label,language)

Every answer is saved as compact JSON in <raw dir>; a file that exists is never fetched again. At most one request
every 2 seconds, with the project's User-Agent; a 429 or 5xx backs off and retries.

Privacy: only the properties listed in KEEP are kept from an entity, and only the qualifiers in QUAL, before anything
is written. Ethnicity, religion, health, sex or gender, family, politics and the rest of what Wikidata may hold about a
person are dropped in memory and never reach a file or the database."""
import json, os, re, ssl, subprocess, sys, time, urllib.error, urllib.parse, urllib.request
UA = "spx-stats/0.1 (https://github.com/spxis/spx-stats)"
ca = os.environ.get("SSL_CERT_FILE") or "/root/.ccr/ca-bundle.crt"
CTX = ssl.create_default_context(cafile=ca) if os.path.exists(ca) else ssl.create_default_context()
CONN = ["psql", "-h", "/tmp", "-p", "55432", "-U", "postgres", "-d", "spx_stats", "-At"]
# name P569 birth date, P570 death date, P19/P20 birth/death place, P27 citizenship, P2048 height, P413 position,
# P741 playing hand, P423 shooting handedness, P54 teams, P166 awards received, P625 coordinates, P17 country,
# P297/P298 ISO country codes, P641 sport, P31 instance of, P106 occupation
KEEP = {"P31", "P106", "P569", "P570", "P19", "P20", "P27", "P2048", "P413", "P741", "P423", "P54", "P166", "P625", "P17", "P297", "P298", "P641"}
QUAL = {"P580", "P582", "P585"}
_last = [0.0]

def get(url, tries=40):
    delay = 10
    for _ in range(tries):
        w = 2.1 - (time.time() - _last[0])
        if w > 0: time.sleep(w)
        _last[0] = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=90, context=CTX) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                ra = e.headers.get("Retry-After")
                time.sleep(int(ra) + 3 if ra and ra.isdigit() else delay); delay = min(delay * 2, 240); continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(delay); delay = min(delay * 2, 240)
    raise RuntimeError("giving up on " + url[:120])

def save(path, doc):
    with open(path, "w", encoding="utf-8") as f: f.write(json.dumps(doc, ensure_ascii=False, separators=(",", ":")))

def prune(e):
    """Keep the name, the English article title and the allow-listed claims; nothing else."""
    out = {"id": e.get("id"), "type": e.get("type")}
    if "missing" in e:
        out["missing"] = True
        for k in ("site", "title"):
            if k in e: out[k] = e[k]
        return out
    # A name that reads the same in every language is stored under "mul" only, with no "en" label: take it as the name.
    labs = e.get("labels") or {}
    lab = labs.get("en") or labs.get("mul")
    if lab: out["labels"] = {lab.get("language", "en"): {"value": lab["value"]}}
    sl = (e.get("sitelinks") or {}).get("enwiki")
    if sl: out["sitelinks"] = {"enwiki": {"title": sl["title"]}}
    cl = {}
    for p, lst in (e.get("claims") or {}).items():
        if p not in KEEP: continue
        keep = []
        for c in lst:
            d = {"mainsnak": {"snaktype": c["mainsnak"]["snaktype"], "datavalue": c["mainsnak"].get("datavalue")}, "rank": c.get("rank")}
            if d["mainsnak"]["datavalue"] is None: del d["mainsnak"]["datavalue"]
            q = {k: v for k, v in (c.get("qualifiers") or {}).items() if k in QUAL}
            if q: d["qualifiers"] = {k: [{"snaktype": s["snaktype"], **({"datavalue": s["datavalue"]} if "datavalue" in s else {})} for s in v] for k, v in q.items()}
            keep.append(d)
        if keep: cl[p] = keep
    if cl: out["claims"] = cl
    return out

def batches(xs, n=50): return [xs[i:i + n] for i in range(0, len(xs), n)]

def entities(ids, prefix, raw, titles=False):
    for i, b in enumerate(batches(ids), 1):
        p = f"{raw}/{prefix}-{i:03d}.json"
        if os.path.exists(p): continue
        q = urllib.parse.urlencode({"action": "wbgetentities", **({"sites": "enwiki", "titles": "|".join(b)} if titles else {"ids": "|".join(b)}),
                                    "props": "labels|claims|sitelinks", "languages": "en|mul", "sitefilter": "enwiki", "format": "json", "formatversion": "2"})
        d = get("https://www.wikidata.org/w/api.php?" + q)
        if "error" in d: raise RuntimeError(json.dumps(d["error"])[:300])
        ents = d.get("entities") or {}
        if isinstance(ents, list): ents = {e["id"]: e for e in ents}
        doc = {"requested": b, "entities": {k: prune(v) for k, v in ents.items()}}
        # an item merged into another answers under the new id; keep the pairing
        redir = {r["from"]: r["to"] for e in (d.get("entities") or {}).values() if isinstance(e, dict) for r in [e.get("redirects")] if r}
        if redir: doc["redirects"] = redir
        save(p, doc); print(p, len(doc["entities"]), flush=True)

def qids_from(raw, *prefixes):
    out = {}
    for f in sorted(os.listdir(raw)):
        if any(f.startswith(p + "-") for p in prefixes):
            d = json.load(open(f"{raw}/{f}", encoding="utf-8"))
            for k, e in d["entities"].items():
                if not e.get("missing"): out[e.get("id", k)] = e
    return out

def refs(ents, props):
    s = set()
    for e in ents.values():
        for p in props:
            for c in (e.get("claims") or {}).get(p, []):
                dv = c["mainsnak"].get("datavalue")
                if dv and dv["type"] == "wikibase-entityid": s.add(dv["value"]["id"])
    return s

def cmd_titles(links, raw):
    """English Wikipedia titles straight to Wikidata items (wbgetentities by site and title: wikidata.org answers
    this host; en.wikipedia.org's API rate-limits it)."""
    entities(json.load(open(links, encoding="utf-8"))["titles"], "persontitles", raw, titles=True)

def cmd_labels(raw, qids_file):
    """Only the names of items that have none in the raw files (an English label, else the all-languages "mul" one)."""
    ids = sorted({l.strip() for l in open(qids_file, encoding="utf-8") if re.fullmatch(r"Q[0-9]+", l.strip())}, key=lambda x: int(x[1:]))
    for i, b in enumerate(batches(ids), 1):
        p = f"{raw}/labels-{i:03d}.json"
        if os.path.exists(p): continue
        q = urllib.parse.urlencode({"action": "wbgetentities", "ids": "|".join(b), "props": "labels|sitelinks", "languages": "en|mul",
                                    "sitefilter": "enwiki", "format": "json", "formatversion": "2"})
        d = get("https://www.wikidata.org/w/api.php?" + q)
        if "error" in d: raise RuntimeError(json.dumps(d["error"])[:300])
        ents = d.get("entities") or {}
        if isinstance(ents, list): ents = {e["id"]: e for e in ents}
        save(p, {"requested": b, "entities": {k: prune(v) for k, v in ents.items()}}); print(p, len(ents), flush=True)

def cmd_labelseed(raw, csv_path):
    import csv
    rows = {}
    for f in sorted(os.listdir(raw)):
        if not f.startswith("labels-"): continue
        for k, e in json.load(open(f"{raw}/{f}", encoding="utf-8"))["entities"].items():
            for lang, v in (e.get("labels") or {}).items(): rows.setdefault(e.get("id", k), (lang, v["value"]))
    with open(csv_path, "w", encoding="utf-8", newline="") as o:
        w = csv.writer(o, lineterminator="\n"); w.writerow(["qid", "label", "language"])
        for qid in sorted(rows, key=lambda x: int(x[1:])): w.writerow([qid, rows[qid][1], rows[qid][0]])
    print(len(rows), "labels")

def person_ids(raw):
    ids = set(subprocess.run(CONN + ["-c", "select distinct regexp_replace(row->>'winner', '.*/', '') from legacy_wikidata.result where query_name = 'award_winners' and row->>'isHuman' = 'true'"],
                             capture_output=True, text=True, check=True).stdout.split())
    return sorted(ids - set(qids_from(raw, "persontitles")), key=lambda x: int(x[1:]))

if __name__ == "__main__":
    c = sys.argv[1]
    if c == "titles": cmd_titles(sys.argv[2], sys.argv[3])
    elif c == "labels": cmd_labels(sys.argv[2], sys.argv[3])
    elif c == "labelseed": cmd_labelseed(sys.argv[2], sys.argv[3])
    elif c == "persons":
        raw = sys.argv[2]; ids = person_ids(raw); print(len(ids), "persons"); entities(ids, "persons", raw)
    elif c == "items":
        raw = sys.argv[2]
        ents = qids_from(raw, "persons", "persontitles")
        have = set(ents)
        want = sorted(refs(ents, ["P19", "P20", "P27", "P413", "P741", "P423", "P54", "P166"]) - have, key=lambda x: int(x[1:]))
        print(len(want), "items"); entities(want, "items", raw)
        items = qids_from(raw, "items")
        more = sorted(refs(items, ["P17", "P641"]) - have - set(items), key=lambda x: int(x[1:]))
        print(len(more), "countries and sports"); entities(more, "countries", raw)

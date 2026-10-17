#!/usr/bin/env python3
"""Fetch Wikidata P1618 (sport number) for people in the five leagues. CC0.

One SPARQL request per league (ice hockey, basketball, American football,
baseball, Canadian football), 2.5 s apart, identified User-Agent. Terms: Wikidata
is CC0; no Sports Reference, ESPN or NHL endpoint is contacted.

Usage: wikidata_numbers.py [--out FILE]
"""
import argparse, json, os, ssl, sys, time, urllib.error, urllib.parse, urllib.request

UA = "spx-stats/0.1 (https://github.com/spxis/spx-stats; jersey numbers)"
ENDPOINT = "https://query.wikidata.org/sparql"
ca = os.environ.get("SSL_CERT_FILE") or "/root/.ccr/ca-bundle.crt"
CTX = ssl.create_default_context(cafile=ca) if os.path.exists(ca) else ssl.create_default_context()
_last = [0.0]

# P641 sport items. Ice hockey covers NHL and its rivals; American football covers
# the NFL/AFL/AAFC; Canadian football the CFL. A person in two sports is returned twice.
SPORTS = [
    ("ice_hockey", "Q41466"),
    ("basketball", "Q5372"),
    ("american_football", "Q41323"),
    ("baseball", "Q5369"),
    ("canadian_football", "Q248534"),
]

QUERY = """
SELECT ?person ?number ?team ?teamLabel ?from ?to ?stmt WHERE {
  ?person wdt:P31 wd:Q5 ;
          wdt:P641 wd:%s ;
          p:P1618 ?stmt .
  ?stmt ps:P1618 ?number .
  OPTIONAL { ?stmt pq:P54 ?team . }
  OPTIONAL { ?stmt pq:P580 ?from . }
  OPTIONAL { ?stmt pq:P582 ?to . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
"""


def wait():
    w = 2.5 - (time.time() - _last[0])
    if w > 0:
        time.sleep(w)
    _last[0] = time.time()


def year_of(v):
    if not v:
        return None
    m = str(v)
    return int(m[:4]) if len(m) >= 4 and m[:4].isdigit() else None


def qid_of(uri):
    if not uri:
        return None
    return uri.rsplit("/", 1)[-1] if uri.rsplit("/", 1)[-1].startswith("Q") else None


def number_of(v):
    if v is None:
        return None
    s = str(v).strip()
    if s == "00":
        return 0
    try:
        n = int(float(s))
    except ValueError:
        return None
    return n if 0 <= n <= 99 else None


def run(sport_qid):
    wait()
    body = urllib.parse.urlencode({"query": QUERY % sport_qid, "format": "json"}).encode()
    req = urllib.request.Request(ENDPOINT, data=body, headers={
        "User-Agent": UA,
        "Accept": "application/sparql-results+json",
        "Content-Type": "application/x-www-form-urlencoded",
    })
    delay = 15
    for _ in range(6):
        try:
            with urllib.request.urlopen(req, timeout=120, context=CTX) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (429,) or e.code >= 500:
                time.sleep(delay)
                delay = min(delay * 2, 300)
                continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(delay)
            delay = min(delay * 2, 300)
    raise RuntimeError("Wikidata SPARQL failed for " + sport_qid)


def rows_of(data, sport):
    out = []
    for b in data.get("results", {}).get("bindings", []):
        qid = qid_of((b.get("person") or {}).get("value"))
        number = number_of((b.get("number") or {}).get("value"))
        stmt = (b.get("stmt") or {}).get("value") or ""
        if not qid or number is None or not stmt:
            continue
        out.append({
            "qid": qid,
            "jersey_number": number,
            "team_qid": qid_of((b.get("team") or {}).get("value")),
            "team_label": (b.get("teamLabel") or {}).get("value") or None,
            "from_year": year_of((b.get("from") or {}).get("value")),
            "to_year": year_of((b.get("to") or {}).get("value")),
            "statement": stmt.rsplit("/", 1)[-1],
            "sport": sport,
        })
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="raw/wikidata_jersey/sport_number.json")
    a = ap.parse_args()
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    all_rows = []
    for sport, qid in SPORTS:
        data = run(qid)
        part = rows_of(data, sport)
        print(sport, len(part))
        all_rows.extend(part)
    json.dump({"licence": "CC0 1.0", "property": "P1618", "rows": all_rows},
              open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("total", len(all_rows))

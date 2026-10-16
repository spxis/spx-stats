#!/usr/bin/env python3
"""Read P27, P19, P17 and P297 for meigen athlete QIDs from Wikidata (CC0).

Writes db/seed/wikidata_meigen_claim.csv (qid, prop, n, rank, value_qid, value_text).
215 maps unique P27 → nationality_code and P19 → P17/P297 → birth_country_code.
One request every 2 s, 50 ids at a time. Never prints an entity JSON dump.

  python3 -I scripts/wikidata_meigen/fetch_claims.py
"""
from __future__ import annotations

import csv
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ATHLETES = REPO / "db/seed/wikidata_meigen_athlete.csv"
OUT = REPO / "db/seed/wikidata_meigen_claim.csv"
UA = {"User-Agent": "spx-stats/meigen-claims (https://github.com/spxis/spx-stats)"}
KEEP_PERSON = {"P27", "P19"}
KEEP_PLACE = {"P17", "P297"}


def api(**p):
    url = "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({**p, "format": "json"})
    for n in range(12):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code not in (429, 503, 504):
                raise
            time.sleep(int(e.headers.get("Retry-After") or 20) + 5 + (n % 5) * 5)
    raise SystemExit("wbgetentities gave up")


def entity_id(snak: dict) -> str | None:
    if snak.get("snaktype") != "value" or snak.get("datatype") != "wikibase-item":
        return None
    v = snak.get("datavalue", {}).get("value") or {}
    q = v.get("id")
    return q if isinstance(q, str) and q.startswith("Q") else None


def string_val(snak: dict) -> str | None:
    if snak.get("snaktype") != "value":
        return None
    v = snak.get("datavalue", {}).get("value")
    return v if isinstance(v, str) and v else None


def take_claims(ent: dict, keep: set[str]) -> list[tuple[str, str, str, str | None, str | None]]:
    out = []
    qid = ent.get("id")
    if not isinstance(qid, str) or not qid.startswith("Q"):
        return out
    claims = ent.get("claims") or {}
    for prop in sorted(keep):
        n = 0
        for c in claims.get(prop, []):
            rank = c.get("rank") or "normal"
            if rank == "deprecated":
                continue
            snak = c.get("mainsnak") or {}
            vq, vt = entity_id(snak), string_val(snak)
            if vq is None and vt is None:
                continue
            out.append((qid, prop, str(n), rank, vq, vt))
            n += 1
    return out


def fetch_ids(ids: list[str], keep: set[str]) -> tuple[list[tuple[str, str, str, str | None, str | None]], dict[str, dict]]:
    rows = []
    ents: dict[str, dict] = {}
    for i in range(0, len(ids), 50):
        time.sleep(2)
        chunk = ids[i:i + 50]
        data = api(action="wbgetentities", ids="|".join(chunk), props="claims")
        for qid, ent in (data.get("entities") or {}).items():
            if not isinstance(ent, dict) or ent.get("missing") is not None:
                continue
            ents[qid] = ent
            rows.extend(take_claims(ent, keep))
        print(f"fetched {min(i + 50, len(ids))}/{len(ids)}", flush=True)
    return rows, ents


def main() -> int:
    qids = []
    seen = set()
    with ATHLETES.open(encoding="utf-8", newline="") as fh:
        for rec in csv.DictReader(fh):
            q = rec.get("qid", "")
            if q.startswith("Q") and q not in seen:
                seen.add(q)
                qids.append(q)
    if not qids:
        print(f"no qids in {ATHLETES}", file=sys.stderr)
        return 2
    rows, _ = fetch_ids(qids, KEEP_PERSON)
    extra = []
    for qid, prop, _n, _rank, vq, _vt in rows:
        if vq and vq not in seen:
            seen.add(vq)
            extra.append(vq)
    extra_rows = []
    if extra:
        extra_rows, extra_ents = fetch_ids(extra, KEEP_PLACE)
        more = []
        for _qid, prop, _n, _rank, vq, _vt in extra_rows:
            if prop == "P17" and vq and vq not in seen:
                seen.add(vq)
                more.append(vq)
        if more:
            more_rows, _ = fetch_ids(more, KEEP_PLACE)
            extra_rows.extend(more_rows)
        del extra_ents
    rows.extend(extra_rows)
    rows.sort(key=lambda r: (int(r[0][1:]), r[1], int(r[2])))
    with OUT.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["qid", "prop", "n", "rank", "value_qid", "value_text"])
        for qid, prop, n, rank, vq, vt in rows:
            w.writerow([qid, prop, n, rank, vq or "", vt or ""])
    people_p27 = sum(1 for r in rows if r[1] == "P27" and r[0] in {q for q in qids})
    print(f"wrote {len(rows)} claims for {len(qids)} people ({people_p27} P27) to {OUT.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
